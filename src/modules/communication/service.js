const Message = require('../../models/Message');
const AppError = require('../../utils/AppError');
const mongoose = require('mongoose');

/**
 * Communication Service — messaging system.
 */
class CommunicationService {
  static async send(data) {
    const message = await Message.create(data);
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
