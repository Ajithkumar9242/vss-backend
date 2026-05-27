const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

/**
 * OtpSession — stores a pending OTP for parent phone-based login.
 * TTL index auto-deletes expired documents after 5 minutes.
 */
const otpSessionSchema = new mongoose.Schema({
  phone: {
    type: String,
    required: true,
    trim: true,
    index: true,
  },
  otpHash: {
    type: String,
    required: true,
    select: false, // never returned in queries by default
  },
  otpRaw: {
    type: String,
    default: null,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }, // TTL: MongoDB removes doc when expiresAt is reached
  },
  attempts: { type: Number, default: 0 },
  verified: { type: Boolean, default: false },
}, { timestamps: true });

// ─── Instance helpers ──────────────────────────────────────────
otpSessionSchema.methods.compareOtp = function (plainOtp) {
  return bcrypt.compare(String(plainOtp), this.otpHash);
};

module.exports = mongoose.model('OtpSession', otpSessionSchema);
