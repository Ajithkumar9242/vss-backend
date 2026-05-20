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

      user.fcmTokens = [...(user.fcmTokens || []).filter((item) => item !== token), token].slice(-5);
      await user.save();

      console.log(`[Notifications] Device token saved for user ${user._id} (${platform || 'web'}): ${user.fcmTokens.length} token(s)`);

      return ApiResponse.success(res, { registered: true }, 'Device token saved');
    } catch (error) {
      next(error);
    }
  }

  /** Admin-only: send a push test to a user */
  static async sendTestNotification(req, res, next) {
    try {
      const { userId, title, body, message, url } = req.body;
      const targetUserId = userId || req.user._id;
      const notificationTitle = title || 'VMS School ERP test';
      const notificationBody = body || message || 'Push notifications are working.';
      const canTargetOtherUsers = ['super_admin', 'admin', 'principal'].includes(req.user.role);
      if (userId && userId.toString() !== req.user._id.toString() && !canTargetOtherUsers) {
        throw new AppError('You can only send a test notification to yourself.', 403);
      }

      console.log(`[Notifications] Test notification requested by ${req.user._id} for ${targetUserId}`);

      const targetUser = await User.findById(targetUserId);
      if (!targetUser) throw new AppError('Target user not found', 404);

      const tokens = targetUser.fcmTokens || [];
      const FcmService = require('../../utils/fcm');
      const notification = await NotificationService.create(targetUserId, {
        title: notificationTitle,
        message: notificationBody,
        type: 'info',
        metadata: { url: url || '/', module: 'notification-test' },
        skipPush: true,
      });
      const pushResult = await FcmService.sendToUser(targetUserId, {
        title: notificationTitle,
        body: notificationBody,
        url: url || '/',
        data: { notificationId: notification._id, type: 'info' },
      });

      return ApiResponse.success(res, {
        sent: pushResult.sent || 0,
        failed: pushResult.failed || 0,
        skipped: !!pushResult.skipped,
        tokens: tokens.length,
        notificationId: notification._id,
      }, 'Test notification sent');
    } catch (error) {
      next(error);
    }
  }
}

module.exports = NotificationController;
