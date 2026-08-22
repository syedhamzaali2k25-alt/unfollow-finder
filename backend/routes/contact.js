/* ── Contact Routes ──────────────────────────────── */

const express = require('express');
const pool = require('../config/database');

const router = express.Router();

const MAX_MESSAGE = 1500;
const MAX_PER_HOUR = 3;

const VALID_TOPICS = [
  'support', 'billing', 'data', 'feature', 'partnership', 'other'
];

// Simple in-memory rate limit by IP.
// Fine for one server; move to the DB if you ever run more than one.
const hits = new Map();

function rateLimited(ip) {
  const now = Date.now();
  const hour = 60 * 60 * 1000;

  const list = (hits.get(ip) || []).filter(t => now - t < hour);

  if (list.length >= MAX_PER_HOUR) {
    hits.set(ip, list);
    return true;
  }

  list.push(now);
  hits.set(ip, list);
  return false;
}

// Clear old entries every 30 min so the map doesn't grow forever
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [ip, list] of hits) {
    const kept = list.filter(t => t > cutoff);
    if (kept.length) hits.set(ip, kept);
    else hits.delete(ip);
  }
}, 30 * 60 * 1000).unref();


// POST /api/contact
router.post('/', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0].trim()
            || req.socket.remoteAddress
            || 'unknown';

    if (rateLimited(ip)) {
      return res.status(429).json({
        error: 'Too many messages',
        message: 'You\'ve sent a few already. Try again in an hour.'
      });
    }

    let { name, email, topic, message } = req.body;

    name    = typeof name    === 'string' ? name.trim()    : '';
    email   = typeof email   === 'string' ? email.trim()   : '';
    message = typeof message === 'string' ? message.trim() : '';
    topic   = VALID_TOPICS.includes(topic) ? topic : 'other';

    if (name.length < 2 || name.length > 100) {
      return res.status(400).json({ error: 'Invalid name' });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    if (message.length < 10 || message.length > MAX_MESSAGE) {
      return res.status(400).json({ error: 'Invalid message' });
    }

    await pool.query(
      `INSERT INTO contact_messages (name, email, topic, message, ip)
       VALUES ($1, $2, $3, $4, $5)`,
      [name, email, topic, message, ip]
    );

    console.log(`📬 Contact [${topic}] from ${email}`);

    res.json({ received: true });

  } catch (err) {
    console.error('Contact error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;