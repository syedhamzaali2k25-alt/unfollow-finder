const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();

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

// ✅ Page routes
app.get('/blogs', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'blogs', 'index1.html'));
});
app.get('/blogs/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'blogs', 'index1.html'));
});

// ✅ Blog post pages (wildcard)
app.get('/blogs/:page', (req, res) => {
  const file = path.join(__dirname, '..', 'blogs', req.params.page + '.html');
  res.sendFile(file, (err) => {
    if (err) res.sendFile(path.join(__dirname, '..', 'blogs', 'index1.html'));
  });
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard.html'));
});

app.get('/payment', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'payment.html'));
});

// ✅ Static files
app.use(express.static(path.join(__dirname, '..')));

// ✅ Wildcard SABSE AKHIR MEIN
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