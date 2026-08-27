/* ── Unfollow Finder – script.js ─────────────────────── */

const SUPABASE_URL = 'https://uqfaqhphzomnxpnqrpls.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxZmFxaHBoem9tbnhwbnFycGxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MDQ0MjAsImV4cCI6MjA5NzM4MDQyMH0.KEfbxJB_GMTqUjeRATAdzpCWfdYeYXNhCb2Nb_pUBZs';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Same origin in production, local server in dev
const API_URL = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
  ? 'http://localhost:5000'
  : '';

let authState = {
  isLoggedIn: localStorage.getItem('userEmail') ? true : false,
  userEmail: localStorage.getItem('userEmail') || null,
  pendingFile: null,
  pendingPayment: null
};


document.addEventListener('DOMContentLoaded', async () => {

  /* ── Google OAuth redirect ── */
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (session && session.user) {
    const email = session.user.email;
    const token = session.access_token;

    localStorage.setItem('token', token);
    localStorage.setItem('userEmail', email);

    authState.isLoggedIn = true;
    authState.userEmail = email;

    try {
      await fetch(`${API_URL}/api/auth/google-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          fullName: session.user.user_metadata?.full_name || ''
        })
      });
    } catch (e) {
      console.log('Google sync failed:', e.message);
    }
  }

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      localStorage.setItem('token', session.access_token);
      localStorage.setItem('userEmail', session.user.email);
      authState.isLoggedIn = true;
      authState.userEmail = session.user.email;
      updateAuthUI();
      closeAuth();
    }

    if (event === 'SIGNED_OUT') {
      localStorage.removeItem('token');
      localStorage.removeItem('userEmail');
      authState.isLoggedIn = false;
      authState.userEmail = null;
      updateAuthUI();
    }
  });

  updateAuthUI();
  setTimeout(initOneTap, 800);


  /* ── 1. NAVBAR ── */
  const navbar = document.getElementById('navbar');
  if (navbar) {
    const onScroll = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 10);
      highlightNavLink();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function highlightNavLink() {
    const sections = document.querySelectorAll('section[id]');
    const links = document.querySelectorAll('.nav-links a');
    let current = '';
    sections.forEach(sec => {
      if (window.scrollY >= sec.offsetTop - 120) current = sec.id;
    });
    links.forEach(link => {
      const href = (link.getAttribute('href') || '').replace('#', '');
      link.style.color = href && href === current ? 'var(--pink)' : '';
    });
  }


  /* ── 2. HAMBURGER ── */
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const isOpen = hamburger.classList.toggle('open');
      mobileMenu.classList.toggle('open', isOpen);
      hamburger.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    });

    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('open');
        mobileMenu.classList.remove('open');
      });
    });
  }


  /* ── 3. FADE-UPS ── */
  const fadeEls = document.querySelectorAll(
    '.feat-card, .step, .price-card, .testi-card, .section-head, .faq-item'
  );
  fadeEls.forEach(el => el.classList.add('fade-up'));

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  fadeEls.forEach(el => observer.observe(el));


  /* ── 4. FAQ ACCORDION ── */
  document.querySelectorAll('.faq-q').forEach(btn => {
    btn.addEventListener('click', () => {
      const item   = btn.closest('.faq-item');
      const answer = item.querySelector('.faq-a');
      const isOpen = btn.getAttribute('aria-expanded') === 'true';

      document.querySelectorAll('.faq-q').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        b.closest('.faq-item').querySelector('.faq-a').classList.remove('open');
      });

      if (!isOpen) {
        btn.setAttribute('aria-expanded', 'true');
        answer.classList.add('open');
      }
    });
  });


  /* ── 5. SMOOTH SCROLL ── */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const href = anchor.getAttribute('href');
      if (href === '#' || href.length <= 1) return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

});


/* ═════════════════════════════════════════════════
   UPLOAD TOOL
   ═════════════════════════════════════════════════ */
const _tool = {
  followers: null,
  following: null,
  lists: { nf: [], fans: [], mutual: [] },
  activeTab: 'nf',
};

function handleFile(input, type) {
  const file = input.files[0];
  if (!file) return;

  if (!authState.isLoggedIn) {
    authState.pendingFile = { input, type, file };
    openAuth('signup');
    return;
  }

  processFile(file, type);
}

function processFile(file, type) {
  const reader = new FileReader();

  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target.result);
      _tool[type] = extractUsernames(json);

      if (_tool[type].length === 0) {
        alert('No usernames found in this file. Make sure you picked the right one from the followers_and_following folder.');
        return;
      }

      document.getElementById('slot-' + type).classList.add('loaded');
      document.getElementById('fn-' + type).textContent = '✓ ' + file.name;

      if (_tool.followers && _tool.following) {
        document.getElementById('tool-check-btn').disabled = false;
      }
    } catch (err) {
      console.error('Parse error:', err);
      alert('Could not read this file. Make sure it is a valid Instagram JSON export.');
    }
  };

  reader.readAsText(file);
}

function extractUsernames(json) {
  const users = new Set();

  function walk(node) {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === 'object') {
      if (Array.isArray(node.string_list_data)) {
        node.string_list_data.forEach(u => {
          if (u.value) users.add(u.value);
        });
      }
      if (typeof node.title === 'string' && node.title.trim()) {
        users.add(node.title.trim());
      }
      Object.values(node).forEach(walk);
    }
  }

  walk(json);
  return [...users];
}


async function runAnalysis() {
  const btn = document.getElementById('tool-check-btn');

  // Most common mistake: the same file picked for both slots.
  // Identical lists mean 0 non-followers, which looks like a broken tool.
  if (sameList(_tool.followers, _tool.following)) {
    alert(
      'Both slots have the same file.\n\n' +
      'Pick followers_1.json for the first slot and following.json for the second.'
    );
    return;
  }

  btn.disabled = true;

  const follSet = new Set(_tool.followers);
  const folwSet = new Set(_tool.following);

  // You follow them, they don't follow back
  _tool.lists.nf     = _tool.following.filter(u => !follSet.has(u));
  // They follow you, you don't follow back
  _tool.lists.fans   = _tool.followers.filter(u => !folwSet.has(u));
  // Both ways
  _tool.lists.mutual = _tool.following.filter(u => follSet.has(u));

  /* ── Save to backend. The server enforces the daily limit,
        so we let it decide rather than trusting localStorage. ── */
  const token = localStorage.getItem('token');
  let saveFailed = false;

  if (token) {
    try {
      const res = await fetch(`${API_URL}/api/scans/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          platform: 'instagram',
          followers: _tool.followers,
          following: _tool.following
        })
      });

      if (res.status === 429) {
        const data = await res.json();
        btn.disabled = false;
        showLimitReached(data.message);
        return;
      }

      if (!res.ok) {
        console.warn('Scan save failed:', res.status);
        saveFailed = true;
      }
    } catch (err) {
      console.warn('Scan save failed:', err.message);
      saveFailed = true;
    }
  }

  document.getElementById('r-following').textContent   = _tool.following.length;
  document.getElementById('r-followers').textContent   = _tool.followers.length;
  document.getElementById('r-unfollowers').textContent = _tool.lists.fans.length;
  document.getElementById('r-notback').textContent     = _tool.lists.nf.length;
  document.getElementById('r-mutual').textContent      = _tool.lists.mutual.length;

  document.getElementById('cnt-nf').textContent     = _tool.lists.nf.length;
  document.getElementById('cnt-unf').textContent    = _tool.lists.fans.length;
  document.getElementById('cnt-mutual').textContent = _tool.lists.mutual.length;

  document.getElementById('tool-upload').style.display  = 'none';
  document.getElementById('tool-results').style.display = 'block';

  // Start on the tab that actually has results
  _tool.activeTab = 'nf';
  document.querySelectorAll('.res-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === 'nf');
  });
  renderList('nf', '');

  document.getElementById('tool-results')
    .scrollIntoView({ behavior: 'smooth', block: 'start' });

  addDashboardLink();

  if (saveFailed) showSaveWarning();
}


