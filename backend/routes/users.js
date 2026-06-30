/* ── User Routes ────────────────────────────────────────── */

const express = require('express');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET USER PROFILE
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT id, email, full_name, plan, created_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        plan: user.plan,
        createdAt: user.created_at
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// UPDATE USER PROFILE
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { fullName } = req.body;

    const result = await pool.query(
      'UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, full_name, plan',
      [fullName || '', userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      message: 'Profile updated',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        plan: user.plan
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET USER PLAN & USAGE
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Get user plan
    const userResult = await pool.query(
      'SELECT plan FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    const isPaid = user.plan !== 'free';

    // Get today's usage
    const usageResult = await pool.query(
      'SELECT analyses_count FROM usage WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    const usage = usageResult.rows[0]?.analyses_count || 0;
    const limit = isPaid ? Infinity : 10;
    const remaining = limit === Infinity ? Infinity : Math.max(0, limit - usage);

    // Get monthly usage
    const monthlyResult = await pool.query(
      'SELECT SUM(analyses_count) as total FROM usage WHERE user_id = $1 AND date >= NOW() - INTERVAL \'1 month\'',
      [userId]
    );

    const monthlyUsage = monthlyResult.rows[0]?.total || 0;

    res.json({
      plan: user.plan,
      isPaid,
      todayUsage: usage,
      todayLimit: limit,
      todayRemaining: remaining,
      monthlyUsage,
      stats: {
        totalAnalyses: monthlyUsage,
        accountAge: Math.floor((Date.now() - new Date(user.created_at)) / (1000 * 60 * 60 * 24)) + ' days'
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
