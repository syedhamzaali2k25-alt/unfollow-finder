/* ============================================================
   Unfollow Finder — Contact form
   ============================================================ */

const API_URL = location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://unfollowfinder.com';   // <-- live backend URL

const MAX_CHARS = 1500;

document.addEventListener('DOMContentLoaded', () => {

  /* ── Mobile menu ── */
  const burger = document.getElementById('hamburger');
  const menu   = document.getElementById('mobile-menu');
  if (burger && menu) {
    burger.addEventListener('click', () => {
      burger.classList.toggle('open');
      menu.classList.toggle('open');
    });
  }

  /* ── Navbar shadow on scroll ── */
  const nav = document.getElementById('navbar');
  if (nav) {
    window.addEventListener('scroll', () => {
      nav.classList.toggle('scrolled', window.scrollY > 4);
    }, { passive: true });
  }

  /* ── Character counter ── */
  const msg   = document.getElementById('ct-message');
  const chars = document.getElementById('ct-chars');

  msg.addEventListener('input', () => {
    const n = msg.value.length;
    chars.textContent = n;
    chars.parentElement.classList.toggle('is-over', n > MAX_CHARS);
  });

  /* ── Clear errors as the user types ── */
  ['ct-name', 'ct-email', 'ct-message'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => clearError(id));
  });

  /* ── Submit ── */
  document.getElementById('contact-form')
    .addEventListener('submit', handleSubmit);
});


/* ── VALIDATION ─────────────────────────────── */
function showError(id, text) {
  document.getElementById(id).classList.add('is-bad');
  const box = document.getElementById('err-' + id.replace('ct-', ''));
  if (box) { box.textContent = text; box.classList.add('is-on'); }
}

function clearError(id) {
  document.getElementById(id).classList.remove('is-bad');
  const box = document.getElementById('err-' + id.replace('ct-', ''));
  if (box) box.classList.remove('is-on');
}

function validate(name, email, message) {
  let ok = true;

  if (name.length < 2) {
    showError('ct-name', 'Please enter your name.');
    ok = false;
  }

  // Deliberately loose — strict email regexes reject valid addresses
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    showError('ct-email', 'That email address doesn\'t look right.');
    ok = false;
  }

  if (message.length < 10) {
    showError('ct-message', 'Tell us a little more at least 10 characters.');
    ok = false;
  } else if (message.length > MAX_CHARS) {
    showError('ct-message', `Please keep it under ${MAX_CHARS} characters.`);
    ok = false;
  }

  return ok;
}


/* ── SUBMIT ─────────────────────────────────── */
async function handleSubmit(e) {
  e.preventDefault();

  const name    = document.getElementById('ct-name').value.trim();
  const email   = document.getElementById('ct-email').value.trim();
  const topic   = document.getElementById('ct-topic').value;
  const message = document.getElementById('ct-message').value.trim();
  const trap    = document.getElementById('ct-website').value;

  ['ct-name', 'ct-email', 'ct-message'].forEach(clearError);
  hideFail();

  // Honeypot filled → bot. Show success, send nothing.
  if (trap) { showSent(); return; }

  if (!validate(name, email, message)) return;

  const btn   = document.getElementById('ct-submit');
  const label = document.getElementById('ct-submit-label');

  btn.disabled = true;
  label.innerHTML = '<span class="ct-spin"></span> Sending';

  try {
    const res = await fetch(`${API_URL}/api/contact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, topic, message })
    });

    if (!res.ok) throw new Error('send failed');

    showSent();

  } catch (err) {
    console.error('Contact form:', err.message);
    showFail();
    btn.disabled = false;
    label.textContent = 'Send message';
  }
}


/* ── UI ─────────────────────────────────────── */
function showSent() {
  document.getElementById('contact-form').style.display = 'none';
  document.getElementById('ct-sent').classList.add('is-on');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showFail() {
  let box = document.querySelector('.ct-fail');

  if (!box) {
    box = document.createElement('div');
    box.className = 'ct-fail';
    const form = document.getElementById('contact-form');
    form.insertBefore(box, form.firstChild);
  }

  box.innerHTML =
    'We couldn\'t send that just now. Try again, or email us at ' +
    '<a href="mailto:support@unfollowfinder.com" style="color:inherit;font-weight:600;text-decoration:underline">' +
    'support@unfollowfinder.com</a>.';
  box.classList.add('is-on');
}

function hideFail() {
  const box = document.querySelector('.ct-fail');
  if (box) box.classList.remove('is-on');
}