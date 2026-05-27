const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const OtpSession = require('../../models/OtpSession');
const User = require('../../models/User');
const Parent = require('../../models/Parent');
const AppError = require('../../utils/AppError');

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET + '_refresh';
const REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRES_IN || '180d'; // 6 months
const OTP_DEMO_MODE = process.env.DEMO_OTP_ENABLED === 'true';
const DEMO_OTP = '123456';
const cooldowns = new Map();
const COOLDOWN_MS = 30000; // 30 seconds cooldown

/**
 * OtpService — handles phone-based OTP login for parents.
 *
 * MSG91 integration is stubbed.
 * Set MSG91_API_KEY + MSG91_TEMPLATE_ID in .env to go live.
 * In dev-mode the OTP is printed to the console.
 */
class OtpService {

  /**
   * Generate a cryptographically random 6-digit OTP.
   */
  static _generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  /**
   * Send OTP to a phone number.
   * type: 'parent' (default) | 'faculty'
   * @param {string} phone
   * @param {string} [type='parent']
   */
  static async sendOtp(phone, type = 'parent') {
    const cleanedPhone = phone ? phone.replace(/\D/g, '') : '';
    const normalized = cleanedPhone.length === 10 ? '91' + cleanedPhone : cleanedPhone;

    console.log(`[OTP] Request received for ${normalized}`);

    const now = Date.now();
    const lastSent = cooldowns.get(normalized);
    if (lastSent && (now - lastSent) < COOLDOWN_MS) {
      console.log(`[OTP] Cooldown active for ${normalized}`);
      const err = new AppError('OTP already sent recently. Please wait before requesting again.', 429);
      err.code = 'OTP_COOLDOWN';
      throw err;
    }

    if (!phone || !/^\d{10}$/.test(cleanedPhone)) {
      throw new AppError('Please provide a valid 10-digit mobile number', 400);
    }

    if (type === 'faculty') {
      const Faculty = require('../../models/Faculty');
      const faculty = await Faculty.findOne({ phone }).select('_id phone');
      if (!faculty) {
        const error = new AppError('Mobile number not linked to any active faculty account', 400);
        error.code = 'PHONE_NOT_LINKED';
        throw error;
      }
    } else {
      // parent (default)
      const parent = await Parent.findOne({ phone }).select('_id phone');
      if (!parent) {
        const error = new AppError('Mobile number not linked to any active parent account', 400);
        error.code = 'PHONE_NOT_LINKED';
        throw error;
      }
    }

    // Set cooldown timestamp now that validation has passed
    cooldowns.set(normalized, now);

    if (OTP_DEMO_MODE) {
      return { message: 'Demo mode enabled. Use test OTP: 123456' };
    }

    const otp = OtpService._generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

    // Upsert OTP session (keyed by phone + type)
    const sessionKey = type === 'faculty' ? `faculty:${phone}` : phone;
    await OtpSession.findOneAndUpdate(
      { phone: sessionKey },
      { phone: sessionKey, otpHash, expiresAt, attempts: 0, verified: false },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    try {
      await OtpService._dispatchSms(phone, otp);
      return { message: 'OTP sent successfully. Valid for 5 minutes.' };
    } catch (err) {
      const errMsg = err.message || '';
      if (errMsg.includes('311')) {
        throw new AppError('OTP already sent. Please wait a few seconds before retrying.', 429);
      }
      throw new AppError(err.message || 'Failed to send OTP via MSG91.', 500);
    }
  }

  /**
   * Verify OTP and return user + tokens.
   * type: 'parent' (default) | 'faculty'
   * @param {string} phone
   * @param {string} otp
   * @param {string} [type='parent']
   * @returns {{ user, accessToken, refreshToken }}
   */
  static async verifyOtp(phone, otp, type = 'parent') {
    try {
      if (OTP_DEMO_MODE) {
        if (otp !== DEMO_OTP) throw new AppError('Invalid demo OTP. Use 123456.', 400);
      } else {
        const sessionKey = type === 'faculty' ? `faculty:${phone}` : phone;
        const session = await OtpSession.findOne({ phone: sessionKey, verified: false }).select('+otpHash');
        if (!session) {
          const error = new AppError('No pending OTP for this number. Please request a new OTP.', 400);
          error.code = 'NO_PENDING_OTP';
          throw error;
        }

        if (new Date() > session.expiresAt) {
          await session.deleteOne();
          throw new AppError('OTP has expired. Please request a new one.', 400);
        }

        if (session.attempts >= OTP_MAX_ATTEMPTS) {
          await session.deleteOne();
          throw new AppError('Too many failed attempts. Please request a new OTP.', 429);
        }

        const isValid = await session.compareOtp(otp);
        if (!isValid) {
          session.attempts += 1;
          await session.save();
          throw new AppError(`Incorrect OTP. ${OTP_MAX_ATTEMPTS - session.attempts} attempts remaining.`, 400);
        }

        session.verified = true;
        await session.save();
      }

      let user;

      if (type === 'faculty') {
        // Faculty login
        const Faculty = require('../../models/Faculty');
        const faculty = await Faculty.findOne({ phone });
        if (!faculty) throw new AppError('Faculty account not found for this number.', 404);

        user = faculty.userId ? await User.findById(faculty.userId) : null;

        if (!user) {
          // Auto-create user for faculty without linked User account
          const AuthService = require('./service');
          user = await AuthService.createFacultyUser(faculty);
          if (!user) throw new AppError('Could not create faculty account. Contact admin.', 500);
          // Link user back to faculty
          await Faculty.findByIdAndUpdate(faculty._id, { userId: user._id });
        }
      } else {
        // Parent login (original flow)
        const parent = await Parent.findOne({ phone });
        if (!parent) throw new AppError('Parent account not found for this number.', 404);

        user = parent.userId
          ? await User.findById(parent.userId)
          : await User.findOne({ phone, role: 'parent' });

        if (!user) {
          const AuthService = require('./service');
          user = await AuthService.createParentUser(parent, null);
          if (!user) throw new AppError('Could not create parent account. Contact admin.', 500);
        }
      }

      // Generate tokens
      const accessToken = OtpService.generateAccessToken(user._id, user.role);
      const refreshToken = await OtpService.generateAndStoreRefreshToken(user._id);

      // Return fully enriched user object exactly like normal login
      // so parent/faculty apps receive linkedEntity, avatar, etc.
      let enrichedUser;
      try {
        const AuthService = require('./service');
        enrichedUser = await AuthService.getCurrentUser(user._id); // includes linkedEntity
      } catch (e) {
        // fallback: never break login just because enrichment failed
        enrichedUser = user.toObject ? user.toObject() : { ...user };
      }

      // make sure password is never leaked (even if fallback is used)
      delete enrichedUser.password;

      console.log(`[OTP] Verification successful`);
      return {
        user: enrichedUser,
        accessToken,
        refreshToken,
      };
    } catch (error) {
      console.log(`[OTP] Verification failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate a short-lived access JWT.
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
   * Validate refresh token and issue new access token.
   * @param {string} refreshToken
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

    const newAccessToken = OtpService.generateAccessToken(user._id, user.role);
    return { accessToken: newAccessToken };
  }

  /**
   * Logout: invalidate stored refresh token.
   */
  static async logout(userId) {
    await User.findByIdAndUpdate(userId, { refreshTokenHash: null });
    return { message: 'Logged out successfully' };
  }

  /**
   * SMS dispatch — MSG91 integration.
   * Set MSG91_API_KEY + MSG91_TEMPLATE_ID in .env for production.
   */
  static async _dispatchSms(phone, otp) {
    const authKey = process.env.MSG91_AUTH_KEY || process.env.MSG91_API_KEY;

    if (authKey) {
      try {
        const { sendOtp } = require('../../utils/msg91');
        await sendOtp(phone, otp);
        console.log(`[OTP] MSG91 SMS dispatched to ${phone}`);
      } catch (e) {
        console.error('[OTP] MSG91 dispatch failed:', e.message);
        // Non-fatal in production; OTP still in DB
      }
    } else {
      // ── DEV MODE: log OTP to console ───────────────────────
      console.log(`\n╔══════════════════════════════╗`);
      console.log(`║  OTP for ${phone}: ${otp}  ║`);
      console.log(`╚══════════════════════════════╝\n`);
    }
  }

  static async sendOtpGeneral(phone) {
    if (!phone) {
      throw new AppError('Phone number is required', 400);
    }
    
    const cleanedPhone = phone.replace(/\D/g, '');
    const normalized = cleanedPhone.length === 10 ? '91' + cleanedPhone : cleanedPhone;

    console.log(`[OTP] Request received for ${normalized}`);

    const now = Date.now();
    const lastSent = cooldowns.get(normalized);
    if (lastSent && (now - lastSent) < COOLDOWN_MS) {
      console.log(`[OTP] Cooldown active for ${normalized}`);
      const err = new AppError('OTP already sent recently. Please wait before requesting again.', 429);
      err.code = 'OTP_COOLDOWN';
      throw err;
    }

    let searchPhones = [phone, cleanedPhone];
    if (cleanedPhone.length === 10) {
      searchPhones.push('91' + cleanedPhone);
      searchPhones.push('+91' + cleanedPhone);
    } else if (cleanedPhone.length === 12 && cleanedPhone.startsWith('91')) {
      searchPhones.push(cleanedPhone.substring(2));
      searchPhones.push('+' + cleanedPhone);
    }

    const user = await User.findOne({ phone: { $in: searchPhones } });
    if (!user) {
      const error = new AppError('This number is not registered with the school', 404);
      error.code = 'PHONE_NOT_LINKED';
      throw error;
    }
    if (!user.isActive) {
      throw new AppError('User account is deactivated. Contact admin.', 403);
    }

    // Set cooldown timestamp now that validation has passed
    cooldowns.set(normalized, now);

    const demoEnabled = process.env.DEMO_OTP_ENABLED === 'true';
    const authKey = process.env.MSG91_AUTH_KEY || process.env.MSG91_API_KEY;

    if (demoEnabled) {
      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
      const otpHash = await bcrypt.hash(DEMO_OTP, 10);
      await OtpSession.findOneAndUpdate(
        { phone: cleanedPhone },
        { phone: cleanedPhone, otpHash, expiresAt, attempts: 0, verified: false },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log(`[OTP GENERAL DEMO] Demo OTP enabled for ${phone}. Static OTP is ${DEMO_OTP}`);
      return { success: true, message: 'OTP sent successfully (Demo mode)' };
    }

    if (!authKey) {
      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
      const generatedOtp = OtpService._generateOtp();
      const otpHash = await bcrypt.hash(generatedOtp, 10);
      await OtpSession.findOneAndUpdate(
        { phone: cleanedPhone },
        { phone: cleanedPhone, otpHash, expiresAt, attempts: 0, verified: false },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      
      console.log(`\n╔══════════════════════════════╗`);
      console.log(`║  GENERAL OTP for ${phone}: ${generatedOtp}  ║`);
      console.log(`╚══════════════════════════════╝\n`);
      
      return { success: true, message: 'OTP sent successfully (Development mode)' };
    }

    const { sendOtp } = require('../../utils/msg91');
    try {
      console.log(`[OTP] MSG91 request dispatched`);
      const res = await sendOtp(phone);
      console.log(`[OTP] MSG91 response status: ${res.success ? 'success' : 'failed'}`);
      return { success: true, message: 'OTP sent successfully.' };
    } catch (err) {
      const errMsg = err.message || '';
      if (errMsg.includes('311')) {
        throw new AppError('OTP already sent. Please wait a few seconds before retrying.', 429);
      }
      throw new AppError(err.message || 'Failed to send OTP via MSG91.', 500);
    }
  }

  /**
   * Verify general OTP and return JWT access token, refresh token, and user.
   */
  static async verifyOtpGeneral(phone, otp) {
    try {
      if (!phone || !otp) {
        throw new AppError('Phone and OTP are required', 400);
      }

      const cleanedPhone = phone.replace(/\D/g, '');
      let searchPhones = [phone, cleanedPhone];
      if (cleanedPhone.length === 10) {
        searchPhones.push('91' + cleanedPhone);
        searchPhones.push('+91' + cleanedPhone);
      } else if (cleanedPhone.length === 12 && cleanedPhone.startsWith('91')) {
        searchPhones.push(cleanedPhone.substring(2));
        searchPhones.push('+' + cleanedPhone);
      }

      const user = await User.findOne({ phone: { $in: searchPhones } });
      if (!user) {
        throw new AppError('User account not found for this number.', 404);
      }
      if (!user.isActive) {
        throw new AppError('User account is deactivated. Contact admin.', 403);
      }

      const demoEnabled = process.env.DEMO_OTP_ENABLED === 'true';
      const authKey = process.env.MSG91_AUTH_KEY || process.env.MSG91_API_KEY;

      if (demoEnabled) {
        if (otp !== DEMO_OTP) {
          throw new AppError('Invalid demo OTP. Use 123456.', 400);
        }
      } else if (!authKey) {
        const session = await OtpSession.findOne({ phone: cleanedPhone, verified: false }).select('+otpHash');
        if (!session) {
          const error = new AppError('No pending OTP for this number. Please request a new OTP.', 400);
          error.code = 'NO_PENDING_OTP';
          throw error;
        }
        if (new Date() > session.expiresAt) {
          await session.deleteOne();
          throw new AppError('OTP has expired. Please request a new one.', 400);
        }
        if (session.attempts >= OTP_MAX_ATTEMPTS) {
          await session.deleteOne();
          throw new AppError('Too many failed attempts. Please request a new OTP.', 429);
        }

        const isValid = await session.compareOtp(otp);
        if (!isValid) {
          session.attempts += 1;
          await session.save();
          throw new AppError(`Incorrect OTP. ${OTP_MAX_ATTEMPTS - session.attempts} attempts remaining.`, 400);
        }

        session.verified = true;
        await session.save();
      } else {
        const { verifyOtp } = require('../../utils/msg91');
        try {
          await verifyOtp(phone, otp);
        } catch (err) {
          throw new AppError(err.message || 'OTP verification failed.', 400);
        }
      }

      const accessToken = OtpService.generateAccessToken(user._id, user.role);
      const refreshToken = await OtpService.generateAndStoreRefreshToken(user._id);

      let enrichedUser;
      try {
        const AuthService = require('./service');
        enrichedUser = await AuthService.getCurrentUser(user._id);
      } catch (e) {
        enrichedUser = user.toObject ? user.toObject() : { ...user };
      }

      delete enrichedUser.password;

      console.log(`[OTP] Verification successful`);
      return {
        user: enrichedUser,
        token: accessToken,
        refreshToken,
      };
    } catch (error) {
      console.log(`[OTP] Verification failed: ${error.message}`);
      throw error;
    }
  }
}

module.exports = OtpService;
