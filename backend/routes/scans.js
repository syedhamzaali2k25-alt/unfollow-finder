/* ── Scan Routes ─────────────────────────────────── */

const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

const MAX_ACCOUNTS     = 100000;  // sanity limit (sab ke liye)
const SNAPSHOT_LIMIT   = 30000;   // isse zyada ho to snapshot skip
const FREE_DAILY_SCANS = 3;       // free plan: 3 scans per day


// ══════════════════════════════════════════════
// SAVE SCAN — POST /api/scans/save
// ══════════════════════════════════════════════
router.post('/save', auth, async (req, res) => {
  const client = await pool.connect();

  try {
    const { followers, following, platform } = req.body;
    const userId = req.user.id;

    // ── Validation ──
    if (!Array.isArray(followers) || !Array.isArray(following)) {
      return res.status(400).json({ error: 'followers aur following arrays honi chahiye' });
    }

    if (followers.length === 0 && following.length === 0) {
      return res.status(400).json({ error: 'Dono lists khali hain' });
    }

    if (followers.length > MAX_ACCOUNTS || following.length > MAX_ACCOUNTS) {
      return res.status(413).json({ error: 'File bohot bari hai' });
    }

    // ── Plan check ──
    const userRes = await client.query(
      'SELECT plan FROM users WHERE id = $1',
      [userId]
    );

    if (!userRes.rows[0]) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isPaid = (userRes.rows[0].plan || 'free') !== 'free';

    // ── SERVER-SIDE DAILY LIMIT (free users) ──
    // Ye yahan hona zaroori hai — frontend pe bharosa nahi kar sakte
    const today = new Date().toISOString().split('T')[0];

    if (!isPaid) {
      const usageRes = await client.query(
        'SELECT analyses_count FROM usage WHERE user_id = $1 AND date = $2',
        [userId, today]
      );

      const used = usageRes.rows[0]?.analyses_count || 0;

      if (used >= FREE_DAILY_SCANS) {
        return res.status(429).json({
          error: 'Daily limit reached',
          message: `Free accounts get ${FREE_DAILY_SCANS} scans a day. Pro is unlimited.`,
          used,
          limit: FREE_DAILY_SCANS,
          upgradeUrl: '/payment?plan=pro'
        });
      }
    }

    // ── Data clean ──
    const clean = arr => [...new Set(
      arr.filter(u => typeof u === 'string' && u.trim().length > 0)
         .map(u => u.trim())
    )];

    const followersList = clean(followers);
    const followingList = clean(following);

    const follSet = new Set(followersList);
    const folwSet = new Set(followingList);

    const notFollowingBack = followingList.filter(u => !follSet.has(u));
    const notFollowedBack  = followersList.filter(u => !folwSet.has(u));
    const mutual           = followingList.filter(u => follSet.has(u));

    // ── Pichla snapshot (comparison ke liye — sirf paid) ──
    let prevSnapshot = null;

    if (isPaid) {
      const prevRes = await client.query(
        `SELECT followers, following, created_at
         FROM scan_snapshots
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId]
      );
      prevSnapshot = prevRes.rows[0] || null;
    }

    // ── Comparison ──
    let unfollowedYou = [];
    let newFollowers  = [];

    if (prevSnapshot) {
      const prevFollowers = new Set(prevSnapshot.followers || []);
      unfollowedYou = [...prevFollowers].filter(u => !follSet.has(u));
      newFollowers  = followersList.filter(u => !prevFollowers.has(u));
    }

    // ══════════════════════════════════════════
    // TRANSACTION
    // ══════════════════════════════════════════
    await client.query('BEGIN');

    const scanResult = await client.query(
      `INSERT INTO scans
        (user_id, platform, followers_count, following_count,
         non_followers_count, mutual_count, not_followed_back_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [
        userId,
        platform || 'instagram',
        followersList.length,
        followingList.length,
        notFollowingBack.length,
        mutual.length,
        notFollowedBack.length
      ]
    );

    const scanId = scanResult.rows[0].id;

    // Usage count barhao (atomic — race condition safe)
    await client.query(
      `INSERT INTO usage (user_id, date, analyses_count)
       VALUES ($1, $2, 1)
       ON CONFLICT (user_id, date)
       DO UPDATE SET analyses_count = usage.analyses_count + 1`,
      [userId, today]
    );

    // Not-following-back list
    if (notFollowingBack.length > 0) {
      await client.query(
        `INSERT INTO unfollow_history (scan_id, user_id, username)
         SELECT $1, $2, unnest($3::text[])`,
        [scanId, userId, notFollowingBack]
      );
    }

    // ── Paid users: snapshot + events ──
    if (isPaid) {
      const tooBig = followersList.length > SNAPSHOT_LIMIT
                  || followingList.length > SNAPSHOT_LIMIT;

      if (!tooBig) {
        await client.query(
          `INSERT INTO scan_snapshots (scan_id, user_id, followers, following)
           VALUES ($1, $2, $3::text[], $4::text[])`,
          [scanId, userId, followersList, followingList]
        );
      }

      if (unfollowedYou.length > 0) {
        await client.query(
          `INSERT INTO unfollow_events (user_id, scan_id, username, event_type)
           SELECT $1, $2, unnest($3::text[]), 'unfollowed'`,
          [userId, scanId, unfollowedYou]
        );
      }

      if (newFollowers.length > 0) {
        await client.query(
          `INSERT INTO unfollow_events (user_id, scan_id, username, event_type)
           SELECT $1, $2, unnest($3::text[]), 'new_follower'`,
          [userId, scanId, newFollowers]
        );
      }

      // Sirf aakhri 10 snapshots rakho
      await client.query(
        `DELETE FROM scan_snapshots
         WHERE user_id = $1
           AND id NOT IN (
             SELECT id FROM scan_snapshots
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT 10
           )`,
        [userId]
      );
    }

    await client.query('COMMIT');

    res.json({
      message: 'Scan saved successfully!',
      scanId,
      isPaid,
      isFirstScan: isPaid && !prevSnapshot,
      results: {
        followers: followersList.length,
        following: followingList.length,
        notFollowingBack: notFollowingBack.length,
        notFollowedBack: notFollowedBack.length,
        mutual: mutual.length,
        unfollowedYou: unfollowedYou.length,
        newFollowers: newFollowers.length,
        list: {
          notFollowingBack,
          notFollowedBack,
          mutual,
          unfollowedYou,
          newFollowers
        }
      }
    });

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('SCAN ERROR:', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});


// ══════════════════════════════════════════════
// UNFOLLOW TIMELINE — GET /api/scans/timeline
// ══════════════════════════════════════════════
router.get('/timeline', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    let limit = parseInt(req.query.limit, 10);
    if (isNaN(limit) || limit < 1) limit = 100;
    if (limit > 500) limit = 500;

    const type = req.query.type === 'new_follower' ? 'new_follower' : 'unfollowed';

    const result = await pool.query(
      `SELECT username, event_type, detected_at, scan_id
       FROM unfollow_events
       WHERE user_id = $1 AND event_type = $2
       ORDER BY detected_at DESC, username
       LIMIT $3`,
      [userId, type, limit]
    );

    const snapRes = await pool.query(
      'SELECT COUNT(*)::int AS total FROM scan_snapshots WHERE user_id = $1',
      [userId]
    );

    const snapshotCount = snapRes.rows[0]?.total || 0;

    res.json({
      events: result.rows,
      snapshotCount,
      needsSecondScan: snapshotCount < 2
    });

  } catch (err) {
    console.error('TIMELINE ERROR:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});


// ══════════════════════════════════════════════
// GET SCAN HISTORY — GET /api/scans/history
// ══════════════════════════════════════════════
router.get('/history', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    let limit = parseInt(req.query.limit, 10);
    if (isNaN(limit) || limit < 1) limit = 10;
    if (limit > 100) limit = 100;

    const result = await pool.query(
      `SELECT s.id, s.platform, s.followers_count, s.following_count,
              s.non_followers_count, s.mutual_count, s.not_followed_back_count,
              s.created_at,
              COALESCE((
                SELECT COUNT(*)::int FROM unfollow_events e
                WHERE e.scan_id = s.id AND e.event_type = 'unfollowed'
              ), 0) AS unfollowed_count,
              COALESCE((
                SELECT COUNT(*)::int FROM unfollow_events e
                WHERE e.scan_id = s.id AND e.event_type = 'new_follower'
              ), 0) AS new_follower_count
       FROM scans s
       WHERE s.user_id = $1
       ORDER BY s.created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    res.json({ scans: result.rows });

  } catch (err) {
    console.error('HISTORY ERROR:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});


// ══════════════════════════════════════════════
// GET LATEST SCAN — GET /api/scans/latest
// ══════════════════════════════════════════════
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
      return res.json({ scan: null, unfollowers: [], unfollowedYou: [] });
    }

    const scanId = scan.rows[0].id;

    const [notBackRes, unfollowedRes] = await Promise.all([
      pool.query(
        `SELECT username FROM unfollow_history
         WHERE scan_id = $1 AND user_id = $2
         ORDER BY username`,
        [scanId, userId]
      ),
      pool.query(
        `SELECT username, detected_at FROM unfollow_events
         WHERE scan_id = $1 AND user_id = $2 AND event_type = 'unfollowed'
         ORDER BY username`,
        [scanId, userId]
      )
    ]);

    res.json({
      scan: scan.rows[0],
      unfollowers:   notBackRes.rows.map(r => r.username),
      unfollowedYou: unfollowedRes.rows.map(r => r.username)
    });

  } catch (err) {
    console.error('LATEST ERROR:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});


// ══════════════════════════════════════════════
// DELETE SCAN — DELETE /api/scans/:id
// ══════════════════════════════════════════════
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const scanId = parseInt(req.params.id, 10);

    if (isNaN(scanId)) {
      return res.status(400).json({ error: 'Invalid scan id' });
    }

    const result = await pool.query(
      'DELETE FROM scans WHERE id = $1 AND user_id = $2 RETURNING id',
      [scanId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Scan not found' });
    }

    res.json({ message: 'Scan deleted' });

  } catch (err) {
    console.error('DELETE ERROR:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});


// ══════════════════════════════════════════════
// DELETE ALL DATA — DELETE /api/scans/all/data
// ══════════════════════════════════════════════
router.delete('/all/data', auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'DELETE FROM scans WHERE user_id = $1 RETURNING id',
      [userId]
    );

    res.json({
      message: 'All scan data deleted',
      deleted: result.rowCount
    });

  } catch (err) {
    console.error('DELETE ALL ERROR:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;