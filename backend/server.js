const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const ROOT = path.join(__dirname, '..');


/* ══════════════════════════════════════════════════
   1. WEBHOOK — must come before CORS and express.json()

   Whop calls this server to server, so there is no browser
   origin to check and CORS would reject the request before
   it ever reaches the route. Signature verification also
   needs the untouched raw body, which express.json() would
   destroy.

   type: '*&#47;*' because Whop may append a charset to the
   Content-Type, which 'application/json' would not match.
   ══════════════════════════════════════════════════ */
app.use('/api/payments/webhook',
  express.raw({ type: '*/*' })
);


/* ══════════════════════════════════════════════════
   2. CORS
   ══════════════════════════════════════════════════ */
const allowedOrigins = [
  'https://unfollowfinder.com',
  'https://www.unfollowfinder.com',
  'http://localhost:8080',
  'http://localhost:5000',
  'http://127.0.0.1:8080'
];

app.use(cors({
  origin: (origin, cb) => {
    // No origin: Postman, curl, server-to-server
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));


/* ══════════════════════════════════════════════════
   3. JSON parser — Instagram exports are large
   ══════════════════════════════════════════════════ */
app.use(express.json({ limit: '10mb' }));


/* ══════════════════════════════════════════════════
   4. API routes
   ══════════════════════════════════════════════════ */
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/users',    require('./routes/users'));
app.use('/api/usage',    require('./routes/usage'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/scans',    require('./routes/scans'));
app.use('/api/feedback', require('./routes/feedback'));
app.use('/api/contact',  require('./routes/contact'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Unfollow Finder API is running' });
});


/* ══════════════════════════════════════════════════
   5. Redirect .html URLs to clean URLs
   ══════════════════════════════════════════════════ */
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


/* ══════════════════════════════════════════════════
   6. Static files
   ══════════════════════════════════════════════════ */
app.use(express.static(ROOT));


/* ══════════════════════════════════════════════════
   7. Page routes
   ══════════════════════════════════════════════════ */
app.get(['/blogs', '/blogs/'], (req, res) => {
  res.sendFile(path.join(ROOT, 'blogs', 'index1.html'));
});

app.get('/blogs/:page', (req, res) => {
  // path.basename strips any ../ so a request can't escape the folder
  const page = path.basename(req.params.page);
  const file = path.join(ROOT, 'blogs', page + '.html');

  res.sendFile(file, (err) => {
    if (err) res.sendFile(path.join(ROOT, 'blogs', 'index1.html'));
  });
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(ROOT, 'dashboard.html'));
});

app.get('/pricing', (req, res) => {
  res.sendFile(path.join(ROOT, 'pricing.html'));
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

// Both spellings — the site links to /contact
app.get(['/contact', '/contact-us'], (req, res) => {
  res.sendFile(path.join(ROOT, 'contact.html'));
});


/* ══════════════════════════════════════════════════
   8. Fallbacks
   ══════════════════════════════════════════════════ */

// Unknown API route → JSON 404, not the homepage
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Missing asset → real 404, so broken files fail visibly
app.get(/\.(ico|png|jpg|jpeg|svg|gif|css|js|json|webmanifest|txt|xml)$/, (req, res) => {
  res.status(404).send('Not found');
});

// Everything else → index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT, 'index.html'));
});


/* ══════════════════════════════════════════════════
   9. Error handler
   ══════════════════════════════════════════════════ */
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
  console.log(`🚀 Unfollow Finder API running on port ${PORT}`);
});

module.exports = app;