function sameList(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  const set = new Set(a);
  return b.every(u => set.has(u));
}


function showSaveWarning() {
  if (document.getElementById('save-warn')) return;

  const box = document.createElement('div');
  box.id = 'save-warn';
  box.style.cssText =
    'background:#FEF5E7;border-radius:12px;padding:13px 16px;margin-bottom:16px;' +
    'font-size:13px;color:#8A4B00;line-height:1.55';
  box.textContent =
    "These results are correct, but we couldn't save this scan — " +
    "so it won't count towards your unfollow tracking. Try again in a moment.";

  const panel = document.getElementById('tool-results');
  panel.insertBefore(box, panel.firstChild);
}


function showLimitReached(message) {
  const panel = document.getElementById('tool-upload');

  let box = document.getElementById('limit-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'limit-box';
    box.style.cssText =
      'background:#FFF0F6;border-radius:14px;padding:20px 22px;margin-top:18px;text-align:center';
    panel.appendChild(box);
  }

  box.innerHTML = `
    <p style="font-size:15px;font-weight:650;color:#15151E;margin-bottom:6px">
      Daily limit reached
    </p>
    <p style="font-size:13.5px;color:#6C6C82;margin-bottom:16px">
      ${message || 'Free accounts get 1 scan per day. Pro gets unlimited.'}
    </p>
    <a href="/pricing" class="btn-primary" style="text-decoration:none">See Pro plans</a>`;

  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}


