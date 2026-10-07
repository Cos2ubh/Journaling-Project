const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const UserSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide a name'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Please provide an email'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      // Pragmatic check: something@something.tld (any TLD length, e.g. .info, .email, .tech)
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
      'Please provide a valid email'
    ]
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 6,
    select: false // Don't return password by default
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date
  },
  resetPasswordToken: {
    type: String
  },
  resetPasswordExpire: {
    type: Date
  },

  // ---- Product ----
  preferences: {
    topics: { type: [String], default: [] },          // category slugs
    digestOptIn: { type: Boolean, default: false }     // daily email briefing
  },
  onboardingCompletedAt: { type: Date },
  plan: { type: String, enum: ['free', 'pro'], default: 'free' },
  streak: {
    current: { type: Number, default: 0 },
    longest: { type: Number, default: 0 },
    lastActiveDate: { type: String }                   // "YYYY-MM-DD" in APP_TIMEZONE
  },
  usage: {
    date: { type: String },                            // day the counters below belong to
    verifications: { type: Number, default: 0 }
  },
  // Fake-door test: people who asked for Pro before it exists
  proInterest: {
    firstAt: { type: Date },
    lastAt: { type: Date },
    count: { type: Number, default: 0 },
    lastSource: { type: String }
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Hash password before saving
UserSchema.pre('save', async function() {
  // Only hash if password is modified or new
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Method to compare password
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to generate JWT token
UserSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { id: this._id, email: this.email, role: this.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

// Method to generate password reset token
UserSchema.methods.generateResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 minutes

  return resetToken;
};

// Method to get user data without sensitive info
UserSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.resetPasswordToken;
  delete user.resetPasswordExpire;
  return user;
};

module.exports = mongoose.model('User', UserSchema);
