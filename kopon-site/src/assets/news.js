// Live LFC news: shows the headlines baked into the page straight away,
// then quietly swaps in fresh ones from /api/news.
import { renderWireList, renderNewsPage, pickDiverse, initials, esc } from './news-render.js';

const root = document.querySelector('[data-news]');
if (root) {
  const mode = root.getAttribute('data-news'); // "wire" (home) or "page"
  const target = root.querySelector('[data-news-body]');
  const updatedEl = root.querySelector('[data-news-updated]');
  let data = null;
  let active = '';

  try { data = JSON.parse(document.getElementById('news-data')?.textContent || 'null'); } catch { data = null; }

  const fmtUpdated = (iso) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(d);
  };

  const hideBrokenImages = () => {
    target.querySelectorAll('img').forEach((img) => {
      const hide = () => {
        const box = img.closest('.news-media, .news-thumb');
        if (box) {
          box.classList.add('is-broken');
          if (box.classList.contains('news-media')) {
            const src = box.closest('a')?.querySelector('.news-src')?.textContent || '';
            box.innerHTML = `<span>${esc(initials(src))}</span>`;
            box.setAttribute('aria-hidden', 'true');
          }
        }
        img.remove();
      };
      if (img.complete && img.naturalWidth === 0) hide();
      else img.addEventListener('error', hide, { once: true });
    });
  };

  const draw = () => {
    if (!data) return;
    const now = Date.now();
    if (mode === 'wire') {
      target.innerHTML = renderWireList(pickDiverse(data.items || [], 5, 2), { now, relative: true });
    } else {
      target.innerHTML = renderNewsPage(data, { now, relative: true, active });
    }
    if (updatedEl && data.updated) updatedEl.textContent = fmtUpdated(data.updated);
    hideBrokenImages();
  };

  target.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    active = chip.getAttribute('data-source') || '';
    draw();
    const again = target.querySelector(`.chip[data-source="${CSS.escape(active)}"]`);
    if (again) again.focus();
  });

  draw(); // relative times + broken-image handling for the baked headlines

  const refresh = async () => {
    try {
      const res = await fetch('/api/news', { headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const fresh = await res.json();
      if (fresh && Array.isArray(fresh.items) && fresh.items.length) {
        data = fresh;
        if (active && !data.items.some((i) => i.sourceId === active)) active = '';
        draw();
        root.setAttribute('data-news-live', 'true');
      }
    } catch { /* keep the baked headlines */ }
  };
  refresh();
  // Keep a long-open tab fresh
  setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 10 * 60 * 1000);
}
