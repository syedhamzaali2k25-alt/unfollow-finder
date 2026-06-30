const API_URL = 'http://localhost:5000';

const msgs = ['Checking your plan…', 'Loading your data…', 'Building charts…', 'Almost ready…'];
let dotTimer;

// ── INIT: Check plan first ──
window.addEventListener('DOMContentLoaded', async () => {
  const token = localStorage.getItem('token');

  if (!token) {
    window.location.href = 'index.html';
    return;
  }

  startLoader();

  try {
    // ✅ Plan check sirf authenticated /me route se
    const userRes = await fetch(`${API_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!userRes.ok) {
      throw new Error('Auth failed');
    }

    const userData = await userRes.json();
    const plan = userData.user?.plan || 'free';

    if (plan === 'free') {
      // ❌ Free user — lock screen dikhao
      document.getElementById('loader-screen').style.display = 'none';
      document.getElementById('lock-screen').style.display = 'flex';
      return;
    }

    // ✅ Pro user — scan history fetch karo
    const res = await fetch(`${API_URL}/api/scans/history`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    loadRealData(data.scans || []);

  } catch (err) {
    console.error('Dashboard error:', err.message);
    document.getElementById('loader-screen').style.display = 'none';
    document.getElementById('lock-screen').style.display = 'flex';
  }
});

function startLoader() {
  document.getElementById('loader-screen').style.display = 'flex';
  let step = 0;
  document.getElementById('loader-msg').textContent = msgs[0];
  document.getElementById('dot-0').classList.add('done');
  dotTimer = setInterval(() => {
    step++;
    if (step >= 4) { clearInterval(dotTimer); return; }
    document.getElementById('loader-msg').textContent = msgs[step];
    document.getElementById('dot-' + step).classList.add('done');
  }, 500);
}

// ── LOAD REAL DATA from backend ──
async function loadRealData(scans) {
  setTimeout(() => {
    document.getElementById('loader-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';

    if (!scans.length) {
      document.getElementById('recent-count').textContent = 'No scans yet';
      document.getElementById('user-list').innerHTML = '<div class="empty-state">No scans yet — run your first scan on the homepage</div>';
      drawDonut({ unfollowers: 0, notBack: 0, mutual: 0 });
      drawBars({ following: 0, followers: 0, mutual: 0 });
      return;
    }

    const latest = scans[0];
    const following = latest.following_count || 0;
    const followers = latest.followers_count || 0;
    const unf = latest.non_followers_count || 0;

    // ✅ Real values from backend if available, fallback to estimate otherwise
    const mutual = latest.mutual_count !== undefined
      ? latest.mutual_count
      : Math.max(following - unf, 0);

    const ghostFollowers = latest.not_followed_back_count !== undefined
      ? latest.not_followed_back_count
      : Math.max(followers - mutual, 0);

    const d = { following, followers, unfollowers: unf, notBack: unf, mutual };

    animCount('s-following', d.following);
    animCount('s-followers', d.followers);
    animCount('s-unf', d.unfollowers);
    animCount('s-notback', d.notBack);
    animCount('s-mutual', d.mutual);

    drawDonut(d);
    drawBars(d);

    const ratio = d.following > 0 ? (d.followers / d.following).toFixed(2) : null;
    document.getElementById('insight-ratio').textContent = ratio !== null ? ratio : 'N/A';
    document.getElementById('insight-ghost').textContent = ghostFollowers;

    document.getElementById('recent-count').textContent = scans.length + ' total scan' + (scans.length === 1 ? '' : 's');
    document.getElementById('user-list').innerHTML = `<div class="empty-state">Go to <a href="index.html#tool">homepage</a> to see the full unfollower list</div>`;

  }, 1200);
}

function animCount(id, target) {
  const el = document.getElementById(id);
  const dur = 800, start = performance.now();
  const step = (now) => {
    const p = Math.min((now - start) / dur, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(e * target);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function drawDonut(d) {
  const canvas = document.getElementById('donut-chart');
  const ctx = canvas.getContext('2d');
  const cx = 50, cy = 50, r = 40, iR = 26;

  const total = (d.unfollowers || 0) + (d.notBack || 0) + (d.mutual || 0);

  ctx.clearRect(0, 0, 100, 100);

  if (total === 0) {
    // ✅ Genuine empty state — no fake segment
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.fillStyle = '#E7E7EF';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, iR, 0, 2 * Math.PI);
    ctx.fillStyle = '#fff';
    ctx.fill();

    document.getElementById('donut-legend').innerHTML =
      `<div style="font-size:11.5px;color:var(--ink-muted)">No follow data yet</div>`;
    return;
  }

  const segments = [
    { val: d.unfollowers || 0, color: '#E1005E', label: 'Unfollowed' },
    { val: d.notBack || 0,     color: '#6D28D9', label: 'Not back' },
    { val: d.mutual || 0,      color: '#047857', label: 'Mutual' },
  ];

  let angle = -Math.PI / 2;
  segments.forEach(seg => {
    const sweep = (seg.val / total) * 2 * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + sweep);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    angle += sweep;
  });

  ctx.beginPath();
  ctx.arc(cx, cy, iR, 0, 2 * Math.PI);
  ctx.fillStyle = '#fff';
  ctx.fill();

  document.getElementById('donut-legend').innerHTML = segments.map(s => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${s.color}"></div>
      <span style="color:var(--ink-muted);font-size:12.5px">${s.label}</span>
      <span class="legend-val">${s.val}</span>
    </div>`).join('');
}

function drawBars(d) {
  const max = Math.max(d.following, d.followers, d.mutual, 1);
  const rows = [
    { label: 'Following', val: d.following, cls: '' },
    { label: 'Followers', val: d.followers, cls: 'purple' },
    { label: 'Mutuals',   val: d.mutual,    cls: 'green' },
  ];
  document.getElementById('bar-chart').innerHTML = rows.map(r => `
    <div class="bar-row">
      <div class="bar-label">${r.label}</div>
      <div class="bar-track"><div class="bar-fill ${r.cls}" style="width:0%" data-pct="${Math.round(r.val/max*100)}"></div></div>
      <div class="bar-val">${r.val}</div>
    </div>`).join('');

  setTimeout(() => {
    document.querySelectorAll('.bar-fill').forEach(el => { el.style.width = el.dataset.pct + '%'; });
  }, 80);
}