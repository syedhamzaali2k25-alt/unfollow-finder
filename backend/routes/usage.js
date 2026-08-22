/* ── Usage Tracking Routes ──────────────────────────────── */

const express = require('express');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const FREE_DAILY_LIMIT = 3;
const UNLIMITED = -1; // JSON mein Infinity null ban jata hai, isliye -1

// GET TODAY'S USAGE
router.get('/today', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const userResult = await pool.query(
      'SELECT plan FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const usageResult = await pool.query(
      'SELECT analyses_count FROM usage WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    const used = usageResult.rows[0]?.analyses_count || 0;
    const isPaid = user.plan !== 'free';

    res.json({
      used,
      limit:     isPaid ? UNLIMITED : FREE_DAILY_LIMIT,
      remaining: isPaid ? UNLIMITED : Math.max(0, FREE_DAILY_LIMIT - used),
      isPaid,
      plan: user.plan
    });

  } catch (err) {
    console.error('Usage /today error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// INCREMENT USAGE
router.post('/increment', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    const userResult = await pool.query(
      'SELECT plan FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isPaid = user.plan !== 'free';

    // Free users: limit check pehle
    if (!isPaid) {
      const usageResult = await pool.query(
        'SELECT analyses_count FROM usage WHERE user_id = $1 AND date = $2',
        [userId, today]
      );

      const currentUsage = usageResult.rows[0]?.analyses_count || 0;

      if (currentUsage >= FREE_DAILY_LIMIT) {
        return res.status(429).json({
          error: 'Daily limit reached',
          used: currentUsage,
          limit: FREE_DAILY_LIMIT,
          remaining: 0,
          isPaid: false
        });
      }
    }

    // Atomic increment — race condition se bachne ke liye
    const result = await pool.query(
      `INSERT INTO usage (user_id, date, analyses_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (user_id, date)
       DO UPDATE SET analyses_count = usage.analyses_count + 1
       RETURNING analyses_count`,
      [userId, today]
    );

    const used = result.rows[0].analyses_count;

    res.json({
      used,
      limit:     isPaid ? UNLIMITED : FREE_DAILY_LIMIT,
      remaining: isPaid ? UNLIMITED : Math.max(0, FREE_DAILY_LIMIT - used),
      isPaid
    });

  } catch (err) {
    console.error('Usage /increment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// GET USAGE HISTORY
router.get('/history', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Sanitize — query se aane wali value pe bharosa nahi
    let days = parseInt(req.query.days, 10);
    if (isNaN(days) || days < 1) days = 30;
    if (days > 365) days = 365;

    const result = await pool.query(
      `SELECT date, analyses_count
       FROM usage
       WHERE user_id = $1
         AND date >= CURRENT_DATE - ($2::int * INTERVAL '1 day')
       ORDER BY date DESC`,
      [userId, days]
    );

    res.json({ usage: result.rows });

  } catch (err) {
    console.error('Usage /history error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;