function addDashboardLink() {
  if (document.getElementById('dash-link-btn')) return;

  const btn = document.createElement('a');
  btn.id = 'dash-link-btn';
  btn.href = '/dashboard';
  btn.className = 'btn-primary';
  btn.style.cssText = 'margin-top:12px;width:100%;justify-content:center;height:46px;text-decoration:none';
  btn.textContent = 'View full dashboard →';
  document.getElementById('tool-results').appendChild(btn);
}


function switchResultTab(btn) {
  document.querySelectorAll('.res-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  _tool.activeTab = btn.dataset.tab;
  document.getElementById('res-search').value = '';
  renderList(_tool.activeTab, '');
}

function filterResults(query) {
  renderList(_tool.activeTab, query);
}


function renderList(tab, query) {
  const q    = query.toLowerCase();
  const list = (_tool.lists[tab] || []).filter(u => u.toLowerCase().includes(q));
  const el   = document.getElementById('res-list');

  if (list.length === 0) {
    el.innerHTML = emptyResult(tab, query);
    return;
  }

  const badgeMap = {
    nf:     { cls: 'nf',     label: "Doesn't follow back" },
    fans:   { cls: 'unf',    label: 'Fan' },
    mutual: { cls: 'mutual', label: 'Mutual' },
  };
  const badge = badgeMap[tab];

  const SHOW = 300;
  const rows = list.slice(0, SHOW).map(u => {
    const initials = u.slice(0, 2).toUpperCase();
    const hue      = [...u].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    return `
      <div class="res-row">
        <div class="res-avatar" style="background:hsl(${hue},55%,42%)">${escapeHtml(initials)}</div>
        <a class="res-uname" href="https://instagram.com/${encodeURIComponent(u)}"
           target="_blank" rel="noopener noreferrer">@${escapeHtml(u)}</a>
        <span class="res-badge ${badge.cls}">${badge.label}</span>
      </div>`;
  }).join('');

  const overflow = list.length > SHOW
    ? `<div class="res-empty" style="padding:12px">Showing ${SHOW} of ${list.length} — use search to narrow down</div>`
    : '';

  el.innerHTML = rows + overflow;
}


function emptyResult(tab, query) {
  if (query) {
    return `<div class="res-empty">Nothing matches “${escapeHtml(query)}”</div>`;
  }

  const msg = {
    nf:     'Everyone you follow follows you back 🎉',
    fans:   'Nobody follows you that you don\'t already follow back',
    mutual: 'No mutual follows found'
  }[tab];

  return `<div class="res-empty">${msg}</div>`;
}


function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}


