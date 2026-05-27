const Message = require('../../models/Message');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');

const NotificationService = require('../notification/service');

/**
 * Communication Service — messaging system.
 */
class CommunicationService {
  static async send(data) {
    const message = await Message.create(data);

    // Automatically trigger notification broadcast based on targetType
    try {
      const hasAttachments = data.attachments && data.attachments.length > 0;
      const firstAttachment = hasAttachments ? data.attachments[0] : null;

      let broadcastOpts = {
        title: data.title,
        message: data.content,
        type: 'info',
        contentType: hasAttachments ? 'file' : 'text',
        contentUrl: firstAttachment ? firstAttachment.url : null,
        metadata: {
          messageId: message._id,
          hasAttachments,
        }
      };

      if (data.targetType === 'all') {
        // Broadcast to parents
        await NotificationService.broadcast({
          ...broadcastOpts,
          target: 'parent',
        });
        // Broadcast to faculty
        await NotificationService.broadcast({
          ...broadcastOpts,
          target: 'faculty',
        });
      } else if (data.targetType === 'faculty') {
        // Broadcast to faculty
        await NotificationService.broadcast({
          ...broadcastOpts,
          target: 'faculty',
        });
      } else if (data.targetType === 'class') {
        await NotificationService.broadcast({
          ...broadcastOpts,
          target: 'class',
          classId: data.targetId,
        });
      } else if (data.targetType === 'student') {
        await NotificationService.broadcast({
          ...broadcastOpts,
          target: 'student',
          studentId: data.targetId,
        });
      }
    } catch (err) {
      console.error('Failed to broadcast automatic notification for communication:', err.message);
    }

    return Message.findById(message._id).populate('sentBy', 'name email');
  }

  static async getAll({ page = 1, limit = 20, targetType } = {}) {
    const filter = {};
    if (targetType) filter.targetType = targetType;

    const skip = (page - 1) * limit;
    const [messages, total] = await Promise.all([
      Message.find(filter)
        .populate('sentBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Message.countDocuments(filter),
    ]);

    return { messages, total, page, limit };
  }

  static async getById(messageId) {
    if (!mongoose.isValidObjectId(messageId)) {
      throw new AppError('Invalid message ID format', 400);
    }

    const message = await Message.findById(messageId)
      .populate('sentBy', 'name email');

    if (!message) throw new AppError('Message not found', 404);
    return message;
  }
}

module.exports = CommunicationService;
