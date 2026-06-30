/* ── GrowFlow – script.js ─────────────────────── */

// ✅ Backend API URL
const SUPABASE_URL = 'https://uqfaqhphzomnxpnqrpls.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxZmFxaHBoem9tbnhwbnFycGxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MDQ0MjAsImV4cCI6MjA5NzM4MDQyMH0.KEfbxJB_GMTqUjeRATAdzpCWfdYeYXNhCb2Nb_pUBZs';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const API_URL = 'https://unfollowfinder.com';

// Auth state & pending file storage
let authState = {
  isLoggedIn: localStorage.getItem('userEmail') ? true : false,
  userEmail: localStorage.getItem('userEmail') || null,
  pendingFile: null
};

// Usage tracking for freemium model
let usageState = {
  dailyUses: parseInt(localStorage.getItem('dailyUses') || '0'),
  lastDate: localStorage.getItem('lastDate') || new Date().toDateString(),
  maxFreeUses: 10,
  isPaid: localStorage.getItem('isPaid') === 'true'
};

function resetDailyUsesIfNeeded() {
  const today = new Date().toDateString();
  if (usageState.lastDate !== today) {
    usageState.dailyUses = 0;
    usageState.lastDate = today;
    localStorage.setItem('dailyUses', '0');
    localStorage.setItem('lastDate', today);
  }
}

function incrementUsage() {
  resetDailyUsesIfNeeded();
  usageState.dailyUses++;
  localStorage.setItem('dailyUses', usageState.dailyUses);
  return usageState.dailyUses;
}

function checkUsageLimit() {
  resetDailyUsesIfNeeded();
  if (!usageState.isPaid && usageState.dailyUses >= usageState.maxFreeUses) {
    showPaywallModal();
    return false;
  }
  return true;
}

