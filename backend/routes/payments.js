const express = require('express');
const crypto = require('crypto');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();

// ✅ Whop Webhook — Standard Webhooks spec
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const secret = process.env.WHOP_WEBHOOK_SECRET;

    if (!secret) {
      console.error('❌ WHOP_WEBHOOK_SECRET missing in .env');
      return res.status(500).json({ error: 'Not configured' });
    }

    // ── Standard Webhooks headers ──
    const webhookId  = req.headers['webhook-id'];
    const webhookTs  = req.headers['webhook-timestamp'];
    const webhookSig = req.headers['webhook-signature'];

    if (!webhookId || !webhookTs || !webhookSig) {
      console.warn('❌ Missing webhook headers');
      console.log('Headers received:', JSON.stringify(req.headers, null, 2));
      return res.status(400).json({ error: 'Missing headers' });
    }

    // Secret "whsec_" prefix ke saath aata hai — usse hata ke base64 decode karo
    // Prefix kuch bhi ho (ws_, whsec_) — underscore ke baad wala hissa lo
    const rawSecret = secret.includes('_') ? secret.split('_').slice(1).join('_') : secret;
    const secretBytes = Buffer.from(rawSecret, 'base64');

    // Signed content = id.timestamp.body
    const signedContent = `${webhookId}.${webhookTs}.${req.body.toString('utf8')}`;

    const expected = crypto
      .createHmac('sha256', secretBytes)
      .update(signedContent)
      .digest('base64');

    // Header format: "v1,signature" — ek se zyada bhi ho sakti hain (space separated)
    const isValid = webhookSig
      .split(' ')
      .map(s => s.split(',')[1])
      .some(s => s === expected);

    if (!isValid) {
      console.warn('❌ Invalid Whop signature');
      console.log('Expected:', expected);
      console.log('Received:', webhookSig);
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // ── Payload parse ──
    const payload = JSON.parse(req.body.toString());

    // Dot aur underscore dono formats handle karo
    const rawEvent  = payload.action || payload.type || payload.event || '';
    const eventName = rawEvent.replace(/_/g, '.');

    const meta  = payload.data?.metadata || {};
    const email = payload.data?.user_email || payload.data?.email;

    console.log('Whop webhook:', eventName, 'User:', meta.user_id, 'Email:', email);

    // ── Payment successful → upgrade ──
    if (eventName === 'payment.succeeded' || eventName === 'membership.activated') {
      const plan = meta.plan === 'team' ? 'team' : 'pro';

      if (meta.user_id) {
        await pool.query(
          'UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2',
          [plan, meta.user_id]
        );
        console.log(`✅ Plan updated: user ${meta.user_id} → ${plan}`);
      } else if (email) {
        await pool.query(
          'UPDATE users SET plan = $1, updated_at = NOW() WHERE email = $2',
          [plan, email]
        );
        console.log(`✅ Plan updated (via email): ${email} → ${plan}`);
      } else {
        console.warn('⚠️ No user_id or email in webhook payload');
        console.log('Payload:', JSON.stringify(payload, null, 2));
      }
    }

    // ── Subscription cancelled / expired → downgrade ──
    if (eventName === 'membership.deactivated') {
      if (meta.user_id) {
        await pool.query(
          'UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2',
          ['free', meta.user_id]
        );
        console.log(`✅ Plan cancelled: user ${meta.user_id} → free`);
      } else if (email) {
        await pool.query(
          'UPDATE users SET plan = $1, updated_at = NOW() WHERE email = $2',
          ['free', email]
        );
        console.log(`✅ Plan cancelled (via email): ${email} → free`);
      }
    }

    res.json({ received: true });

  } catch (err) {
    console.error('Whop webhook error:', err);
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
    console.error('Subscription fetch error:', err);
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
    console.error('Cancel error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;