function exportCSV() {
  const tab  = _tool.activeTab;
  const list = _tool.lists[tab];
  if (!list || !list.length) return;

  const labelMap = {
    nf: 'Not following back',
    fans: 'Fan',
    mutual: 'Mutual'
  };

  // Neutralise leading characters Excel treats as a formula
  const cell = v => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };

  const rows = [
    ['Username', 'Profile URL', 'Status'],
    ...list.map(u => [u, `https://instagram.com/${u}`, labelMap[tab]])
  ];

  const csv  = rows.map(r => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');

  a.href = url;
  a.download = `unfollow-finder-${tab}-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


function resetTool() {
  _tool.followers = null;
  _tool.following = null;
  _tool.lists     = { nf: [], fans: [], mutual: [] };
  _tool.activeTab = 'nf';

  ['followers', 'following'].forEach(type => {
    const slot = document.getElementById('slot-' + type);
    if (!slot) return;
    slot.classList.remove('loaded');
    document.getElementById('fn-' + type).textContent = '';
    document.getElementById('inp-' + type).value      = '';
  });

  const limitBox = document.getElementById('limit-box');
  if (limitBox) limitBox.remove();

  document.getElementById('tool-check-btn').disabled    = true;
  document.getElementById('tool-upload').style.display  = 'block';
  document.getElementById('tool-results').style.display = 'none';
  document.getElementById('res-list').innerHTML         = '';
  document.getElementById('res-search').value           = '';

  document.getElementById('tool').scrollIntoView({ behavior: 'smooth', block: 'start' });
}


/* ═════════════════════════════════════════════════
   PAYMENT
   ═════════════════════════════════════════════════ */
function goToPayment(plan) {
  const token = localStorage.getItem('token');

  if (!token) {
    authState.pendingPayment = plan;
    openAuth('signup');
    return;
  }

  window.location.href = `/payment?plan=${encodeURIComponent(plan)}`;
}


/* ═════════════════════════════════════════════════
   AUTH MODAL
   ═════════════════════════════════════════════════ */
const overlay  = document.getElementById('auth-overlay');
const modal    = document.getElementById('auth-modal');
const closeBtn = document.getElementById('auth-close');

function openAuth(tab = 'signup') {
  if (!overlay) return;
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  switchAuthTab(tab);
  setTimeout(() => {
    const first = modal.querySelector('input:not([style*="display:none"])');
    if (first) first.focus();
  }, 280);
}

function closeAuth() {
  if (!overlay) return;
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  resetAuthForms();
}

if (overlay) {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeAuth();
  });
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && overlay && overlay.classList.contains('open')) closeAuth();
});

if (closeBtn) closeBtn.addEventListener('click', closeAuth);


function switchAuthTab(tab) {
  const tabs       = document.querySelectorAll('.auth-tab');
  const formSignup = document.getElementById('form-signup');
  const formLogin  = document.getElementById('form-login');
  const switchTxt  = document.getElementById('auth-switch-text');

  tabs.forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');

  if (tab === 'signup') {
    formSignup.style.display = 'flex';
    formLogin.style.display  = 'none';
    switchTxt.innerHTML = 'Already have an account? <button onclick="switchAuthTab(\'login\')">Log in</button>';
  } else {
    formSignup.style.display = 'none';
    formLogin.style.display  = 'flex';
    switchTxt.innerHTML = 'Don\'t have an account? <button onclick="switchAuthTab(\'signup\')">Sign up free</button>';
  }

  clearErrors();
}


async function authWithProvider(provider) {
  const btn = event.currentTarget;

  if (provider !== 'google') return;

  btn.textContent = 'Connecting…';
  btn.disabled = true;

  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });

  if (error) {
    console.error('Google login error:', error.message);
    alert('Google sign-in failed: ' + error.message);
    btn.textContent = 'Continue with Google';
    btn.disabled = false;
  }
}


async function submitAuth(type) {
  clearErrors();
  let valid = true;

  if (type === 'signup') {
    const name  = document.getElementById('su-name');
    const email = document.getElementById('su-email');
    const pass  = document.getElementById('su-pass');

    if (!name.value.trim())         { markError(name);  valid = false; }
    if (!isValidEmail(email.value)) { markError(email); valid = false; }
    if (pass.value.length < 8)      { markError(pass);  valid = false; }
    if (!valid) { shakeModal(); return; }

    const btn = document.querySelector('#form-signup .auth-submit');
    btn.textContent = 'Creating account…';
    btn.classList.add('loading');
    btn.disabled = true;

    try {
      const res = await fetch(`${API_URL}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.value.trim(),
          password: pass.value,
          fullName: name.value.trim()
        })
      });

      const data = await res.json();

      if (!res.ok) {
        btn.textContent = 'Create free account';
        btn.classList.remove('loading');
        btn.disabled = false;
        alert(data.error || 'Sign-up failed');
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('userEmail', data.user.email);
      showAuthSuccess(data.user.email);

    } catch (err) {
      btn.textContent = 'Create free account';
      btn.classList.remove('loading');
      btn.disabled = false;
      alert('Could not reach the server. Please try again.');
    }

  } else {
    const email = document.getElementById('li-email');
    const pass  = document.getElementById('li-pass');

    if (!isValidEmail(email.value)) { markError(email); valid = false; }
    if (!pass.value)                { markError(pass);  valid = false; }
    if (!valid) { shakeModal(); return; }

    const btn = document.querySelector('#form-login .auth-submit');
    btn.textContent = 'Logging in…';
    btn.classList.add('loading');
    btn.disabled = true;

    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.value.trim(),
          password: pass.value
        })
      });

      const data = await res.json();

      if (!res.ok) {
        btn.textContent = 'Log in to Unfollow Finder';
        btn.classList.remove('loading');
        btn.disabled = false;
        alert(data.error || 'Login failed');
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('userEmail', data.user.email);
      showAuthSuccess(data.user.email);

    } catch (err) {
      btn.textContent = 'Log in to Unfollow Finder';
      btn.classList.remove('loading');
      btn.disabled = false;
      alert('Could not reach the server. Please try again.');
    }
  }
}


