/* ============================================================
   Unfollow Finder — Dashboard
   ============================================================ */

const API_URL = location.hostname === 'localhost'
  ? 'http://localhost:5000'
  : 'https://unfollowfinder.com';   // <-- live backend URL

const LOADER_MSGS = [
  'Checking your plan',
  'Loading your scans',
  'Comparing snapshots',
  'Almost there'
];

let dotTimer;
let activeTab = 'unfollowed';
let searchTerm = '';

const store = {
  unfollowed:   [],   // { username, detected_at }
  newFollowers: [],   // { username, detected_at }
  notBack:      []    // [ username ]
};

let needsSecondScan = true;
let totalScans = 0;


/* ══ INIT ═════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');
  if (!token) { location.href = '/'; return; }

  startLoader();

  const headers = { 'Authorization': `Bearer ${token}` };

  try {
    const meRes = await fetch(`${API_URL}/api/auth/me`, { headers });
    if (!meRes.ok) throw new Error('auth');

    const me = await meRes.json();
    const plan = me.user?.plan || 'free';

    if (plan === 'free') return showLock();

    setText('plan-chip', plan === 'team' ? 'Team' : 'Pro');

    const [histRes, latestRes, leftRes, gainRes] = await Promise.all([
      fetch(`${API_URL}/api/scans/history`, { headers }),
      fetch(`${API_URL}/api/scans/latest`, { headers }),
      fetch(`${API_URL}/api/scans/timeline?type=unfollowed`, { headers }),
      fetch(`${API_URL}/api/scans/timeline?type=new_follower`, { headers })
    ]);

    if (!histRes.ok) throw new Error('history');

    const hist   = await histRes.json();
    const latest = latestRes.ok ? await latestRes.json() : { unfollowers: [] };
    const left   = leftRes.ok   ? await leftRes.json()   : { events: [] };
    const gain   = gainRes.ok   ? await gainRes.json()   : { events: [] };

    store.notBack      = latest.unfollowers || [];
    store.unfollowed   = left.events  || [];
    store.newFollowers = gain.events  || [];
    needsSecondScan    = left.needsSecondScan !== false;

    render(hist.scans || []);

  } catch (err) {
    console.error('Dashboard:', err.message);
    showLock();
  }
});


function showLock() {
  clearInterval(dotTimer);
  document.getElementById('loader-screen').classList.remove('is-on');
  document.getElementById('lock-screen').classList.add('is-on');
}

function startLoader() {
  document.getElementById('loader-screen').classList.add('is-on');
  let i = 0;
  document.getElementById('loader-msg').textContent = LOADER_MSGS[0];
  document.getElementById('dot-0').classList.add('done');

  dotTimer = setInterval(() => {
    if (++i >= 4) return clearInterval(dotTimer);
    document.getElementById('loader-msg').textContent = LOADER_MSGS[i];
    document.getElementById('dot-' + i).classList.add('done');
  }, 480);
}


/* ══ RENDER ═══════════════════════════════════ */
function render(scans) {
  setTimeout(() => {
    clearInterval(dotTimer);
    document.getElementById('loader-screen').classList.remove('is-on');
    document.getElementById('dashboard').classList.add('is-on');

    totalScans = scans.length;
    renderHero();
    renderCounts();

    const latest = scans[0];

    if (!latest) {
      renderSplit({ notBack: 0, fans: 0, mutual: 0 });
      renderList();
      updateExport();
      return;
    }

    const following = latest.following_count || 0;
    const followers = latest.followers_count || 0;
    const notBack   = latest.non_followers_count || 0;

    const mutual = latest.mutual_count ?? Math.max(following - notBack, 0);
    const fans   = latest.not_followed_back_count ?? Math.max(followers - mutual, 0);

    count('s-following', following);
    count('s-followers', followers);
    count('s-notback',   notBack);
    count('s-unf',       fans);
    count('s-mutual',    mutual);

    document.getElementById('insight-ratio').textContent =
      following > 0 ? (followers / following).toFixed(2) : '—';

    renderSplit({ notBack, fans, mutual });
    renderList();
    updateExport();
  }, 900);
}


