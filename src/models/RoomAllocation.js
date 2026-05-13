const mongoose = require('mongoose');

const roomAllocationSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: [true, 'Student is required'],
    },
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: [true, 'Room is required'],
    },
    bedNumber: {
      type: Number,
      required: [true, 'Bed number is required'],
      min: 1,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate active allocation for same student
roomAllocationSchema.index({ studentId: 1, isActive: 1 });
// Prevent duplicate bed in same room
roomAllocationSchema.index({ roomId: 1, bedNumber: 1, isActive: 1 }, { unique: true });

module.exports = mongoose.model('RoomAllocation', roomAllocationSchema);