function showAuthSuccess(identifier) {
  authState.isLoggedIn = true;
  authState.userEmail = identifier;
  localStorage.setItem('userEmail', identifier);
  updateAuthUI();

  modal.innerHTML = `
    <div style="text-align:center;padding:32px 16px 16px">
      <div style="width:64px;height:64px;background:#E8F9F2;border-radius:18px;display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
          <path d="M4 12.5 9.5 18 20 7" stroke="#0E9F6E" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div style="font-family:'Roboto',sans-serif;font-size:23px;font-weight:900;letter-spacing:-.03em;color:#15151E;margin-bottom:10px">
        You're in
      </div>
      <p style="font-size:14.5px;color:#6C6C82;line-height:1.6;margin-bottom:26px">
        Upload your two files and see who's<br>not following you back.
      </p>
      <button onclick="handlePostAuthSuccess()"
        style="background:#E1005E;color:#fff;border:none;border-radius:10px;height:44px;padding:0 26px;font-size:14px;font-weight:650;cursor:pointer;font-family:'Inter',sans-serif">
        Check my followers
      </button>
      <p style="font-size:12px;color:#A2A2B6;margin-top:16px">${escapeHtml(identifier)}</p>
    </div>`;

  modal.style.maxWidth = '380px';

  if (authState.pendingPayment) {
    const plan = authState.pendingPayment;
    authState.pendingPayment = null;
    setTimeout(() => {
      window.location.href = `/payment?plan=${encodeURIComponent(plan)}`;
    }, 1400);
  }
}


