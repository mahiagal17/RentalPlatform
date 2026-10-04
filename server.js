require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDatabase } = require('./database/init');
const { seedDatabase } = require('./database/seed');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database schema and seed if fresh
initDatabase();
seedDatabase();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (!req.url.startsWith('/css') && !req.url.startsWith('/js') && !req.url.startsWith('/images')) {
      console.log(`[${req.method}] ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: 'connected (SQLite)'
  });
});

// Module 1: Auth & User Profile Routes
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);
app.use('/api/users', authRoutes);

// Module 2: Listings & Search Routes
const listingRoutes = require('./routes/listingRoutes');
app.use('/api/listings', listingRoutes);


// Global API 404 handler
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: `API endpoint ${req.method} ${req.url} does not exist.`
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    success: false,
    code: err.code || 'INTERNAL_SERVER_ERROR',
    message: err.message || 'An unexpected server error occurred.'
  });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 Camera Rental Platform server running!`);
    console.log(`📍 URL: http://localhost:${PORT}`);
    console.log(`📊 Health Check: http://localhost:${PORT}/api/health`);
    console.log(`💡 Setup Summary: http://localhost:${PORT}/api/setup/summary`);
    console.log(`=======================================================`);
  });
}

module.exports = app;
