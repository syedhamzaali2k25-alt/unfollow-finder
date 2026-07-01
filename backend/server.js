const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/usage', require('./routes/usage'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/scans', require('./routes/scans'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'GrowFlow API is running' });
});

// ✅ Frontend static files serve karo (routes ke BAAD)
app.use(express.static(path.join(__dirname, '..')));

// ✅ Baaki sab requests index.html pe bhejo
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 GrowFlow API running on http://localhost:${PORT}`);
});

module.exports = app;