const express = require('express');
const pool = require('../config/database');
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { rating, comment, email, page } = req.body;
    if (!rating) return res.status(400).json({ error: 'Rating required' });

    await pool.query(
      `INSERT INTO feedback (rating, comment, email, page, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [rating, comment || '', email || '', page || '']
    );

    res.json({ message: 'Feedback received!' });
  } catch (err) {
    console.error('FEEDBACK ERROR:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;