function renderHero() {
  const n = store.unfollowed.length;

  count('hero-num', n);
  count('hero-new', store.newFollowers.length);
  count('hero-scans', totalScans);

  document.getElementById('hero-num').classList.toggle('is-hot', n > 0);
  setText('hero-unit', n === 1 ? 'person left' : 'people left');

  const note = document.getElementById('hero-note');
  if (note) {
    note.textContent = needsSecondScan
      ? 'baseline saved'
      : 'since your last scan';
  }

  const sub = document.getElementById('greet-sub');
  if (sub) {
    sub.textContent = needsSecondScan
      ? 'Run one more scan and we\'ll show you exactly who left.'
      : n === 0
        ? 'Nobody left since your last scan.'
        : `${n} ${n === 1 ? 'person' : 'people'} left since your last scan.`;
  }
}


function renderCounts() {
  setText('tab-count-unfollowed', store.unfollowed.length);
  setText('tab-count-new',        store.newFollowers.length);
  setText('tab-count-notback',    store.notBack.length);
}


/* ══ SPLIT BAR ════════════════════════════════ */
function renderSplit(d) {
  const total = d.notBack + d.fans + d.mutual;

  const segs = [
    { val: d.notBack, color: '#FF9838', label: 'Not following back' },
    { val: d.fans,    color: '#A78BFA', label: 'Fans' },
    { val: d.mutual,  color: '#34D399', label: 'Mutuals' }
  ];

  const bar = document.getElementById('split-bar');
  const key = document.getElementById('split-key');

  if (total === 0) {
    bar.innerHTML = '';
    key.innerHTML = '<span class="key-lbl">No scan data yet</span>';
    return;
  }

  // Give tiny slices a visible floor so a 1% segment doesn't vanish,
  // then scale the rest to fit the remaining space.
  const live = segs.filter(s => s.val > 0);
  const FLOOR = 3;                            // percent
  const spare = 100 - FLOOR * live.length;

  bar.innerHTML = live.map(s => {
    const w = FLOOR + (s.val / total) * spare;
    return `<div class="split-seg" style="background:${s.color}" data-w="${w.toFixed(2)}%"></div>`;
  }).join('');

  key.innerHTML = segs.map(s => {
    const pct = total ? Math.round(s.val / total * 100) : 0;
    return `
    <span class="key-item">
      <span class="key-dot" style="background:${s.color}"></span>
      <span class="key-lbl">${s.label}</span>
      <span class="key-num">${s.val}</span>
      <span class="key-pct">${pct}%</span>
    </span>`;
  }).join('');

  requestAnimationFrame(() => {
    bar.querySelectorAll('.split-seg').forEach(el => { el.style.width = el.dataset.w; });
  });
}


/* ══ TABS ═════════════════════════════════════ */
function switchTab(tab, el) {
  activeTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('is-active'));
  el.classList.add('is-active');

  searchTerm = '';
  document.getElementById('search-input').value = '';

  renderList();
  updateExport();
}

function filterList(v) {
  searchTerm = v.trim().toLowerCase();
  renderList();
}


/* ══ LIST ═════════════════════════════════════ */
const AVATARS = ['#E1005E', '#6D28D9', '#0891B2', '#047857', '#C2410C'];

function activeItems() {
  if (activeTab === 'notback') {
    return store.notBack.map(u => ({ username: u, detected_at: null }));
  }
  return activeTab === 'unfollowed' ? store.unfollowed : store.newFollowers;
}

function renderList() {
  const box = document.getElementById('user-list');
  let items = activeItems();

  if (searchTerm) {
    items = items.filter(i =>
      String(i.username).toLowerCase().includes(searchTerm));
  }

  if (!items.length) {
    box.innerHTML = emptyState();
    return;
  }

  const tag = activeTab === 'unfollowed' ? ['Left', 'left']
            : activeTab === 'new'        ? ['Gained', 'gained']
            : ['No follow back', 'notback'];

  // Flat list for not-following-back — dates carry no meaning there
  if (activeTab === 'notback') {
    const shown = items.slice(0, 300);
    let html = shown.map((it, i) => row(it.username, i, tag[0], tag[1])).join('');
    if (items.length > 300) {
      html += `<p class="more-note">${items.length - 300} more export the CSV for the full list</p>`;
    }
    box.innerHTML = html;
    return;
  }

  // Grouped by day
  const groups = new Map();
  items.forEach(it => {
    const k = dayLabel(it.detected_at);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  });

  let html = '', i = 0;
  groups.forEach((list, label) => {
    html += `<div class="day">${esc(label)}</div>`;
    list.forEach(it => { html += row(it.username, i++, tag[0], tag[1]); });
  });

  box.innerHTML = html;
}

