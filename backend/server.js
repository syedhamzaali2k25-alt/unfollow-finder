const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const ROOT = path.join(__dirname, '..');

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// ✅ API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/usage', require('./routes/usage'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/scans', require('./routes/scans'));

// ✅ Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'GrowFlow API is running' });
});

// ✅ Static files - process.cwd() use karo
app.use(express.static(process.cwd()));

// ✅ Page routes
app.get('/blogs', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'blogs', 'index1.html'));
});
app.get('/blogs/', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'blogs', 'index1.html'));
});
app.get('/blogs/:page', (req, res) => {
  const file = path.join(process.cwd(), 'blogs', req.params.page + '.html');
  res.sendFile(file, (err) => {
    if (err) res.sendFile(path.join(process.cwd(), 'blogs', 'index1.html'));
  });
});
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'dashboard.html'));
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'privacy.html'));
});

app.get('/about', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'about-us.html'));
});

app.get('/payment', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'payment.html'));
});

// ✅ Wildcard
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'index.html'));
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