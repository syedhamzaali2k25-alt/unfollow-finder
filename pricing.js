/* ============================================================
   Unfollow Finder — Pricing toggle
   ============================================================ */

let cycle = 'monthly';

document.addEventListener('DOMContentLoaded', () => {
  // Deep link support: /pricing?billing=yearly
  const wanted = new URLSearchParams(location.search).get('billing');
  if (wanted === 'yearly') setCycle('yearly');

  initFaq();
});


function setCycle(next) {
  if (next !== 'monthly' && next !== 'yearly') return;
  cycle = next;

  const monthlyBtn = document.getElementById('btn-monthly');
  const yearlyBtn  = document.getElementById('btn-yearly');
  const isYearly   = cycle === 'yearly';

  monthlyBtn.classList.toggle('is-on', !isYearly);
  yearlyBtn.classList.toggle('is-on', isYearly);
  monthlyBtn.setAttribute('aria-pressed', String(!isYearly));
  yearlyBtn.setAttribute('aria-pressed', String(isYearly));

  // Fade the amounts out, swap, fade back in
  const amounts = document.querySelectorAll('.pr-amount[data-monthly]');
  amounts.forEach(el => el.classList.add('is-swapping'));

  setTimeout(() => {
    amounts.forEach(el => {
      el.textContent = el.dataset[cycle];
      el.classList.remove('is-swapping');
    });

    document.querySelectorAll('.pr-billed[data-monthly]').forEach(el => {
      el.textContent = el.dataset[cycle];
    });
  }, 170);

  // Carry the choice through to checkout
  const suffix = isYearly ? '&billing=yearly' : '';
  const pro  = document.getElementById('cta-pro');
  const team = document.getElementById('cta-team');
  if (pro)  pro.href  = '/payment?plan=pro'  + suffix;
  if (team) team.href = '/payment?plan=team' + suffix;

  // Keep the URL shareable without adding history entries
  const url = new URL(location.href);
  if (isYearly) url.searchParams.set('billing', 'yearly');
  else url.searchParams.delete('billing');
  history.replaceState(null, '', url);
}


/* ── FAQ accordion ──────────────────────────── */
