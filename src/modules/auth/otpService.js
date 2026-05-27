const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const OtpSession = require('../../models/OtpSession');
const User       = require('../../models/User');
const Parent     = require('../../models/Parent');
const AppError   = require('../../utils/AppError');

// ─── Configuration ────────────────────────────────────────────────────────────
const OTP_TTL_MINUTES = 5;        // OTP expires after this many minutes
const OTP_MAX_ATTEMPTS = 5;       // max wrong-OTP attempts before session is killed
const COOLDOWN_MS = 30_000;       // 30s cooldown between send requests (per phone)
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRES_IN || '180d';
const STATIC_OTP = '123456';

// In-memory cooldown store (per-process; resets on server restart)
const cooldowns = new Map();

/**
 * OtpService
 *
 * Pure backend OTP authentication using static OTP "123456".
 * No MSG91 or external providers.
 */
class OtpService {

  /** Print OTP clearly to the backend terminal so developers can use it for testing. */
  static _printOtp(phone) {
    console.log(`\n╔══════════════════════════════╗`);
    console.log(`║${'  OTP'.padEnd(30)}║`);
    console.log(`║${('  Phone: ' + phone).padEnd(30)}║`);
    console.log(`║${('  OTP:   ' + STATIC_OTP).padEnd(30)}║`);
    console.log(`╚══════════════════════════════╝\n`);
  }

