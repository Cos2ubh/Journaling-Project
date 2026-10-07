const crypto = require('crypto');
const User = require('../models/User');
const logger = require('../utils/logger');
const { publicUser } = require('../utils/publicUser');
const bcrypt = require('bcryptjs');

// Coerce to a trimmed lowercase string. Rejecting objects here also blocks
// NoSQL operator injection like { "email": { "$ne": null } }.
const normalizeEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
const sendEmail = require('../utils/sendEmail');

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { name, password } = req.body;
    const email = normalizeEmail(req.body.email);

    // Validate input
    if (typeof name !== 'string' || !name.trim() || !email || typeof password !== 'string' || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already registered'
      });
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password
    });

    // Generate token
    const token = user.generateAuthToken();

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: publicUser(user),
        token
      }
    });

  } catch (error) {
    if (error.name === 'ValidationError') {
      const first = Object.values(error.errors)[0];
      return res.status(400).json({ success: false, message: first?.message || 'Please check your details' });
    }
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }
    logger.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error.message
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { password } = req.body;
    const email = normalizeEmail(req.body.email);

    // Validate input
    if (!email || typeof password !== 'string' || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Find user and include password hash (excluded by default in the schema)
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password
    const isPasswordMatch = await user.comparePassword(password);

    if (!isPasswordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Hashes made with an older, weaker bcrypt cost are re-hashed now, while the
    // plain password is known. Users upgrade transparently on their next login.
    if (bcrypt.getRounds(user.password) < User.BCRYPT_ROUNDS) {
      user.password = password; // pre-save hook hashes it at the current cost
      await user.save({ validateBeforeSave: false }); // legacy passwords may be shorter than today's minimum
      logger.info(`Upgraded password hash for user ${user._id}`);
    }

    // Update last login (use updateOne to avoid triggering pre-save hook)
    await User.updateOne({ _id: user._id }, { lastLogin: new Date() });

    // Generate token
    const token = user.generateAuthToken();

    logger.info(`User logged in: ${email}`);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: publicUser(user),
        token
      }
    });

  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error.message
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: publicUser(user)
    });
  } catch (error) {
    logger.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res) => {
  try {
    // In JWT, logout is handled client-side by removing the token
    // Server-side can implement token blacklisting if needed

    logger.info(`User logged out: ${req.user.email}`);

    res.status(200).json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout',
      error: error.message
    });
  }
};

// @desc    Forgot password - send reset email
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email address'
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      // Return success even if user not found to prevent email enumeration
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent'
      });
    }

    // Generate reset token
    const resetToken = user.generateResetToken();
    await user.save({ validateBeforeSave: false });

    // Build reset URL pointing to the frontend
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0070d1;">Password Reset Request</h2>
        <p>Hi ${user.name},</p>
        <p>You requested a password reset. Click the button below to set a new password:</p>
        <a href="${resetUrl}"
           style="display: inline-block; padding: 12px 24px; background: #0070d1; color: #fff;
                  text-decoration: none; border-radius: 6px; margin: 16px 0; font-weight: 600;">
          Reset Password
        </a>
        <p style="color: #888; font-size: 0.9em;">
          This link expires in 15 minutes. If you didn't request this, ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
        <p style="color: #aaa; font-size: 0.8em;">Veritas Daily</p>
      </div>
    `;

    try {
      await sendEmail({
        to: user.email,
        subject: 'Password Reset - Veritas Daily',
        html
      });

      logger.info(`Password reset email sent to: ${email}`);
    } catch (emailError) {
      // Clear token if email fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      logger.error('Password reset email failed:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Email could not be sent. Please try again later.'
      });
    }

    res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent'
    });

  } catch (error) {
    logger.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

// @desc    Reset password using token
// @route   POST /api/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a password with at least 8 characters'
      });
    }

    // Hash the token from the URL to match what's stored in DB
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    // Set new password and clear reset fields
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    logger.info(`Password reset successful for: ${user.email}`);

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully'
    });

  } catch (error) {
    logger.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
};

module.exports = {
  register,
  login,
  getMe,
  logout,
  forgotPassword,
  resetPassword
};