function handlePostAuthSuccess() {
  closeAuth();

  if (authState.pendingFile) {
    const { file, type } = authState.pendingFile;
    processFile(file, type);
    authState.pendingFile = null;
  } else {
    const tool = document.getElementById('tool');
    if (tool) tool.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}


function updateAuthUI() {
  if (!authState.isLoggedIn) return;
  if (document.querySelector('.nav-user-wrap')) return;

  const loginBtns = document.querySelectorAll('.nav-actions a.btn-ghost, .nav-actions a.btn-primary');
  if (loginBtns.length === 0) return;

  const email = authState.userEmail || '';
  const initials = email.substring(0, 2).toUpperCase();
  const hue = [...email].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  let replaced = false;
  loginBtns.forEach((btn) => {
    const isAuthBtn = btn.textContent.includes('Log in')
                   || btn.textContent.includes('Login')
                   || btn.textContent.includes('Get started');

    if (isAuthBtn && !replaced) {
      btn.outerHTML = `
        <div class="nav-user-wrap" style="display:flex;align-items:center;gap:10px">
          <a href="/dashboard" class="nav-avatar" style="
            width:36px;height:36px;border-radius:50%;
            background:hsl(${hue},60%,45%);
            color:white;font-size:13px;font-weight:700;
            display:flex;align-items:center;justify-content:center;
            text-decoration:none" title="${escapeHtml(email)}">${escapeHtml(initials)}</a>
          <a href="#" onclick="event.preventDefault();logout();"
            style="font-size:13px;font-weight:500;color:#6C6C82;text-decoration:none">
            Log out
          </a>
        </div>`;
      replaced = true;
    } else {
      btn.style.display = 'none';
    }
  });
}


async function logout() {
  await supabaseClient.auth.signOut();
  authState.isLoggedIn = false;
  authState.userEmail = null;
  authState.pendingFile = null;
  localStorage.removeItem('userEmail');
  localStorage.removeItem('token');
  location.reload();
}


/* ═════════════════════════════════════════════════
   HELPERS
   ═════════════════════════════════════════════════ */
function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

function markError(input) {
  input.classList.add('error');
  input.addEventListener('input', () => input.classList.remove('error'), { once: true });
}

function clearErrors() {
  document.querySelectorAll('.auth-field input.error').forEach(i => i.classList.remove('error'));
}

function shakeModal() {
  modal.classList.remove('shake');
  void modal.offsetWidth;
  modal.classList.add('shake');
  modal.addEventListener('animationend', () => modal.classList.remove('shake'), { once: true });
}

function resetAuthForms() {
  document.querySelectorAll('.auth-field input').forEach(i => {
    i.value = '';
    i.classList.remove('error');
  });

  document.querySelectorAll('.auth-submit').forEach(b => {
    b.textContent = b.closest('#form-signup') ? 'Create free account' : 'Log in to Unfollow Finder';
    b.classList.remove('loading');
    b.disabled = false;
  });

  document.querySelectorAll('.social-btn').forEach(b => {
    b.disabled = false;
    b.innerHTML = b.classList.contains('google')
      ? '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg> Continue with Google'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg> Continue with Apple';
  });
}

function togglePass(inputId, btn) {
  const input = document.getElementById(inputId);
  const isText = input.type === 'text';
  input.type = isText ? 'password' : 'text';
  btn.style.color = isText ? '' : 'var(--pink)';
  btn.setAttribute('aria-label', isText ? 'Show password' : 'Hide password');
}

function demoStep(n) {
  document.querySelectorAll('.demo-step').forEach((el, i) => {
    el.classList.toggle('active', i === n);
  });
  document.querySelectorAll('.demo-gif-panel').forEach((el, i) => {
    el.classList.toggle('active', i === n);
  });
}


/* ═════════════════════════════════════════════════
   FEEDBACK WIDGET
   ═════════════════════════════════════════════════ */
(function () {
  const btn      = document.getElementById('feedbackBtn');
  const modalEl  = document.getElementById('feedbackModal');
  if (!btn || !modalEl) return;

  const closeBtn  = document.getElementById('feedbackClose');
  const step1     = document.getElementById('feedbackStep1');
  const step2     = document.getElementById('feedbackStep2');
  const step3     = document.getElementById('feedbackStep3');
  const prompt    = document.getElementById('feedbackPrompt');
  const submitBtn = document.getElementById('feedbackSubmit');

  let selectedRating = 0;

  btn.onclick = () => { modalEl.classList.add('active'); resetSteps(); };
  closeBtn.onclick = () => modalEl.classList.remove('active');
  modalEl.onclick = (e) => { if (e.target === modalEl) modalEl.classList.remove('active'); };

  function resetSteps() {
    step1.style.display = 'block';
    step2.style.display = 'none';
    step3.style.display = 'none';
    selectedRating = 0;
    document.getElementById('feedbackText').value = '';
    document.getElementById('feedbackEmail').value = '';
  }

  document.querySelectorAll('.emoji-btn').forEach(b => {
    b.onclick = () => {
      selectedRating = parseInt(b.dataset.rating);
      step1.style.display = 'none';
      step2.style.display = 'block';
      prompt.textContent = selectedRating >= 3
        ? 'What did you like most?'
        : 'What can we improve?';
    };
  });

  submitBtn.onclick = async () => {
    const feedback = {
      rating: selectedRating,
      comment: document.getElementById('feedbackText').value.trim(),
      email: document.getElementById('feedbackEmail').value.trim(),
      page: window.location.pathname,
      timestamp: new Date().toISOString()
    };

    try {
      await fetch(`${API_URL}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedback)
      });
    } catch (err) {
      console.log('Feedback failed:', err.message);
    }

    step2.style.display = 'none';
    step3.style.display = 'block';

    setTimeout(() => modalEl.classList.remove('active'), 2500);
  };
})();


/* ═════════════════════════════════════════════════
   ONBOARD BANNER
   ═════════════════════════════════════════════════ */
function closeOnboard() {
  const banner = document.getElementById('onboardBanner');
  if (banner) banner.style.display = 'none';
  localStorage.setItem('onboardDismissed', 'true');
}

document.addEventListener('DOMContentLoaded', function () {
  const banner = document.getElementById('onboardBanner');
  if (!banner) return;

  const closeBtn = document.getElementById('onboardClose');
  const token = localStorage.getItem('token');
  const dismissed = localStorage.getItem('onboardDismissed');

  if (token && !dismissed) banner.style.display = 'flex';
  if (closeBtn) closeBtn.onclick = closeOnboard;

  banner.onclick = (e) => {
    if (e.target === banner) closeOnboard();
  };
});


/* ═════════════════════════════════════════════════
   GOOGLE ONE TAP
   ═════════════════════════════════════════════════ */
const GOOGLE_CLIENT_ID = '632029210426-qetuta1k6qakvf1kl8iu0jusju39qk8i.apps.googleusercontent.com';

async function initOneTap() {
  if (authState.isLoggedIn) return;
  if (typeof google === 'undefined' || !google.accounts) return;

  // Google puts a SHA-256 hash of the nonce inside the token,
  // so Supabase needs the raw value and Google the hashed one.
  const raw = crypto.randomUUID();
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(raw)
  );
  const hashed = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    nonce: hashed,
    auto_select: false,
    cancel_on_tap_outside: true,
    callback: async (response) => {
      const { error } = await supabaseClient.auth.signInWithIdToken({
        provider: 'google',
        token: response.credential,
        nonce: raw
      });

      if (error) console.error('One Tap failed:', error.message);
    }
  });

  google.accounts.id.prompt();
}