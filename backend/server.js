/* ── GrowFlow Backend - Main Server ─────────────────────── */
const path = require('path');

// ✅ Frontend static files serve karo
app.use(express.static(path.join(__dirname, '..')));

// ✅ Root pe index.html bhejo
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


// Middleware
app.use(cors());
app.use(express.json());

// Database
const pool = require('./config/database');

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/usage', require('./routes/usage'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/scans', require('./routes/scans'));



// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: '✅ GrowFlow Backend is running!',
    status: 'ok',
    version: '1.0.0'
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'GrowFlow API is running' });
});


// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 GrowFlow API running on http://localhost:${PORT}`);
});

module.exports = app;
