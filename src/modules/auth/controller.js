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
}

module.exports = AuthController;
