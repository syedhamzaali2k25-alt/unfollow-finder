const express = require('express');
const crypto = require('crypto');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// ✅ LemonSqueezy Webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const secret = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;
    const signature = req.headers['x-signature'];

    const hmac = crypto.createHmac('sha256', secret);
    const digest = hmac.update(req.body).digest('hex');

    if (signature !== digest) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const payload = JSON.parse(req.body.toString());
    const eventName = payload.meta?.event_name;
    const email = payload.data?.attributes?.user_email ||
                  payload.data?.attributes?.customer_email;

    console.log('Webhook event:', eventName, 'Email:', email);

    if (eventName === 'order_created' || eventName === 'subscription_created') {
      const productName = payload.data?.attributes?.product_name || '';
      const plan = productName.toLowerCase().includes('team') ? 'team' : 'pro';

      if (email) {
        await pool.query(
          'UPDATE users SET plan = $1, updated_at = NOW() WHERE email = $2',
          [plan, email]
        );
        console.log(`✅ Plan updated: ${email} → ${plan}`);
      }
    }

    if (eventName === 'subscription_cancelled') {
      if (email) {
        await pool.query(
          'UPDATE users SET plan = $1, updated_at = NOW() WHERE email = $2',
          ['free', email]
        );
        console.log(`✅ Plan cancelled: ${email} → free`);
      }
    }

    res.json({ received: true });

  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ✅ Get subscription status
router.get('/subscription', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT plan, updated_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json({ plan: result.rows[0]?.plan || 'free' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ✅ Cancel subscription
router.post('/cancel', auth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2',
      ['free', req.user.id]
    );
    res.json({ message: 'Subscription cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;