document.addEventListener('DOMContentLoaded', async () => {

  // ✅ Google OAuth redirect handle karo
  const { data: { session } } = await supabaseClient.auth.getSession();

  if (session && session.user) {
    // Google se wapas aaye hain — token save karo
    const email = session.user.email;
    const token = session.access_token;

    localStorage.setItem('token', token);
    localStorage.setItem('userEmail', email);

    authState.isLoggedIn = true;
    authState.userEmail = email;

    console.log('✅ Google session found:', email);

    // ✅ Backend mein bhi user save karo
    try {
      await fetch(`${API_URL}/api/auth/google-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName: session.user.user_metadata?.full_name || '' })
      });
    } catch (e) {
      console.log('Google sync failed:', e.message);
    }
  }

  // ✅ Supabase auth change listener
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN' && session) {
      const email = session.user.email;
      const token = session.access_token;

      localStorage.setItem('token', token);
      localStorage.setItem('userEmail', email);

      authState.isLoggedIn = true;
      authState.userEmail = email;

      updateAuthUI();
      closeAuth();
      console.log('✅ Logged in:', email);
    }

    if (event === 'SIGNED_OUT') {
      localStorage.removeItem('token');
      localStorage.removeItem('userEmail');
      authState.isLoggedIn = false;
      authState.userEmail = null;
      updateAuthUI();
    }
  });

  // Update UI on load based on auth state
  updateAuthUI();

  /* ── 1. NAVBAR: scroll shadow + active links ── */
  const navbar = document.getElementById('navbar');

  const onScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 10);
    highlightNavLink();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  function highlightNavLink() {
    const sections = document.querySelectorAll('section[id]');
    const links = document.querySelectorAll('.nav-links a');
    let current = '';
    sections.forEach(sec => {
      if (window.scrollY >= sec.offsetTop - 120) current = sec.id;
    });
    links.forEach(link => {
      const href = link.getAttribute('href').replace('#', '');
      link.style.color = href === current ? 'var(--pink)' : '';
    });
  }

  /* ── 2. HAMBURGER MENU ────────────────────── */
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');

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

  /* ── 3. HERO CARD: reveal rows on load ────── */
  const revealRows = () => {
    document.querySelectorAll('.app-row.reveal').forEach(row => {
      requestAnimationFrame(() => {
        setTimeout(() => row.classList.add('visible'), 600);
      });
    });
  };
  revealRows();

  document.querySelectorAll('.app-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.app-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  /* ── 4. SCROLL-TRIGGERED FADE-UPS ────────── */
  const fadeEls = document.querySelectorAll(
    '.feat-card, .step, .price-card, .testi-card, .section-head, .faq-item'
  );

  fadeEls.forEach(el => el.classList.add('fade-up'));

  const observer = new IntersectionObserver(
    entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  fadeEls.forEach(el => observer.observe(el));

  /* ── 5. FAQ ACCORDION ────────────────────── */
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

  /* ── 6. SMOOTH SCROLL for anchor links ───── */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', e => {
      const href = anchor.getAttribute('href');
      if (href === '#' || href.length <= 1) return; // ✅ empty hash links ko ignore karo
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  /* ── 7. HERO STATS: count-up animation ───── */
  const stats = [
    { el: null, target: 250000, suffix: 'K+', divisor: 1000 },
    { el: null, target: 98,     suffix: '%',  divisor: 1 },
    { el: null, target: 100,    suffix: '%',  divisor: 1 },
  ];

  const statEls = document.querySelectorAll('.stat strong');
  statEls.forEach((el, i) => {
    if (stats[i]) stats[i].el = el;
  });

  const countUp = (stat) => {
    if (!stat.el) return;
    const duration = 1200;
    const start    = performance.now();
    const step = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased    = 1 - Math.pow(1 - progress, 3);
      const value    = Math.round(eased * stat.target / stat.divisor);
      stat.el.textContent = value + stat.suffix;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const heroObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      stats.forEach(countUp);
      heroObserver.disconnect();
    }
  }, { threshold: 0.5 });

  const heroStats = document.querySelector('.hero-stats');
  if (heroStats) heroObserver.observe(heroStats);

  /* ── 8. PRICING: hover lift effect ───────── */
  document.querySelectorAll('.price-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      if (!card.classList.contains('featured')) {
        card.style.transform = 'translateY(-4px)';
        card.style.boxShadow = '0 12px 40px rgba(0,0,0,.12)';
      }
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
      card.style.boxShadow = '';
    });
  });

  /* ── 9. BACK TO TOP on logo click ────────── */
  document.querySelectorAll('.logo').forEach(logo => {
    logo.addEventListener('click', e => {
      if (logo.getAttribute('href') === '#') {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });

});

/* ─────────────────────────────────────────────────
   UPLOAD TOOL
───────────────────────────────────────────────── */
const _tool = {
  followers: null,
  following: null,
  lists: { unf: [], nf: [], mutual: [] },
  activeTab: 'unf',
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

      // ✅ DEBUG — yeh batayega kya extract hua
      console.log(`DEBUG [${type}] file: ${file.name} → extracted ${_tool[type].length} usernames`);
      console.log(`DEBUG [${type}] sample:`, _tool[type].slice(0, 3));
      console.log(`DEBUG [${type}] raw json keys:`, Array.isArray(json) ? 'is array' : Object.keys(json));

      const slot = document.getElementById('slot-' + type);
      slot.classList.add('loaded');
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

  // ✅ Fully recursive — chahe structure jitna bhi nested ho,
  // string_list_data jahan bhi mile, usko dhoond lega
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
      // ✅ Fallback — kuch following.json exports mein seedha "title" field hoti hai
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
  if (!checkUsageLimit()) return;
  incrementUsage();

  const follSet = new Set(_tool.followers);
  const folwSet = new Set(_tool.following);

  _tool.lists.unf    = _tool.followers.filter(u => !folwSet.has(u));
  _tool.lists.nf     = _tool.following.filter(u => !follSet.has(u));
  _tool.lists.mutual = _tool.following.filter(u => follSet.has(u));

  // ✅ Backend mein save karo
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const res = await fetch('http://localhost:5000/api/scans/save', {
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
      const data = await res.json();
      console.log('✅ Scan saved!', data.scanId);
    } catch (err) {
      console.log('⚠️ Scan save failed:', err.message);
    }
  }

  document.getElementById('r-following').textContent   = _tool.following.length;
  document.getElementById('r-followers').textContent   = _tool.followers.length;
  document.getElementById('r-unfollowers').textContent = _tool.lists.unf.length;
  document.getElementById('r-notback').textContent     = _tool.lists.nf.length;
  document.getElementById('r-mutual').textContent      = _tool.lists.mutual.length;

  document.getElementById('cnt-unf').textContent    = _tool.lists.unf.length;
  document.getElementById('cnt-nf').textContent     = _tool.lists.nf.length;
  document.getElementById('cnt-mutual').textContent = _tool.lists.mutual.length;

  document.getElementById('tool-upload').style.display  = 'none';
  document.getElementById('tool-results').style.display = 'block';

  _tool.activeTab = 'unf';
  renderList('unf', '');

  document.getElementById('tool-results').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // ✅ Dashboard link results ke neeche add karo
  addDashboardLink();
}

function addDashboardLink() {
  if (document.getElementById('dash-link-btn')) return; // duplicate na bane

  const btn = document.createElement('a');
  btn.id = 'dash-link-btn';
  btn.href = 'dashboard.html';
  btn.className = 'res-export-btn';
  btn.style.cssText = 'margin-top:12px;width:100%;justify-content:center;background:var(--pink);color:white;border:none;';
  btn.innerHTML = '📊 View Full Dashboard →';
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
  const list = _tool.lists[tab].filter(u => u.toLowerCase().includes(q));
  const el   = document.getElementById('res-list');

  if (list.length === 0) {
    el.innerHTML = `
      <div class="res-empty">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/>
          <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        No users found
      </div>`;
    return;
  }

  const badgeMap = {
    unf:    { cls: 'unf',    label: 'Unfollowed you' },
    nf:     { cls: 'nf',     label: 'Not following back' },
    mutual: { cls: 'mutual', label: 'Mutual' },
  };
  const badge = badgeMap[tab];

  const SHOW = 300;
  const rows = list.slice(0, SHOW).map(u => {
    const initials = u.slice(0, 2).toUpperCase();
    const hue      = [...u].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
    return `
      <div class="res-row">
        <div class="res-avatar" style="background:hsl(${hue},55%,42%)">${initials}</div>
        <span class="res-uname">@${u}</span>
        <span class="res-badge ${badge.cls}">${badge.label}</span>
        <a href="https://instagram.com/${u}" target="_blank" class="res-link">View ↗</a>
      </div>`;
  }).join('');

  const overflow = list.length > SHOW
    ? `<div class="res-empty" style="padding:12px">Showing ${SHOW} of ${list.length} — use search to narrow down</div>`
    : '';

  el.innerHTML = rows + overflow;
}

function exportCSV() {
  const tab  = _tool.activeTab;
  const list = _tool.lists[tab];
  if (!list.length) return;

  const labelMap = { unf: 'Unfollowed You', nf: 'Not Following Back', mutual: 'Mutual' };
  const csv  = ['Username,Status', ...list.map(u => `${u},${labelMap[tab]}`)].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `growflow-${tab}-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function resetTool() {
  _tool.followers = null;
  _tool.following = null;
  _tool.lists     = { unf: [], nf: [], mutual: [] };
  _tool.activeTab = 'unf';

  ['followers', 'following'].forEach(type => {
    document.getElementById('slot-' + type).classList.remove('loaded');
    document.getElementById('fn-' + type).textContent = '';
    document.getElementById('inp-' + type).value      = '';
  });

  document.getElementById('tool-check-btn').disabled    = true;
  document.getElementById('tool-upload').style.display  = 'block';
  document.getElementById('tool-results').style.display = 'none';
  document.getElementById('res-list').innerHTML         = '';
  document.getElementById('res-search').value           = '';

  document.getElementById('tool').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── AUTH MODAL ───────────────────────────────── */
const overlay   = document.getElementById('auth-overlay');
const modal     = document.getElementById('auth-modal');
const closeBtn  = document.getElementById('auth-close');

function openAuth(tab = 'signup') {
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  switchAuthTab(tab);
  setTimeout(() => {
    const first = modal.querySelector('input:not([style*="display:none"])');
    if (first) first.focus();
  }, 280);
}

function closeAuth() {
  overlay.classList.remove('open');
  document.body.style.overflow = '';
  resetAuthForms();
}

overlay.addEventListener('click', e => {
  if (e.target === overlay) closeAuth();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && overlay.classList.contains('open')) closeAuth();
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
  btn.textContent = 'Connecting…';
  btn.disabled = true;

  if (provider !== 'google') {
    btn.textContent = 'Continue with Apple';
    btn.disabled = false;
    return;
  }

  const { data, error } = await supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin + window.location.pathname
    }
  });

  if (error) {
    console.error('Google login error:', error.message);
    alert('Google login fail ho gaya: ' + error.message);
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

    if (!name.value.trim())        { markError(name);  valid = false; }
    if (!isValidEmail(email.value)) { markError(email); valid = false; }
    if (pass.value.length < 8)     { markError(pass);  valid = false; }
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
        alert('❌ ' + data.error);
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('userEmail', data.user.email);
      showAuthSuccess(data.user.email);

    } catch (err) {
      btn.textContent = 'Create free account';
      btn.classList.remove('loading');
      btn.disabled = false;
      alert('❌ Server se connect nahi ho saka. Backend chal raha hai?');
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
        btn.textContent = 'Log in to GrowFlow';
        btn.classList.remove('loading');
        btn.disabled = false;
        alert('❌ ' + data.error);
        return;
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('userEmail', data.user.email);
      showAuthSuccess(data.user.email);

    } catch (err) {
      btn.textContent = 'Log in to GrowFlow';
      btn.classList.remove('loading');
      btn.disabled = false;
      alert('❌ Server se connect nahi ho saka. Backend chal raha hai?');
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
      <div style="width:72px;height:72px;background:#f0fdf4;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="#059669" stroke-width="1.5"/>
          <path d="M7 12l3.5 3.5L17 8.5" stroke="#059669" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div style="font-family:'Syne',sans-serif;font-size:24px;font-weight:800;color:#0f0f12;margin-bottom:10px">
        You're in! 🎉
      </div>
      <p style="font-size:15px;color:#6b6b85;line-height:1.6;margin-bottom:28px">
        Welcome to GrowFlow. Start checking your<br>unfollowers right now.
      </p>
      <button onclick="handlePostAuthSuccess()"
        style="background:#E1005E;color:#fff;border:none;border-radius:100px;padding:13px 32px;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;transition:background .15s"
        onmouseover="this.style.background='#b8004c'" onmouseout="this.style.background='#E1005E'">
        Check my unfollowers →
      </button>
      <p style="font-size:12px;color:#c4c4d4;margin-top:16px">${identifier}</p>
    </div>`;
  modal.style.maxWidth = '380px';

  // ✅ Agar signup se pehle pricing button click kiya tha, payment pe redirect karo
  if (authState.pendingPayment) {
    setTimeout(() => {
      window.location.href = `payment.html?plan=${authState.pendingPayment}`;
      authState.pendingPayment = null;
    }, 1500);
  }
}

function handlePostAuthSuccess() {
  closeAuth();
  if (authState.pendingFile) {
    const { file, type } = authState.pendingFile;
    processFile(file, type);
    authState.pendingFile = null;
  } else {
    document.getElementById('tool').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function updateAuthUI() {
  if (!authState.isLoggedIn) return;

  // ✅ Agar already replace ho chuka hai, kuch mat karo
  if (document.querySelector('.nav-user-wrap')) return;

  const loginBtns = document.querySelectorAll('.nav-actions a.btn-ghost, .nav-actions a.btn-primary');
  if (loginBtns.length === 0) return;

  const email = authState.userEmail || '';
  const initials = email.substring(0, 2).toUpperCase();
  const hue = [...email].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;

  // ✅ Sirf PEHLA matching button avatar+logout banega, baaki sab hide
  let replaced = false;
  loginBtns.forEach((btn) => {
    const isLoginOrSignup = btn.textContent.includes('Log in') || btn.textContent.includes('Get started');
    if (isLoginOrSignup && !replaced) {
      btn.outerHTML = `
        <div class="nav-user-wrap" style="display:flex;align-items:center;gap:10px;">
          <div class="nav-avatar" style="
            width:36px;height:36px;border-radius:50%;
            background:hsl(${hue},60%,45%);
            color:white;font-size:13px;font-weight:700;
            display:flex;align-items:center;justify-content:center;
            cursor:pointer;" title="${email}">${initials}</div>
          <a href="#" onclick="event.preventDefault();logout();"
            style="font-size:13px;font-weight:500;color:#333;text-decoration:none;">
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
  resetTool();
  location.reload();
}

function showPaywallModal() {
  let paywall = document.getElementById('paywall-overlay');
  if (!paywall) {
    paywall = document.createElement('div');
    paywall.id = 'paywall-overlay';
    paywall.className = 'paywall-overlay';
    document.body.appendChild(paywall);
  }

  paywall.innerHTML = `
    <div class="paywall-modal">
      <button class="paywall-close" onclick="closePaywall()">✕</button>
      <div class="paywall-header">
        <h2>You've used 10 free analyses today</h2>
        <p>Upgrade to continue checking unfollowers</p>
      </div>
      <div class="paywall-plans">
        <div class="plan-card popular">
          <div class="plan-badge">Most Popular</div>
          <h3>Pro</h3>
          <div class="plan-price">
            <span class="amount">$9</span>
            <span class="period">/month</span>
          </div>
          <ul class="plan-features">
            <li>✓ Unlimited analyses</li>
            <li>✓ Advanced filters</li>
            <li>✓ Export reports</li>
            <li>✓ Priority support</li>
          </ul>
          <button class="paywall-btn primary" onclick="selectPlan('pro')">Get Pro Access →</button>
        </div>
        <div class="plan-card">
          <div class="plan-badge">For Teams</div>
          <h3>Team</h3>
          <div class="plan-price">
            <span class="amount">$29</span>
            <span class="period">/month</span>
          </div>
          <ul class="plan-features">
            <li>✓ Everything in Pro</li>
            <li>✓ Up to 5 team members</li>
            <li>✓ Shared workspaces</li>
            <li>✓ Team analytics</li>
          </ul>
          <button class="paywall-btn secondary" onclick="selectPlan('team')">Get Team Access →</button>
        </div>
      </div>
      <div class="paywall-footer">
        <p>Free tier gives you <strong>10 analyses per day</strong></p>
        <button class="paywall-link" onclick="closePaywall()">Continue as Free User</button>
      </div>
    </div>`;

  paywall.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePaywall() {
  const paywall = document.getElementById('paywall-overlay');
  if (paywall) {
    paywall.classList.remove('open');
    document.body.style.overflow = '';
  }
}

function selectPlan(plan) {
  usageState.isPaid = true;
  localStorage.setItem('isPaid', 'true');
  alert(`✅ Thanks for upgrading to ${plan.toUpperCase()}!\n\nYou now have unlimited analyses.`);
  closePaywall();
}

// ✅ Pricing section ke buttons ke liye — login check karke payment page pe le jaata hai
function goToPayment(plan) {
  const token = localStorage.getItem('token');
  if (!token) {
    authState.pendingPayment = plan;
    openAuth('signup');
    return;
  }
  window.location.href = `payment.html?plan=${plan}`;
}

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
  document.querySelectorAll('.auth-field input').forEach(i => { i.value = ''; i.classList.remove('error'); });
  document.querySelectorAll('.auth-submit').forEach(b => {
    b.textContent = b.closest('#form-signup') ? 'Create free account' : 'Log in to GrowFlow';
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

