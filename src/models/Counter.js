const mongoose = require('mongoose');

/**
 * Counter — atomic sequence generator for admission numbers, roll numbers, etc.
 * Uses findOneAndUpdate with $inc for race-condition-safe increments.
 */
const counterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    sequence: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Counter', counterSchema);
