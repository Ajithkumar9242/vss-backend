const AuthService = require('./service');
const OtpService  = require('./otpService');
const ApiResponse = require('../../utils/apiResponse');

/**
 * Auth Controller — handles HTTP request/response.
 * Delegates all business logic to AuthService / OtpService.
 */
class AuthController {
  /** POST /api/auth/login — email+password (admin/faculty/legacy parent) */
  static async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const { user, token } = await AuthService.loginUser(email, password);
      return ApiResponse.success(res, { user, token }, 'Login successful');
    } catch (error) { next(error); }
  }

  /** GET /api/auth/me */
  static async getMe(req, res, next) {
    try {
      const user = await AuthService.getCurrentUser(req.user._id);
      return ApiResponse.success(res, { user }, 'User profile retrieved');
    } catch (error) { next(error); }
  }

  /** PATCH /api/auth/change-password */
  static async changePassword(req, res, next) {
    try {
      const { oldPassword, newPassword } = req.body;
      const result = await AuthService.changePassword(req.user._id, oldPassword, newPassword);
      return ApiResponse.success(res, result, result.message);
    } catch (error) { next(error); }
  }

  // ═══════════════════════════════════════════════════════════
  //  OTP / PHONE LOGIN (parent)
  // ═══════════════════════════════════════════════════════════

  /** POST /api/auth/otp/send */
  static async sendOtp(req, res, next) {
    try {
      const { phone } = req.body;
      const result = await OtpService.sendOtp(phone?.replace(/\D/g, ''));
      return ApiResponse.success(res, result, result.message);
    } catch (error) { next(error); }
  }

  /** POST /api/auth/otp/verify */
  static async verifyOtp(req, res, next) {
    try {
      const { phone, otp } = req.body;
      const result = await OtpService.verifyOtp(phone?.replace(/\D/g, ''), otp, 'parent');
      return ApiResponse.success(res, {
        user:         result.user,
        token:        result.accessToken,
        refreshToken: result.refreshToken,
      }, 'Login successful');
    } catch (error) { next(error); }
  }

  // ═══════════════════════════════════════════════════════════
  //  FACULTY OTP LOGIN
  // ═══════════════════════════════════════════════════════════

  /** POST /api/auth/faculty/otp/send */
  static async sendFacultyOtp(req, res, next) {
    try {
      const { phone } = req.body;
      const result = await OtpService.sendOtp(phone?.replace(/\D/g, ''), 'faculty');
      return ApiResponse.success(res, result, result.message);
    } catch (error) { next(error); }
  }

  /** POST /api/auth/faculty/otp/verify */
  static async verifyFacultyOtp(req, res, next) {
    try {
      const { phone, otp } = req.body;
      const result = await OtpService.verifyOtp(phone?.replace(/\D/g, ''), otp, 'faculty');
      return ApiResponse.success(res, {
        user:         result.user,
        token:        result.accessToken,
        refreshToken: result.refreshToken,
      }, 'Faculty login successful');
    } catch (error) { next(error); }
  }

  /** POST /api/auth/refresh */
  static async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        const AppError = require('../../utils/AppError');
        throw new AppError('Refresh token is required', 400);
      }
      const result = await OtpService.refreshAccessToken(refreshToken);
      return ApiResponse.success(res, { token: result.accessToken }, 'Token refreshed');
    } catch (error) { next(error); }
  }

  /** POST /api/auth/logout */
  static async logout(req, res, next) {
    try {
      const userId = req.user?._id;
      if (userId) await OtpService.logout(userId);
      return ApiResponse.success(res, {}, 'Logged out successfully');
    } catch (error) { next(error); }
  }

  /** GET /api/auth/check-user */
  static async checkUser(req, res, next) {
    try {
      const { identifier } = req.query;
      if (!identifier) {
        return res.status(200).json({ user_found: false, identifier: '' });
      }

      const User = require('../../models/User');
      const trimmedIdentifier = identifier.trim();
      const cleanedPhone = trimmedIdentifier.replace(/\D/g, '');
      
      let searchQueries = [
        { email: trimmedIdentifier.toLowerCase() },
        { phone: trimmedIdentifier }
      ];

      if (cleanedPhone) {
        searchQueries.push({ phone: cleanedPhone });
        if (cleanedPhone.length === 10) {
          searchQueries.push({ phone: '91' + cleanedPhone });
          searchQueries.push({ phone: '+' + '91' + cleanedPhone });
        } else if (cleanedPhone.length === 12 && cleanedPhone.startsWith('91')) {
          searchQueries.push({ phone: cleanedPhone.substring(2) });
          searchQueries.push({ phone: '+' + cleanedPhone });
        }
      }

      const user = await User.findOne({ $or: searchQueries });
      
      return res.status(200).json({
        user_found: !!user,
        identifier
      });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/auth/send-otp */
  static async sendOtpGeneral(req, res, next) {
    try {
      const { phone } = req.body;
      const result = await OtpService.sendOtpGeneral(phone);
      return ApiResponse.success(res, result, result.message);
    } catch (error) { next(error); }
  }

  /** POST /api/auth/verify-otp */
  static async verifyOtpGeneral(req, res, next) {
    try {
      const { phone, otp } = req.body;
      const result = await OtpService.verifyOtpGeneral(phone, otp);
      return ApiResponse.success(res, {
        user:         result.user,
        token:        result.token,
        refreshToken: result.refreshToken,
      }, 'Login successful');
    } catch (error) { next(error); }
  }
}

module.exports = AuthController;
