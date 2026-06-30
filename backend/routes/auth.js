/* ── Authentication Routes ──────────────────────────────── */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const validator = require('validator');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// SIGNUP
router.post('/signup', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    if (!validator.isEmail(email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const userExists = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const result = await pool.query(
      'INSERT INTO users (email, password_hash, full_name, plan) VALUES ($1, $2, $3, $4) RETURNING id, email, plan',
      [email, passwordHash, fullName || '', 'free']
    );

    const user = result.rows[0];

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    return res.status(201).json({
      message: 'User created successfully',
      user: { id: user.id, email: user.email, plan: user.plan },
      token
    });

  } catch (err) {
    console.error('SIGNUP ERROR:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      message: 'Login successful',
      user: { id: user.id, email: user.email, plan: user.plan },
      token
    });

  } catch (err) {
    console.error('LOGIN ERROR:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// VERIFY TOKEN
router.get('/verify', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch (err) {
    res.status(401).json({ valid: false, error: 'Invalid token' });
  }
});

// ✅ GOOGLE SYNC — Google se login hone wale users database mein save karo
router.post('/google-sync', async (req, res) => {
  try {
    const { email, fullName } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    // Check karo user pehle se hai ya nahi
    const existing = await pool.query(
      'SELECT id, email, plan FROM users WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      // User pehle se hai — wapas bhejo
      return res.json({
        message: 'User found',
        user: existing.rows[0]
      });
    }

    // Naya Google user — create karo
    const result = await pool.query(
      'INSERT INTO users (email, password_hash, full_name, plan) VALUES ($1, $2, $3, $4) RETURNING id, email, plan',
      [email, 'google-oauth', fullName || '', 'free']
    );

    res.status(201).json({
      message: 'Google user created',
      user: result.rows[0]
    });

  } catch (err) {
    console.error('GOOGLE SYNC ERROR:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ GET CURRENT USER — used to check live plan (free/pro/team) from token
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT id, email, full_name, plan, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });

  } catch (err) {
    console.error('ME ROUTE ERROR:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;