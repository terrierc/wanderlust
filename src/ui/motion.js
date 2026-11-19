// Motion that helps rather than decorates: a landscape carousel, numbers that count up, sections that
// settle in as you scroll, and gentle page transitions. All of it is skipped under reduced motion.
export const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let timers = [];
export function enhance(root) {
  for (const t of timers) clearInterval(t); timers = [];
  // carousel
  for (const c of root.querySelectorAll('[data-carousel]')) {
    const slides = [...c.querySelectorAll('.slide')], dots = [...c.querySelectorAll('[data-slide]')], credit = c.querySelector('[data-credit]');
    let i = Math.max(0, slides.findIndex(s => s.classList.contains('active')));
    const show = n => { i = (n + slides.length) % slides.length; slides.forEach((s, k) => s.classList.toggle('active', k === i)); dots.forEach((d, k) => { d.classList.toggle('on', k === i); d.setAttribute('aria-pressed', String(k === i)); }); if (credit) credit.textContent = slides[i].dataset.place; };
    dots.forEach((d, k) => d.addEventListener('click', () => show(k)));
    if (!calm() && slides.length > 1) { let paused = false; c.addEventListener('pointerenter', () => paused = true); c.addEventListener('pointerleave', () => paused = false); timers.push(setInterval(() => { if (!paused && document.visibilityState === 'visible') show(i + 1); }, 7000)); }
  }
  // counters
  const count = el => { const to = +el.dataset.count; if (calm() || !to || el.dataset.counted) return; el.dataset.counted = '1'; const t0 = performance.now(), d = 900, final = to.toLocaleString('en-AU'); let done = false; const step = now => { if (done) return; const p = Math.min(1, (now - t0) / d); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))).toLocaleString('en-AU'); if (p < 1) requestAnimationFrame(step); else done = true; }; el.textContent = '0'; requestAnimationFrame(step); setTimeout(() => { done = true; el.textContent = final; }, d + 80); };
  // reveal on scroll (cards, panels and anything marked .reveal)
  const items = root.querySelectorAll('.reveal, .cards > li, .trip-tiles > li, .panel, .forty-cards > li');
  if (calm() || !('IntersectionObserver' in window)) { items.forEach(el => el.classList.add('shown')); root.querySelectorAll('[data-count]').forEach(() => {}); return; }
  const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('shown'); e.target.querySelectorAll?.('[data-count]').forEach(count); if (e.target.matches('[data-count]')) count(e.target); io.unobserve(e.target); } }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach((el, k) => { el.classList.add('will-reveal'); el.style.setProperty('--d', (k % 6) * 45 + 'ms'); io.observe(el); });
  root.querySelectorAll('.hero [data-count], .forty-head [data-count]').forEach(count);
}
export function transition(fn) {
  if (!document.startViewTransition || calm()) return fn();
  return document.startViewTransition(fn).finished.catch(() => {});
}
