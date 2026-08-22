const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const ROOT = path.join(__dirname, '..');

/* ── CORS ───────────────────────────────────────── */
const allowedOrigins = [
  'https://unfollowfinder.com',
  'https://www.unfollowfinder.com',
  'http://localhost:8080',
  'http://localhost:5000',
  'http://127.0.0.1:8080'
];

app.use(cors({
  origin: (origin, cb) => {
    // Postman / server-to-server (no origin) allow
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


/* ── ⚠️ WEBHOOK — express.json() se PEHLE ─────────
   Whop signature verify karne ke liye raw body chahiye.
   Agar express.json() pehle chal gaya to req.body object ban
   jayega aur signature hamesha fail hogi.                    */
app.use('/api/payments/webhook',
  express.raw({ type: 'application/json' })
);


/* ── JSON parser (baaki sab routes ke liye) ────── */
app.use(express.json({ limit: '10mb' })); // Instagram exports bare hote hain


/* ── API Routes ─────────────────────────────────── */
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/users',    require('./routes/users'));
app.use('/api/usage',    require('./routes/usage'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/scans',    require('./routes/scans'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/contact', require('./routes/contact'));




/* ── Health check ───────────────────────────────── */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Unfollow Finder API is running' });
});


/* ── .html URLs ko clean URL pe redirect ────────── */
app.get(/\.html$/, (req, res) => {
  let cleanUrl = req.path.replace(/\.html$/, '');

  if (cleanUrl === '/index') {
    return res.redirect(301, '/');
  }
  if (cleanUrl === '/blogs/index1') {
    return res.redirect(301, '/blogs/');
  }
  if (cleanUrl.endsWith('/index1')) {
    cleanUrl = cleanUrl.replace(/\/index1$/, '/');
  }

  res.redirect(301, cleanUrl);
});


/* ── Static files ───────────────────────────────── */
app.use(express.static(ROOT));


/* ── Page routes ────────────────────────────────── */
app.get(['/blogs', '/blogs/'], (req, res) => {
  res.sendFile(path.join(ROOT, 'blogs', 'index1.html'));
});

app.get('/blogs/:page', (req, res) => {
  // Path traversal se bachao — ../ wale requests block karo
  const page = path.basename(req.params.page);
  const file = path.join(ROOT, 'blogs', page + '.html');

  res.sendFile(file, (err) => {
    if (err) res.sendFile(path.join(ROOT, 'blogs', 'index1.html'));
  });
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(ROOT, 'dashboard.html'));
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(ROOT, 'privacy.html'));
});

app.get('/about-us', (req, res) => {
  res.sendFile(path.join(ROOT, 'about-us.html'));
});

app.get('/payment', (req, res) => {
  res.sendFile(path.join(ROOT, 'payment.html'));
});
app.get('/contact-us', (req, res) => {
  res.sendFile(path.join(ROOT, 'contact.html'));
});
app.get('/pricing', (req, res) => {
  res.sendFile(path.join(ROOT, 'pricing.html'));
});

/* ── Unknown API routes → 404 JSON (HTML nahi) ──── */
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

app.get(/\.(ico|png|jpg|jpeg|svg|gif|css|js|json|webmanifest|txt|xml)$/, (req, res) => {
  res.status(404).send('Not found');
});


/* ── Wildcard → index.html ──────────────────────── */
app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});


/* ── Error handler ──────────────────────────────── */
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Unfollow Finder API running on http://localhost:${PORT}`);
});

module.exports = app;