  /**
   * Generate an access JWT.
   */
  static generateAccessToken(userId, role) {
    return jwt.sign(
      { id: userId, role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );
  }

  /**
   * Generate a long-lived refresh token and store its hash on the User doc.
   */
  static async generateAndStoreRefreshToken(userId) {
    const refreshToken = jwt.sign(
      { id: userId, type: 'refresh' },
      REFRESH_SECRET,
      { expiresIn: REFRESH_EXPIRY }
    );
    const hash = await bcrypt.hash(refreshToken, 8);
    await User.findByIdAndUpdate(userId, { refreshTokenHash: hash });
    return refreshToken;
  }

  /**
   * Validate refresh token and issue a new access token.
   */
  static async refreshAccessToken(refreshToken) {
    let payload;
    try {
      payload = jwt.verify(refreshToken, REFRESH_SECRET);
    } catch {
      throw new AppError('Invalid or expired refresh token. Please log in again.', 401);
    }
    const user = await User.findById(payload.id).select('+refreshTokenHash');
    if (!user || !user.refreshTokenHash) {
      throw new AppError('Session expired. Please log in again.', 401);
    }
    const isValid = await bcrypt.compare(refreshToken, user.refreshTokenHash);
    if (!isValid) throw new AppError('Session expired. Please log in again.', 401);
    return { accessToken: OtpService.generateAccessToken(user._id, user.role) };
  }

  /**
   * Logout — invalidate stored refresh token.
   */
  static async logout(userId) {
    await User.findByIdAndUpdate(userId, { refreshTokenHash: null });
    return { message: 'Logged out successfully' };
  }

  // ─── Core OTP Methods ─────────────────────────────────────────────────────

  /**
   * Send OTP — Parent or Faculty phone login.
   *
   * @param {string} phone  10-digit phone number (digits only)
   * @param {'parent'|'faculty'} [type='parent']
   */
  static async sendOtp(phone, type = 'parent') {
    // ── 1. Sanitise & validate phone ──────────────────────────────────────
    const cleanedPhone = phone ? phone.replace(/\D/g, '') : '';
    if (!cleanedPhone || !/^\d{10}$/.test(cleanedPhone)) {
      throw new AppError('Please provide a valid 10-digit mobile number.', 400);
    }
    const normalized = '91' + cleanedPhone; // for cooldown key

    console.log(`[OTP] Send request for ${normalized} (type: ${type})`);

    // ── 2. Cooldown check ─────────────────────────────────────────────────
    const now = Date.now();
    const lastSent = cooldowns.get(normalized);
    if (lastSent && (now - lastSent) < COOLDOWN_MS) {
      const secondsLeft = Math.ceil((COOLDOWN_MS - (now - lastSent)) / 1000);
      const err = new AppError(`Please wait ${secondsLeft}s before requesting a new OTP.`, 429);
      err.code = 'OTP_COOLDOWN';
      throw err;
    }

    // ── 3. Check account exists ───────────────────────────────────────────
    const sessionKey = type === 'faculty' ? `faculty:${cleanedPhone}` : cleanedPhone;

    if (type === 'faculty') {
      const Faculty = require('../../models/Faculty');
      const faculty = await Faculty.findOne({ phone: cleanedPhone }).select('_id');
      if (!faculty) {
        const err = new AppError('This number is not linked to any faculty account.', 400);
        err.code = 'PHONE_NOT_LINKED';
        throw err;
      }
    } else {
      const parent = await Parent.findOne({ phone: cleanedPhone }).select('_id');
      if (!parent) {
        const err = new AppError('This number is not linked to any parent account.', 400);
        err.code = 'PHONE_NOT_LINKED';
        throw err;
      }
    }

    // ── 4. Set cooldown ────────────────────────────────────────────────────
    cooldowns.set(normalized, now);

    // ── 5. Reuse unexpired session if one exists ───────────────────────────
    const existingSession = await OtpSession.findOne({ phone: sessionKey, verified: false });
    if (existingSession && existingSession.expiresAt > new Date()) {
      if (!existingSession.otpRaw || existingSession.otpRaw !== STATIC_OTP) {
        existingSession.otpRaw = STATIC_OTP;
        existingSession.otpHash = await bcrypt.hash(STATIC_OTP, 10);
        await existingSession.save();
      }
      OtpService._printOtp(cleanedPhone);
      return { message: 'OTP sent successfully. Valid for 5 minutes.' };
    }

    // ── 6. Store static OTP ───────────────────────────────────────────────
    const otpHash = await bcrypt.hash(STATIC_OTP, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await OtpSession.findOneAndUpdate(
      { phone: sessionKey },
      { phone: sessionKey, otpHash, otpRaw: STATIC_OTP, expiresAt, attempts: 0, verified: false },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // ── 7. Print to terminal ───────────────────────────────────────────────
    OtpService._printOtp(cleanedPhone);

    return { message: 'OTP sent successfully. Valid for 5 minutes.' };
  }

  /**
   * Verify OTP — Parent or Faculty phone login.
   *
   * @param {string} phone  10-digit phone (digits only)
   * @param {string} otp    6-digit OTP entered by user
   * @param {'parent'|'faculty'} [type='parent']
   * @returns {{ user, accessToken, refreshToken }}
   */
  static async verifyOtp(phone, otp, type = 'parent') {
    try {
      const cleanedPhone = phone ? phone.replace(/\D/g, '') : '';
      if (!cleanedPhone || !otp) {
        throw new AppError('Phone and OTP are required.', 400);
      }

      console.log(`[OTP] Verify request for ${cleanedPhone} (type: ${type})`);

      const sessionKey = type === 'faculty' ? `faculty:${cleanedPhone}` : cleanedPhone;

      // ── 1. Load session ────────────────────────────────────────────────
      const session = await OtpSession.findOne({ phone: sessionKey, verified: false }).select('+otpHash');
      if (!session) {
        const err = new AppError('No pending OTP found. Please request a new OTP.', 400);
        err.code = 'NO_PENDING_OTP';
        throw err;
      }

      // ── 2. Check expiry ────────────────────────────────────────────────
      if (new Date() > session.expiresAt) {
        await session.deleteOne();
        throw new AppError('OTP has expired. Please request a new one.', 400);
      }

      // ── 3. Check attempt limit ─────────────────────────────────────────
      if (session.attempts >= OTP_MAX_ATTEMPTS) {
        await session.deleteOne();
        throw new AppError('Too many failed attempts. Please request a new OTP.', 429);
      }

      // ── 4. Verify OTP ──────────────────────────────────────────────────
      const isValid = (otp === STATIC_OTP) || (await session.compareOtp(otp));
      if (!isValid) {
        session.attempts += 1;
        await session.save();
        const remaining = OTP_MAX_ATTEMPTS - session.attempts;
        throw new AppError(
          remaining > 0
            ? `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Too many failed attempts. Please request a new OTP.',
          400
        );
      }

      // ── 5. Invalidate session ──────────────────────────────────────────
      session.verified = true;
      await session.save();

      // ── 6. Resolve user record ─────────────────────────────────────────
      let user;

      if (type === 'faculty') {
        const Faculty = require('../../models/Faculty');
        const faculty = await Faculty.findOne({ phone: cleanedPhone });
        if (!faculty) throw new AppError('Faculty account not found for this number.', 404);

        user = faculty.userId ? await User.findById(faculty.userId) : null;
        if (!user) {
          const AuthService = require('./service');
          user = await AuthService.createFacultyUser(faculty);
          if (!user) throw new AppError('Could not create faculty account. Contact admin.', 500);
          await Faculty.findByIdAndUpdate(faculty._id, { userId: user._id });
        }
      } else {
        const parent = await Parent.findOne({ phone: cleanedPhone });
        if (!parent) throw new AppError('Parent account not found for this number.', 404);

        user = parent.userId
          ? await User.findById(parent.userId)
          : await User.findOne({ phone: cleanedPhone, role: 'parent' });

        if (!user) {
          const AuthService = require('./service');
          user = await AuthService.createParentUser(parent, null);
          if (!user) throw new AppError('Could not create parent account. Contact admin.', 500);
        }
      }

      // ── 7. Generate tokens ─────────────────────────────────────────────
      const accessToken  = OtpService.generateAccessToken(user._id, user.role);
      const refreshToken = await OtpService.generateAndStoreRefreshToken(user._id);

      // ── 8. Enrich user ─────────────────────────────────────────────────
      let enrichedUser;
      try {
        const AuthService = require('./service');
        enrichedUser = await AuthService.getCurrentUser(user._id);
      } catch {
        enrichedUser = user.toObject ? user.toObject() : { ...user };
      }
      delete enrichedUser.password;

      console.log(`[OTP] Verification successful for ${cleanedPhone}`);
      return { user: enrichedUser, accessToken, refreshToken };

    } catch (error) {
      console.log(`[OTP] Verification failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * sendOtpGeneral — for the general OTP login page (any role).
   *
   * @param {string} phone  raw phone string from request body
   */
  static async sendOtpGeneral(phone) {
    if (!phone) throw new AppError('Phone number is required.', 400);

    const cleanedPhone = phone.replace(/\D/g, '');
    if (!/^\d{10}$/.test(cleanedPhone)) {
      throw new AppError('Please provide a valid 10-digit mobile number.', 400);
    }
    const normalized = '91' + cleanedPhone;

    console.log(`[OTP] General send request for ${normalized}`);

    // ── Cooldown ───────────────────────────────────────────────────────────
    const now = Date.now();
    const lastSent = cooldowns.get(normalized);
    if (lastSent && (now - lastSent) < COOLDOWN_MS) {
      const secondsLeft = Math.ceil((COOLDOWN_MS - (now - lastSent)) / 1000);
      const err = new AppError(`Please wait ${secondsLeft}s before requesting a new OTP.`, 429);
      err.code = 'OTP_COOLDOWN';
      throw err;
    }

    // ── User lookup (broad search) ─────────────────────────────────────────
    const searchPhones = [cleanedPhone, '91' + cleanedPhone, '+91' + cleanedPhone];
    const user = await User.findOne({ phone: { $in: searchPhones } });
    if (!user) {
      const err = new AppError('This number is not registered with the school.', 404);
      err.code = 'PHONE_NOT_LINKED';
      throw err;
    }
    if (!user.isActive) {
      throw new AppError('This account is deactivated. Contact admin.', 403);
    }

    cooldowns.set(normalized, now);

    // ── Reuse unexpired session ────────────────────────────────────────────
    const existingSession = await OtpSession.findOne({ phone: cleanedPhone, verified: false });
    if (existingSession && existingSession.expiresAt > new Date()) {
      if (!existingSession.otpRaw || existingSession.otpRaw !== STATIC_OTP) {
        existingSession.otpRaw = STATIC_OTP;
        existingSession.otpHash = await bcrypt.hash(STATIC_OTP, 10);
        await existingSession.save();
      }
      OtpService._printOtp(cleanedPhone);
      return { success: true, message: 'OTP sent successfully. Valid for 5 minutes.' };
    }

    // ── Store static OTP ───────────────────────────────────────────────────
    const otpHash = await bcrypt.hash(STATIC_OTP, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    await OtpSession.findOneAndUpdate(
      { phone: cleanedPhone },
      { phone: cleanedPhone, otpHash, otpRaw: STATIC_OTP, expiresAt, attempts: 0, verified: false },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    OtpService._printOtp(cleanedPhone);
    return { success: true, message: 'OTP sent successfully. Valid for 5 minutes.' };
  }

  /**
   * verifyOtpGeneral — verify and login for general OTP login page.
   *
   * @param {string} phone  raw phone from request body
   * @param {string} otp    6-digit OTP entered by user
   * @returns {{ user, token, refreshToken }}
   */
  static async verifyOtpGeneral(phone, otp) {
    try {
      if (!phone || !otp) throw new AppError('Phone and OTP are required.', 400);

      const cleanedPhone = phone.replace(/\D/g, '');
      console.log(`[OTP] General verify request for ${cleanedPhone}`);

      // ── User lookup ────────────────────────────────────────────────────
      const searchPhones = [cleanedPhone, '91' + cleanedPhone, '+91' + cleanedPhone];
      const user = await User.findOne({ phone: { $in: searchPhones } });
      if (!user) throw new AppError('User account not found for this number.', 404);
      if (!user.isActive) throw new AppError('This account is deactivated. Contact admin.', 403);

      // ── Load session ───────────────────────────────────────────────────
      const session = await OtpSession.findOne({ phone: cleanedPhone, verified: false }).select('+otpHash');
      if (!session) {
        const err = new AppError('No pending OTP found. Please request a new OTP.', 400);
        err.code = 'NO_PENDING_OTP';
        throw err;
      }

      // ── Expiry ─────────────────────────────────────────────────────────
      if (new Date() > session.expiresAt) {
        await session.deleteOne();
        throw new AppError('OTP has expired. Please request a new one.', 400);
      }

      // ── Attempt limit ──────────────────────────────────────────────────
      if (session.attempts >= OTP_MAX_ATTEMPTS) {
        await session.deleteOne();
        throw new AppError('Too many failed attempts. Please request a new OTP.', 429);
      }

      // ── Compare ────────────────────────────────────────────────────────
      const isValid = (otp === STATIC_OTP) || (await session.compareOtp(otp));
      if (!isValid) {
        session.attempts += 1;
        await session.save();
        const remaining = OTP_MAX_ATTEMPTS - session.attempts;
        throw new AppError(
          remaining > 0
            ? `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Too many failed attempts. Please request a new OTP.',
          400
        );
      }

      // ── Invalidate ─────────────────────────────────────────────────────
      session.verified = true;
      await session.save();

      // ── Tokens ─────────────────────────────────────────────────────────
      const accessToken  = OtpService.generateAccessToken(user._id, user.role);
      const refreshToken = await OtpService.generateAndStoreRefreshToken(user._id);

      let enrichedUser;
      try {
        const AuthService = require('./service');
        enrichedUser = await AuthService.getCurrentUser(user._id);
      } catch {
        enrichedUser = user.toObject ? user.toObject() : { ...user };
      }
      delete enrichedUser.password;

      console.log(`[OTP] Verification successful for ${cleanedPhone}`);
      return { user: enrichedUser, token: accessToken, refreshToken };

    } catch (error) {
      console.log(`[OTP] Verification failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = OtpService;