function row(name, i, tagText, tagClass) {
  const u  = String(name).replace(/^@/, '');
  const ini = u.slice(0, 2).toLowerCase();
  const bg = AVATARS[i % AVATARS.length];

  return `
    <div class="row">
      <span class="row-av" style="background:${bg}">${esc(ini)}</span>
      <a class="row-name" href="https://instagram.com/${encodeURIComponent(u)}"
         target="_blank" rel="noopener noreferrer">@${esc(u)}</a>
      <span class="tag tag--${tagClass}">${esc(tagText)}</span>
    </div>`;
}

function emptyState() {
  if (searchTerm) {
    return `<div class="empty">
      <div class="empty-mark">🔍</div>
      <p class="empty-title">No match</p>
      <p class="empty-sub">Nothing here matches “${esc(searchTerm)}”.</p>
    </div>`;
  }

  if (activeTab !== 'notback' && needsSecondScan) {
    return `<div class="empty">
      <div class="empty-mark">◷</div>
      <p class="empty-title">Tracking starts now</p>
      <p class="empty-sub">
        We saved this scan as your baseline.
        <a href="/#tool">Run another scan</a> and we'll show you exactly who left.
      </p>
    </div>`;
  }

  const msg = {
    unfollowed: ['🎉', 'Nobody left', 'Your follower list is the same as your last scan.'],
    new:        ['—',  'No new followers', 'Nothing gained since your last scan.'],
    notback:    ['🎉', 'All clear', 'Everyone you follow follows you back.']
  }[activeTab];

  return `<div class="empty">
    <div class="empty-mark">${msg[0]}</div>
    <p class="empty-title">${msg[1]}</p>
    <p class="empty-sub">${msg[2]}</p>
  </div>`;
}


/* ══ EXPORT ═══════════════════════════════════ */
function exportSet() {
  if (activeTab === 'notback') {
    return { rows: store.notBack.map(u => [u, null]), name: 'not-following-back' };
  }
  if (activeTab === 'new') {
    return { rows: store.newFollowers.map(e => [e.username, e.detected_at]), name: 'new-followers' };
  }
  return { rows: store.unfollowed.map(e => [e.username, e.detected_at]), name: 'unfollowers' };
}

function updateExport() {
  const btn   = document.getElementById('export-btn');
  const label = document.getElementById('export-label');
  const { rows } = exportSet();

  btn.disabled = rows.length === 0;
  label.textContent = rows.length === 0
    ? 'Nothing to export'
    : `Export ${rows.length}`;
}

function exportCSV() {
  const { rows, name } = exportSet();
  if (!rows.length) return;

  // Neutralise leading characters Excel would treat as a formula
  const cell = v => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };

  const out = [
    ['Username', 'Profile URL', 'Detected'],
    ...rows.map(([u, at]) => {
      const clean = String(u).replace(/^@/, '');
      return [
        clean,
        `https://instagram.com/${clean}`,
        at ? new Date(at).toLocaleDateString() : ''
      ];
    })
  ];

  const csv  = out.map(r => r.map(cell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');

  a.href = url;
  a.download = `${name}-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}


/* ══ DELETE DATA ══════════════════════════════ */
async function deleteAllData() {
  const ok = confirm(
    'Delete every scan and all tracking history?\n\n' +
    'This cannot be undone, and unfollow tracking will start over from your next scan.'
  );
  if (!ok) return;

  try {
    const res = await fetch(`${API_URL}/api/scans/all/data`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    if (!res.ok) throw new Error('failed');
    location.reload();
  } catch {
    alert('Could not delete your data. Try again in a moment.');
  }
}


/* ══ HELPERS ══════════════════════════════════ */
function count(id, target) {
  const el = document.getElementById(id);
  if (!el) return;

  const dur = 700, t0 = performance.now();
  const step = now => {
    const p = Math.min((now - t0) / dur, 1);
    el.textContent = Math.round((1 - Math.pow(1 - p, 3)) * target);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function setText(id, v) {
  const el = document.getElementById(id);
  if (el) el.textContent = v;
}

function dayLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((b - a) / 864e5);

  if (diff <= 0)  return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)   return `${diff} days ago`;
  if (diff < 14)  return 'Last week';
  if (diff < 30)  return `${Math.floor(diff / 7)} weeks ago`;

  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}