/* ── Payment & Stripe Routes ────────────────────────────── */

const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const pool = require('../config/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// CREATE PAYMENT INTENT
router.post('/create-payment-intent', authMiddleware, async (req, res) => {
  try {
    const { plan } = req.body;
    const userId = req.user.id;

    // Plan pricing
    const plans = {
      pro: 900,      // $9.00
      team: 2900     // $29.00
    };

    const amount = plans[plan];

    if (!amount) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      metadata: { userId, plan }
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      amount,
      plan
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// CONFIRM PAYMENT
router.post('/confirm-payment', authMiddleware, async (req, res) => {
  try {
    const { paymentIntentId, plan } = req.body;
    const userId = req.user.id;

    // Get payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({ error: 'Payment failed' });
    }

    // Update user plan
    await pool.query(
      'UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2',
      [plan, userId]
    );

    // Create subscription record
    const subscriptionResult = await pool.query(
      'INSERT INTO subscriptions (user_id, plan, stripe_payment_id, status, current_period_start, current_period_end) VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL \'1 month\') RETURNING id',
      [userId, plan, paymentIntentId, 'active']
    );

    // Record payment
    const amount = paymentIntent.amount / 100;
    await pool.query(
      'INSERT INTO payments (user_id, subscription_id, stripe_payment_id, amount, status) VALUES ($1, $2, $3, $4, $5)',
      [userId, subscriptionResult.rows[0].id, paymentIntentId, amount, 'succeeded']
    );

    res.json({
      message: 'Payment successful',
      plan,
      subscriptionId: subscriptionResult.rows[0].id
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET SUBSCRIPTION
router.get('/subscription', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      'SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    const subscription = result.rows[0];

    if (!subscription) {
      return res.json({ subscription: null });
    }

    res.json({
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        createdAt: subscription.created_at
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// CANCEL SUBSCRIPTION
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    // Update subscription status
    await pool.query(
      'UPDATE subscriptions SET status = $1, updated_at = NOW() WHERE user_id = $2 AND status = $3',
      ['canceled', userId, 'active']
    );

    // Revert to free plan
    await pool.query(
      'UPDATE users SET plan = $1, updated_at = NOW() WHERE id = $2',
      ['free', userId]
    );

    res.json({ message: 'Subscription canceled' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// WEBHOOK (Stripe events)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    // Handle events
    switch (event.type) {
      case 'payment_intent.succeeded':
        console.log('Payment succeeded:', event.data.object.id);
        break;

      case 'invoice.payment_failed':
        console.log('Payment failed:', event.data.object.id);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });

  } catch (err) {
    console.error('Webhook error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

module.exports = router;