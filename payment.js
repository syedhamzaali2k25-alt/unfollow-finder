const API_URL = 'http://localhost:5000';
    const STRIPE_PUBLIC_KEY = 'pk_test_51Tnj5wRrvv2KnLCLJN2t4gW3zt4M0xFG8DkYMMC51OuuskjxYBH2aiR60CxVnydeSz9po1v3CVidPL0ksFS5JTWB00fF7HuOWt';

    let selectedPlan = 'pro';
    let stripe, cardNumberElement, cardExpiryElement, cardCvcElement;

    const planData = {
      pro:  { label: 'Pro Plan',  price: '$9.00',  total: '$9.00',  btnText: 'Pay $9.00 → Start Pro' },
      team: { label: 'Team Plan', price: '$29.00', total: '$29.00', btnText: 'Pay $29.00 → Start Team' }
    };

    const brandIcons = {
      visa: '<svg viewBox="0 0 48 32" fill="none"><rect width="48" height="32" rx="5" fill="#fff"/><path d="M19.5 21.5h-2.6l1.6-10h2.6l-1.6 10zm11.7-9.7c-.5-.2-1.4-.4-2.4-.4-2.6 0-4.5 1.4-4.5 3.3 0 1.5 1.3 2.2 2.3 2.7 1 .5 1.4.8 1.4 1.3 0 .7-.8 1-1.6 1-1.1 0-1.6-.2-2.5-.5l-.3-.2-.4 2.2c.6.3 1.8.5 3 .5 2.7 0 4.6-1.4 4.6-3.4 0-1.1-.7-2-2.3-2.7-1-.4-1.6-.7-1.6-1.2 0-.4.5-.9 1.5-.9.9 0 1.5.2 2 .4l.2.1.4-2.2zm6.3-.3h-2c-.6 0-1.1.2-1.4.9l-3.9 9.1h2.7l.5-1.5h3.3l.3 1.5h2.4l-2-10zm-3.2 6.4l1-2.7c0 0 .2-.6.3-1l.2.9.6 2.8h-2.1zM15 11.5l-2.5 6.8-.3-1.4c-.5-1.6-1.9-3.4-3.5-4.3l2.3 8.9h2.7l4.1-10H15z" fill="#1434CB"/></svg>',
      mastercard: '<svg viewBox="0 0 48 32" fill="none"><rect width="48" height="32" rx="5" fill="#fff"/><circle cx="19" cy="16" r="9" fill="#EB001B"/><circle cx="29" cy="16" r="9" fill="#F79E1B"/><path d="M24 9.5a9 9 0 0 1 0 13 9 9 0 0 1 0-13z" fill="#FF5F00"/></svg>',
      amex: '<svg viewBox="0 0 48 32" fill="none"><rect width="48" height="32" rx="5" fill="#1F72CD"/><text x="24" y="20" font-family="Arial" font-size="9" font-weight="700" fill="#fff" text-anchor="middle">AMEX</text></svg>',
      discover: '<svg viewBox="0 0 48 32" fill="none"><rect width="48" height="32" rx="5" fill="#fff"/><text x="24" y="20" font-family="Arial" font-size="7.5" font-weight="700" fill="#FF6000" text-anchor="middle">DISC</text></svg>',
      unknown: '<svg viewBox="0 0 24 16" fill="none"><rect x="0.5" y="0.5" width="23" height="15" rx="2" stroke="#c4c4d4"/><rect x="0.5" y="4" width="23" height="2.5" fill="#c4c4d4"/></svg>'
    };

    window.addEventListener('DOMContentLoaded', () => {
      const token = localStorage.getItem('token');
      if (!token) {
        document.getElementById('auth-warning').style.display = 'block';
      }

      const params = new URLSearchParams(window.location.search);
      const urlPlan = params.get('plan');
      if (urlPlan === 'team') {
        const cards = document.querySelectorAll('.plan-card');
        cards[0].classList.remove('selected');
        cards[1].classList.add('selected');
        selectedPlan = 'team';
        updateSummary('team');
      }

      stripe = Stripe(STRIPE_PUBLIC_KEY);
      const elements = stripe.elements();

      const elementStyle = {
        base: {
          fontSize: '15px',
          fontFamily: "'Inter', sans-serif",
          color: '#0f0f12',
          '::placeholder': { color: '#a0a0b0' }
        },
        invalid: { color: '#ef4444' }
      };

      cardNumberElement = elements.create('cardNumber', { style: elementStyle, showIcon: false });
      cardExpiryElement = elements.create('cardExpiry', { style: elementStyle });
      cardCvcElement    = elements.create('cardCvc', { style: elementStyle });

      cardNumberElement.mount('#card-number-element');
      cardExpiryElement.mount('#card-expiry-element');
      cardCvcElement.mount('#card-cvc-element');

      const cardRow = document.getElementById('card-row');
      const brandIconWrap = document.getElementById('brand-icon-wrap');

      [cardNumberElement, cardExpiryElement, cardCvcElement].forEach(el => {
        el.on('focus', () => cardRow.classList.add('focused'));
        el.on('blur', () => cardRow.classList.remove('focused'));
      });

      cardNumberElement.on('change', e => {
        const brand = e.brand && brandIcons[e.brand] ? e.brand : 'unknown';
        brandIconWrap.innerHTML = brandIcons[brand];
        document.getElementById('card-error').textContent = e.error ? e.error.message : '';
        cardRow.classList.toggle('invalid', !!e.error);
      });
      cardExpiryElement.on('change', e => {
        document.getElementById('card-error').textContent = e.error ? e.error.message : '';
      });
      cardCvcElement.on('change', e => {
        document.getElementById('card-error').textContent = e.error ? e.error.message : '';
      });
    });

    function selectPlan(plan, card) {
      document.querySelectorAll('.plan-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedPlan = plan;
      updateSummary(plan);
    }

    function updateSummary(plan) {
      const d = planData[plan];
      document.getElementById('summary-plan').textContent  = d.label;
      document.getElementById('summary-price').textContent = d.price + '/mo';
      document.getElementById('summary-total').textContent = d.total;
      document.getElementById('pay-btn').textContent       = d.btnText;
    }

    async function handlePayment() {
      const token = localStorage.getItem('token');
      if (!token) {
        alert('Pehle login karo!');
        window.location.href = 'index.html';
        return;
      }

      const name = document.getElementById('card-name').value.trim();
      if (!name) {
        document.getElementById('card-error').textContent = 'Please enter name on card.';
        return;
      }

      const btn = document.getElementById('pay-btn');
      btn.disabled = true;
      btn.innerHTML = '<div class="spinner"></div> Processing…';
      document.getElementById('card-error').textContent = '';

      try {
        const intentRes = await fetch(`${API_URL}/api/payments/create-payment-intent`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ plan: selectedPlan })
        });

        const intentData = await intentRes.json();
        console.log('Intent response:', intentData);
        if (!intentRes.ok) throw new Error(intentData.error || 'Payment intent failed');

        const { paymentIntent, error } = await stripe.confirmCardPayment(intentData.clientSecret, {
          payment_method: {
            card: cardNumberElement,
            billing_details: { name }
          }
        });

        if (error) throw new Error(error.message);

        const confirmRes = await fetch(`${API_URL}/api/payments/confirm-payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            paymentIntentId: paymentIntent.id,
            plan: selectedPlan
          })
        });

        const confirmData = await confirmRes.json();
        console.log('Confirm response:', confirmData);
        if (!confirmRes.ok) throw new Error(confirmData.error || 'Confirmation failed');

        localStorage.setItem('isPaid', 'true');
        localStorage.setItem('userPlan', selectedPlan);

        document.getElementById('pay-box').style.display    = 'none';
        document.getElementById('plan-grid').style.display  = 'none';
        document.getElementById('success-box').style.display = 'block';
        document.getElementById('success-msg').textContent  =
          `Welcome to ${selectedPlan === 'pro' ? 'Pro' : 'Team'}! You now have unlimited access.`;

      } catch (err) {
        console.error('Payment error:', err);
        document.getElementById('card-error').textContent = '❌ ' + err.message;
        btn.disabled = false;
        btn.textContent = planData[selectedPlan].btnText;
      }
    }