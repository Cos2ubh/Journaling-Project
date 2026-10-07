const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const logger = require('./utils/logger');

// Import routes
const authRoutes = require('./routes/auth');
const articleRoutes = require('./routes/articles');
const viralRoutes = require('./routes/viral');
const verificationRoutes = require('./routes/verification');
const meRoutes = require('./routes/me');
const briefingRoutes = require('./routes/briefing');
const internalRoutes = require('./routes/internal');

const app = express();

// Behind Render/Vercel's proxy: needed so rate limiting sees real client IPs
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Middleware
app.use(helmet()); // Security headers
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// In production, never leak internal error messages from 5xx responses.
// Many controllers include rror: error.message; strip it centrally.
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 500 && body && typeof body === 'object' && 'error' in body) {
        const { error, ...safeBody } = body;
        return originalJson(safeBody);
      }
      return originalJson(body);
    };
    next();
  });
}

// Logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/viral', viralRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/me', meRoutes);
app.use('/api/briefing', briefingRoutes);
app.use('/api/internal', internalRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Error:', err);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

module.exports = app;
