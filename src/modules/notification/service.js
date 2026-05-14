const Notification = require('../../models/Notification');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');
const FcmService = require('../../utils/fcm');

/**
 * Notification Service — in-app notification management.
 */
class NotificationService {
  /**
   * Create a notification for a user.
   * Supports optional contentType and contentUrl for rich notifications.
   */
  static async create(userId, { title, message, type = 'info', contentType = 'text', contentUrl = null, metadata = null, skipPush = false }) {
    const notification = await Notification.create({ userId, title, message, type, contentType, contentUrl, metadata });
    if (!skipPush) {
      FcmService.sendToUser(userId, {
        title,
        body: message,
        url: metadata?.url || contentUrl || '/',
        data: { notificationId: notification._id, type },
      }).catch(() => {});
    }
    return notification;
  }

  /**
   * Get notifications for a user (paginated, newest first).
   */
  static async getByUser(userId, { page = 1, limit = 20 } = {}) {
    const skip = (page - 1) * limit;
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Notification.countDocuments({ userId }),
      Notification.countDocuments({ userId, isRead: false }),
    ]);
    return { notifications, total, unreadCount, page, limit };
  }

  /**
   * Mark a single notification as read.
   */
  static async markRead(notificationId, userId) {
    if (!mongoose.isValidObjectId(notificationId)) throw new AppError('Invalid notification ID', 400);
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, userId }, { isRead: true }, { new: true }
    );
    if (!notification) throw new AppError('Notification not found', 404);
    return notification;
  }

  /**
   * Mark all notifications as read for a user.
   */
  static async markAllRead(userId) {
    const result = await Notification.updateMany({ userId, isRead: false }, { isRead: true });
    return { updated: result.modifiedCount };
  }

  /**
   * Get unread count for a user.
   */
  static async getUnreadCount(userId) {
    const count = await Notification.countDocuments({ userId, isRead: false });
    return { unreadCount: count };
  }

  /**
   * Broadcast notification to a target group.
   *
   * @param {Object} opts
   * @param {string} opts.target - 'all' | 'class' | 'student' | 'parent' | 'faculty'
   * @param {string} [opts.classId] - required when target='class'
   * @param {string} [opts.studentId] - required when target='student'
   * @param {string} opts.title
   * @param {string} opts.message
   * @param {string} [opts.type] - info | success | warning | error
   * @param {string} [opts.contentType] - text | image | file | link
   * @param {string} [opts.contentUrl] - URL for image/file/link
   * @param {Object} [opts.metadata]
   * @returns {{ sent: number, target: string }}
   */
  static async broadcast({ target, classId, studentId, title, message, type = 'info', contentType = 'text', contentUrl = null, metadata = null }) {
    const User = require('../../models/User');
    const Student = require('../../models/Student');
    const Parent = require('../../models/Parent');

    let userIds = [];

    switch (target) {
      case 'all': {
        const users = await User.find({ isActive: true }).select('_id').lean();
        userIds = users.map((u) => u._id);
        break;
      }
      case 'faculty': {
        const users = await User.find({ role: 'faculty', isActive: true }).select('_id').lean();
        userIds = users.map((u) => u._id);
        break;
      }
      case 'parent': {
        const users = await User.find({ role: 'parent', isActive: true }).select('_id').lean();
        userIds = users.map((u) => u._id);
        break;
      }
      case 'class': {
        if (!classId) throw new AppError('classId is required for class target', 400);
        // Get parent user IDs linked to students of this class
        const students = await Student.find({ classId, isActive: true }).select('_id parentId').lean();
        const parentIds = students.map((s) => s.parentId).filter(Boolean);
        const parents = await Parent.find({ _id: { $in: parentIds } }).select('userId').lean();
        userIds = parents.map((p) => p.userId).filter(Boolean);
        break;
      }
      case 'student': {
        if (!studentId) throw new AppError('studentId is required for student target', 400);
        const student = await Student.findById(studentId).select('parentId').lean();
        if (student?.parentId) {
          const parent = await Parent.findById(student.parentId).select('userId').lean();
          if (parent?.userId) userIds = [parent.userId];
        }
        break;
      }
      default:
        throw new AppError(`Unknown target: ${target}`, 400);
    }

    if (!userIds.length) return { sent: 0, target };

    // Bulk insert
    const docs = userIds.map((uid) => ({
      userId: uid,
      title,
      message,
      type,
      contentType,
      contentUrl,
      metadata,
      isRead: false,
    }));

    await Notification.insertMany(docs, { ordered: false });
    FcmService.sendToUsers(userIds, {
      title,
      body: message,
      url: metadata?.url || contentUrl || '/',
      data: { type, target },
    }).catch(() => {});
    return { sent: docs.length, target };
  }

  /**
   * Send SMS notification (placeholder — integrate Twilio/SNS in production).
   */
  static async sendSMS(phone, message) {
    if (!phone) return;
    console.log(`\n📱 [SMS] To: ${phone}`);
    console.log(`✉️  Message: ${message}\n`);
    return true;
  }
}

module.exports = NotificationService;
