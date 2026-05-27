const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Message title is required'],
      trim: true,
      maxlength: 200,
    },
    content: {
      type: String,
      required: [true, 'Message content is required'],
      trim: true,
      maxlength: 2000,
    },
    targetType: {
      type: String,
      enum: ['all', 'class', 'student', 'faculty'],
      required: [true, 'Target type is required'],
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    sentBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    attachments: [
      {
        url: { type: String, required: true },
        publicId: { type: String },
        originalName: { type: String },
        mimeType: { type: String },
        size: { type: Number },
        uploadedAt: { type: Date, default: Date.now },
      }
    ],
  },
  { timestamps: true }
);

messageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
