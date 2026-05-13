const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 100,
    },
    email: {
      type: String,
      unique: true,
      sparse: true,         // allows multiple docs with null email (parent OTP accounts)
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      minlength: 6,
      select: false,        // optional — parent accounts use OTP, not password
    },
    role: {
      type: String,
      enum: ['super_admin', 'admin', 'principal', 'teacher', 'faculty', 'parent', 'student'],
      default: 'admin',
    },
    phone: {
      type: String,
      trim: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // Refresh token hash for OTP-based parent sessions
    refreshTokenHash: { type: String, select: false, default: null },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving (skip if no password set — OTP-only accounts)
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 12);
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
