const express = require('express');
const crypto = require('crypto');
const pool = require('../config/database');
const auth = require('../middleware/auth');

const router = express.Router();


/* ──────────────────────────────────────────────────
   Whop signature verification

   Verified by hand rather than with @whop/api's
   makeWebhookValidator — the installed version looks
   for a differently named signature header than the
   one Whop sends, so it always threw
   "Missing header containing signature".

   Key = the secret exactly as it appears in the Whop
   dashboard, ws_ prefix included, as utf8 bytes.
   Digest = base64. Confirmed by testing every
   combination against a real delivery.
   ────────────────────────────────────────────────── */
function verifyWhop(req) {
  const id  = req.headers['webhook-id'];
  const ts  = req.headers['webhook-timestamp'];
  const sig = req.headers['webhook-signature'];

  if (!id || !ts || !sig) throw new Error('missing headers');

  // Reject replays: anything outside a 5 minute window
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) {
    throw new Error('timestamp too old');
  }

  if (!process.env.WHOP_WEBHOOK_SECRET) {
    throw new Error('WHOP_WEBHOOK_SECRET is not set');
  }

  const body   = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body));
  const signed = `${id}.${ts}.${body.toString('utf8')}`;

  const expected = crypto
    .createHmac('sha256', Buffer.from(process.env.WHOP_WEBHOOK_SECRET, 'utf8'))
    .update(signed)
    .digest('base64');

  // Header format: "v1,<sig>" — may hold several space-separated versions
  const ok = sig.split(' ').some((part) => {
    const value = part.split(',')[1];
    if (!value || value.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(expected));
  });

  if (!ok) throw new Error('signature mismatch');

  return JSON.parse(body.toString('utf8'));
}


/* Checkout metadata does not sit at data.metadata. Whop nests
   it differently per event — under checkout_session, membership
   or plan — so walk the payload and take the first object that
   carries a user_id. */
function findMeta(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return {};

  if (obj.user_id) return obj;

  if (obj.metadata && typeof obj.metadata === 'object' && obj.metadata.user_id) {
    return obj.metadata;
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object') {
      const found = findMeta(value, depth + 1);
      if (found.user_id) return found;
    }
  }

  return {};
}


// ── Whop Webhook ──
router.post('/webhook', async (req, res) => {
  let webhook;

  try {
    webhook = verifyWhop(req);
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
  console.log('PAYLOAD:', JSON.stringify(webhook, null, 2));
  // Newer payloads use `action`, older ones use `event`/`type`
  const raw   = webhook.action || webhook.event || webhook.type || '';
  const event = raw.replace(/_/g, '.');
  const data  = webhook.data || {};

  const meta = findMeta(data);

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