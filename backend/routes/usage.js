/* ── Usage Tracking Routes ──────────────────────────────── */

const express = require('express');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// GET TODAY'S USAGE
router.get('/today', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const result = await pool.query(
      'SELECT * FROM usage WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    const usage = result.rows[0] || { analyses_count: 0 };

    // Check if user is on paid plan
    const userResult = await pool.query(
      'SELECT plan FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    const isPaid = user.plan !== 'free';
    const limit = isPaid ? Infinity : 10;
    const remaining = limit === Infinity ? Infinity : Math.max(0, limit - usage.analyses_count);

    res.json({
      used: usage.analyses_count,
      limit,
      remaining,
      isPaid,
      plan: user.plan
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// INCREMENT USAGE
router.post('/increment', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Get user's plan
    const userResult = await pool.query(
      'SELECT plan FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    const isPaid = user.plan !== 'free';

    // Check usage
    const usageResult = await pool.query(
      'SELECT analyses_count FROM usage WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    const currentUsage = usageResult.rows[0]?.analyses_count || 0;

    // Check limit
    if (!isPaid && currentUsage >= 10) {
      return res.status(429).json({
        error: 'Daily limit reached',
        used: currentUsage,
        limit: 10,
        remaining: 0
      });
    }

    // Insert or update usage
    if (usageResult.rows.length === 0) {
      await pool.query(
        'INSERT INTO usage (user_id, date, analyses_count) VALUES ($1, $2, 1)',
        [userId, today]
      );
    } else {
      await pool.query(
        'UPDATE usage SET analyses_count = analyses_count + 1 WHERE user_id = $1 AND date = $2',
        [userId, today]
      );
    }

    const newUsage = currentUsage + 1;
    const remaining = isPaid ? Infinity : Math.max(0, 10 - newUsage);

    res.json({
      used: newUsage,
      limit: isPaid ? Infinity : 10,
      remaining,
      isPaid
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET USAGE HISTORY
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = req.query.days || 30;

    const result = await pool.query(
      'SELECT date, analyses_count FROM usage WHERE user_id = $1 AND date >= NOW() - INTERVAL \'1 day\' * $2 ORDER BY date DESC',
      [userId, days]
    );

    res.json({ usage: result.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
