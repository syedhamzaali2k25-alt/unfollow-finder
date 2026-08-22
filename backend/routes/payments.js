const express = require('express');
const pool = require('../config/database');
const auth = require('../middleware/auth');
const { makeWebhookValidator } = require('@whop/api');

const router = express.Router();

/* Whop's own validator. It handles the ws_/whsec_ prefix,
   the base64 decoding and the timestamp window itself —
   all the things that are easy to get wrong by hand. */
const validateWebhook = makeWebhookValidator({
  webhookSecret: process.env.WHOP_WEBHOOK_SECRET
});


// ── Whop Webhook ──
router.post('/webhook', async (req, res) => {
  let webhook;

  try {
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    // The validator expects a Fetch Request. req.body is the raw
    // Buffer because server.js mounts express.raw() on this path.
       // Pass only the webhook headers. req.headers also contains
    // host, connection and content-length, which the Fetch spec
    // forbids — undici drops the whole set when it sees them.
    const request = new Request('https://unfollowfinder.com/api/payments/webhook', {
      method: 'POST',
      headers: {
        'webhook-id':        req.headers['webhook-id'],
        'webhook-timestamp': req.headers['webhook-timestamp'],
        'webhook-signature': req.headers['webhook-signature'],
        'content-type':      'application/json'
      },
      body: req.body
    });

    webhook = await validateWebhook(request);

  } catch (err) {
    console.warn('❌ Whop webhook rejected:', err.message);
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Reply straight away — Whop retries anything that isn't a 2xx
  res.json({ received: true });

  try {
    await handleWebhook(webhook);
  } catch (err) {
    console.error('Webhook handling error:', err.message);
  }
});


async function handleWebhook(webhook) {
  // Newer payloads use `action`, older ones use `event`/`type`
  const raw   = webhook.action || webhook.event || webhook.type || '';
  const event = raw.replace(/_/g, '.');
  const data  = webhook.data || {};

  const meta = data.metadata || {};

  // Whop nests the email differently per event type
  const email = data.user?.email
             || data.user_email
             || data.email
             || data.membership?.user?.email;

  console.log('Whop webhook:', event, '| user_id:', meta.user_id, '| email:', email);

  const UPGRADE = ['payment.succeeded', 'membership.activated', 'member.created'];
  const DOWNGRADE = ['membership.deactivated', 'membership.cancelled'];

  if (UPGRADE.includes(event)) {
    const plan = meta.plan === 'team' ? 'team' : 'pro';
    await setPlan(plan, meta.user_id, email);
    return;
  }

  if (DOWNGRADE.includes(event)) {
    await setPlan('free', meta.user_id, email);
  }
}


async function setPlan(plan, userId, email) {
  // Prefer the id we passed through checkout metadata.
  // Email is the fallback, and can miss if the buyer used a
  // different address on Whop than the one they registered with.
  if (userId) {
    const r = await pool.query(
      'UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2 RETURNING email',
      [plan, userId]
    );
    if (r.rowCount) {
      console.log(`✅ ${r.rows[0].email} → ${plan}`);
      return;
    }
    console.warn(`⚠️ No user with id ${userId}, falling back to email`);
  }

  if (email) {
    const r = await pool.query(
      'UPDATE users SET plan = $1, updated_at = NOW() WHERE email = $2 RETURNING id',
      [plan, email]
    );
    if (r.rowCount) {
      console.log(`✅ ${email} → ${plan}`);
    } else {
      console.warn(`⚠️ Paid on Whop but no account here: ${email}`);
    }
    return;
  }

  console.warn('⚠️ Webhook had neither user_id nor email');
}


// ── Get subscription status ──
router.get('/subscription', auth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT plan, updated_at FROM users WHERE id = $1',
      [req.user.id]
    );
    res.json({ plan: result.rows[0]?.plan || 'free' });
  } catch (err) {
    console.error('Subscription fetch error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});


// ── Cancel subscription ──
router.post('/cancel', auth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2',
      ['free', req.user.id]
    );
    res.json({ message: 'Subscription cancelled' });
  } catch (err) {
    console.error('Cancel error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;