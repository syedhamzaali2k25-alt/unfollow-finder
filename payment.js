/* ============================================================
   Unfollow Finder — Payment page (Whop embedded checkout)
   ============================================================ */

const API_URL = location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://unfollowfinder.com';   // <-- apna live backend URL yahan

/* ⚠️ IMPORTANT — Whop dashboard se plan IDs yahan daalo.
   Milti hain: Dashboard → Checkout links → link copy karo.
   Link aisa hoga: https://whop.com/checkout/plan_AbC123XyZ
   Us link se sirf "plan_AbC123XyZ" wala hissa copy karke yahan paste karo. */
const WHOP_PLANS = {
  pro:  'plan_GWnZ5AOeOgQ8H',
  team: 'plan_AKFe0ujyPP067',
  pro_yearly:  'plan_bL7g30cZZ2hjK',
  team_yearly: 'plan_KkLhTCyD3EiXq'
};

const planData = {
  pro:  { label: 'Pro Plan',  price: '$5.00',  total: '$0.00', note: '7-day free trial' },
  team: { label: 'Team Plan', price: '$12.00', total: '$0.00', note: '7-day free trial' }
};

let selectedPlan = 'pro';
let currentUser  = null;


/* ── INIT ─────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');

  if (!token) {
    showAuthWarning();
    return;
  }

  // Server se user info lao (metadata mein bhejni hai)
  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) throw new Error('auth failed');

    const data = await res.json();
    currentUser = data.user;

    if (!currentUser || !currentUser.id) throw new Error('no user');

  } catch (err) {
    console.error('Auth check failed:', err.message);
    showAuthWarning();
    return;
  }

  // Agar already paid hai to seedha dashboard
  if (currentUser.plan && currentUser.plan !== 'free') {
    showSuccess(currentUser.plan);
    return;
  }

  // URL se plan pre-select karo (?plan=team)
  const urlPlan = new URLSearchParams(location.search).get('plan');
  if (urlPlan === 'team') {
    const cards = document.querySelectorAll('.plan-card');
    cards[0].classList.remove('selected');
    cards[1].classList.add('selected');
    selectedPlan = 'team';
  }

  updateSummary(selectedPlan);
  mountCheckout();
});


/* ── PLAN SELECTION ───────────────────────────── */
function selectPlan(plan, card) {
  if (plan === selectedPlan) return;

  document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');

  selectedPlan = plan;
  updateSummary(plan);
  mountCheckout();
}

function updateSummary(plan) {
  const d = planData[plan];
  document.getElementById('summary-plan').textContent  = d.label;
  document.getElementById('summary-price').textContent = d.price + '/mo';
  document.getElementById('summary-total').textContent = d.total;
}


/* ── WHOP EMBEDDED CHECKOUT ───────────────────── */
function mountCheckout() {
  if (!currentUser) return;

  const billing = new URLSearchParams(location.search).get('billing') === 'yearly'
    ? '_yearly' : '';
  const planId = WHOP_PLANS[selectedPlan + billing];

  if (!planId || planId.includes('REPLACE_ME')) {
    document.getElementById('whop-checkout-mount').innerHTML =
      '<div style="padding:24px;text-align:center;color:#b8004c;font-size:14px;">' +
      'Checkout not configured Whop plan ID missing.</div>';
    return;
  }

  const mount = document.getElementById('whop-checkout-mount');
  mount.innerHTML = '';

  const el = document.createElement('div');
  el.setAttribute('data-whop-checkout-plan-id', planId);
  el.setAttribute('data-whop-checkout-theme', 'light');
  el.setAttribute('data-whop-checkout-theme-accent-color', '#E1005E');
  el.setAttribute('data-whop-checkout-on-complete', 'stay_in_iframe');

  if (currentUser.email) {
    el.setAttribute('data-whop-checkout-prefill-email', currentUser.email);
  }

  // Ye metadata webhook mein wapas milega — isi se pata chalega kis user ne pay kiya
  el.setAttribute('data-whop-checkout-session-metadata', JSON.stringify({
    user_id: String(currentUser.id),
    plan: selectedPlan
  }));

  mount.appendChild(el);

  // Loader script agar already load ho chuki hai to manually mount karo
  if (window.wco && typeof window.wco.mount === 'function') {
    window.wco.mount(el);
  }
}


/* ── CHECKOUT COMPLETE ────────────────────────── */
/* Whop iframe se message aata hai jab payment complete ho jaye.
   Hum us par bharosa nahi karte — sirf server se dobara confirm karte hain. */
window.addEventListener('message', (event) => {
  if (!event.origin.includes('whop.com')) return;

  const type = event.data?.event || event.data?.type;
  if (type === 'checkout_complete' || type === 'payment_success') {
    verifyPlanWithServer();
  }
});

async function verifyPlanWithServer(attempt = 0) {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    const plan = data.user?.plan || 'free';

    if (plan !== 'free') {
      showSuccess(plan);
      return;
    }
  } catch (err) {
    console.error('Verify failed:', err.message);
  }

  // Webhook thoda late aa sakta hai — 5 baar tak retry karo
  if (attempt < 5) {
    setTimeout(() => verifyPlanWithServer(attempt + 1), 2000);
  }
}


/* ── UI HELPERS ───────────────────────────────── */
function showAuthWarning() {
  document.getElementById('auth-warning').style.display = 'block';
  document.getElementById('pay-box').style.display = 'none';
  document.getElementById('plan-grid').style.display = 'none';
}

function showSuccess(plan) {
  document.getElementById('pay-box').style.display     = 'none';
  document.getElementById('plan-grid').style.display   = 'none';
  document.getElementById('auth-warning').style.display = 'none';
  document.getElementById('success-box').style.display = 'block';
  document.getElementById('success-msg').textContent   =
    `Welcome to ${plan === 'team' ? 'Team' : 'Pro'}! You now have unlimited access.`;
}