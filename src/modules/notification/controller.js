const NotificationService = require('./service');
const ApiResponse = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const User = require('../../models/User');

class NotificationController {
  static async getNotifications(req, res, next) {
    try {
      const { page, limit } = req.query;
      const data = await NotificationService.getByUser(req.user._id, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
      });
      return ApiResponse.success(res, data, 'Notifications fetched');
    } catch (error) {
      next(error);
    }
  }

  static async getUnreadCount(req, res, next) {
    try {
      const data = await NotificationService.getUnreadCount(req.user._id);
      return ApiResponse.success(res, data, 'Unread count fetched');
    } catch (error) {
      next(error);
    }
  }

  static async markRead(req, res, next) {
    try {
      const data = await NotificationService.markRead(req.params.id, req.user._id);
      return ApiResponse.success(res, data, 'Notification marked as read');
    } catch (error) {
      next(error);
    }
  }

  static async markAllRead(req, res, next) {
    try {
      const data = await NotificationService.markAllRead(req.user._id);
      return ApiResponse.success(res, data, 'All notifications marked as read');
    } catch (error) {
      next(error);
    }
  }

  static async broadcast(req, res, next) {
    try {
      const { target, classId, studentId, title, message, type, contentType, contentUrl, metadata } = req.body;
      const result = await NotificationService.broadcast({ target, classId, studentId, title, message, type, contentType, contentUrl, metadata });
      return ApiResponse.success(res, result, `Notification sent to ${result.sent} users`);
    } catch (error) {
      next(error);
    }
  }

  /** Save / register FCM device token for the current user */
  static async saveDeviceToken(req, res, next) {
    try {
      const { token, platform } = req.body;
      if (!token) throw new AppError('token is required', 400);

      const user = await User.findById(req.user._id);
      if (!user) throw new AppError('User not found', 404);

      // Store as array; dedupe
      if (!user.fcmTokens) user.fcmTokens = [];
      if (!user.fcmTokens.includes(token)) {
        user.fcmTokens.push(token);
        // Keep last 5 tokens only
        if (user.fcmTokens.length > 5) user.fcmTokens = user.fcmTokens.slice(-5);
        await user.save();
      }

      return ApiResponse.success(res, { registered: true }, 'Device token saved');
    } catch (error) {
      next(error);
    }
  }

  /** Admin-only: send a push test to a user */
  static async sendTestNotification(req, res, next) {
    try {
      const { userId, title, body, url } = req.body;
      if (!userId || !title || !body) throw new AppError('userId, title and body are required', 400);

      const targetUser = await User.findById(userId);
      if (!targetUser) throw new AppError('Target user not found', 404);

      const tokens = targetUser.fcmTokens || [];
      if (!tokens.length) {
        return ApiResponse.success(res, { sent: 0, reason: 'No device tokens for this user' }, 'No tokens');
      }

      const FcmService = require('../../utils/fcm');
      const pushResult = await FcmService.sendToUser(userId, { title, body, url });

      // Also create an in-app notification
      await NotificationService.create(userId, { title, message: body, type: 'info', skipPush: true });

      return ApiResponse.success(res, { sent: pushResult.sent || 0, tokens: tokens.length }, 'Test notification sent');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = NotificationController;
