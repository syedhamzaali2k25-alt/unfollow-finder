/* ── Scan Routes ─────────────────────────────────── */

const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// SAVE SCAN — POST /api/scans/save
router.post('/save', auth, async (req, res) => {
  try {
    const { followers, following, platform } = req.body;
    const userId = req.user.id;

    if (!followers || !following) {
      return res.status(400).json({ error: 'followers aur following required hain' });
    }

    const follSet = new Set(followers);
    const folwSet = new Set(following);

    // Calculate results
    const notFollowingBack = following.filter(u => !follSet.has(u));
    const notFollowedBack  = followers.filter(u => !folwSet.has(u));
    const mutual           = following.filter(u => follSet.has(u));

    // Save scan to database
   const scanResult = await pool.query(
  `INSERT INTO scans 
    (user_id, platform, followers_count, following_count, non_followers_count, mutual_count, not_followed_back_count) 
   VALUES ($1, $2, $3, $4, $5, $6, $7) 
   RETURNING id`,
  [userId, platform || 'instagram', followers.length, following.length, notFollowingBack.length, mutual.length, notFollowedBack.length]
);

    const scanId = scanResult.rows[0].id;

    // Save unfollow history
    if (notFollowingBack.length > 0) {
      const values = notFollowingBack.map((username, i) =>
        `($1, $${i + 2}, $${notFollowingBack.length + i + 2})`
      );

      const params = [scanId];
      notFollowingBack.forEach(u => params.push(u));
      notFollowingBack.forEach(() => params.push(userId));

      await pool.query(
        `INSERT INTO unfollow_history (scan_id, username, user_id) 
         VALUES ${notFollowingBack.map((_, i) => 
           `($1, $${i + 2}, $${notFollowingBack.length + i + 2})`
         ).join(',')}`,
        params
      );
    }

    res.json({
      message: 'Scan saved successfully!',
      scanId,
      results: {
        followers: followers.length,
        following: following.length,
        notFollowingBack: notFollowingBack.length,
        notFollowedBack: notFollowedBack.length,
        mutual: mutual.length,
        list: {
          notFollowingBack,
          notFollowedBack,
          mutual
        }
      }
    });

  } catch (err) {
    console.error('SCAN ERROR:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET SCAN HISTORY — GET /api/scans/history
router.get('/history', auth, async (req, res) => {
  try {
    const userId = req.user.id;

const result = await pool.query(
  `SELECT id, platform, followers_count, following_count, 
          non_followers_count, mutual_count, not_followed_back_count, created_at 
   FROM scans 
   WHERE user_id = $1 
   ORDER BY created_at DESC 
   LIMIT 10`,
  [userId]
);

    res.json({ scans: result.rows });

  } catch (err) {
    console.error('HISTORY ERROR:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET LATEST SCAN — GET /api/scans/latest
router.get('/latest', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const scan = await pool.query(
      `SELECT * FROM scans 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [userId]
    );

    if (scan.rows.length === 0) {
      return res.json({ scan: null });
    }

    const scanId = scan.rows[0].id;

    const unfollowers = await pool.query(
      `SELECT username FROM unfollow_history 
       WHERE scan_id = $1`,
      [scanId]
    );

    res.json({
      scan: scan.rows[0],
      unfollowers: unfollowers.rows.map(r => r.username)
    });

  } catch (err) {
    console.error('LATEST ERROR:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;