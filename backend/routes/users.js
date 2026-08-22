/* ── User Routes ────────────────────────────────────────── */

const express = require('express');
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const FREE_DAILY_LIMIT = 3;
const UNLIMITED = -1; // JSON mein Infinity null ban jata hai

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
    console.error('User /profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// UPDATE USER PROFILE
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { fullName } = req.body;

    if (typeof fullName !== 'string' || fullName.trim().length === 0) {
      return res.status(400).json({ error: 'Full name is required' });
    }

    if (fullName.length > 100) {
      return res.status(400).json({ error: 'Full name too long' });
    }

    const result = await pool.query(
      `UPDATE users SET full_name = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, email, full_name, plan`,
      [fullName.trim(), userId]
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
    console.error('User PUT /profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});


// GET USER PLAN & USAGE
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // ✅ created_at bhi select karo — pehle missing tha, isliye accountAge NaN aata tha
    const userResult = await pool.query(
      'SELECT plan, created_at FROM users WHERE id = $1',
      [userId]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isPaid = user.plan !== 'free';

    // Today's usage
    const usageResult = await pool.query(
      'SELECT analyses_count FROM usage WHERE user_id = $1 AND date = $2',
      [userId, today]
    );

    const todayUsage = usageResult.rows[0]?.analyses_count || 0;

    // Monthly usage
    const monthlyResult = await pool.query(
      `SELECT COALESCE(SUM(analyses_count), 0) AS total
       FROM usage
       WHERE user_id = $1 AND date >= CURRENT_DATE - INTERVAL '1 month'`,
      [userId]
    );

    // Postgres SUM string return karta hai, isliye Number()
    const monthlyUsage = Number(monthlyResult.rows[0]?.total || 0);

    // Lifetime total
    const totalResult = await pool.query(
      `SELECT COALESCE(SUM(analyses_count), 0) AS total
       FROM usage WHERE user_id = $1`,
      [userId]
    );

    const totalAnalyses = Number(totalResult.rows[0]?.total || 0);

    const accountAgeDays = Math.floor(
      (Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    res.json({
      plan: user.plan,
      isPaid,
      todayUsage,
      todayLimit:     isPaid ? UNLIMITED : FREE_DAILY_LIMIT,
      todayRemaining: isPaid ? UNLIMITED : Math.max(0, FREE_DAILY_LIMIT - todayUsage),
      monthlyUsage,
      stats: {
        totalAnalyses,
        accountAgeDays,
        accountAge: accountAgeDays + (accountAgeDays === 1 ? ' day' : ' days')
      }
    });

  } catch (err) {
    console.error('User /stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;