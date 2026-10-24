// Shared by the build (Node) and the browser, so headlines baked into the
// HTML and headlines refreshed live are rendered by exactly the same code.

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');

export function sortByDate(items) {
  return [...items].sort((a, b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0));
}

// Newest first, but no more than `maxPerSource` from any one site.
export function pickDiverse(items, n, maxPerSource = 2) {
  const counts = {}, out = [];
  for (const it of items) {
    if ((counts[it.sourceId] || 0) >= maxPerSource) continue;
    counts[it.sourceId] = (counts[it.sourceId] || 0) + 1;
    out.push(it);
    if (out.length >= n) return sortByDate(out);
  }
  for (const it of items) {
    if (out.length >= n) break;
    if (!out.includes(it)) out.push(it);
  }
  return sortByDate(out);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ukParts(d) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o = {};
  for (const p of f.formatToParts(d)) o[p.type] = p.value;
  return o;
}

// Absolute time (used in the baked HTML) or relative ("3 h ago", used live)
export function timeLabel(iso, now, relative) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (relative && now) {
    const mins = Math.round((now - d) / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs} h ago`;
    const days = Math.round(hrs / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
  }
  const p = ukParts(d);
  return `${p.day} ${MONTHS[+p.month - 1]}, ${p.hour}:${p.minute}`;
}

const linkAttrs = (url) => `href="${esc(safeUrl(url))}" target="_blank" rel="noopener"`;

// Compact list (home page sidebar)
export function renderWireList(items, opts = {}) {
  if (!items.length) return `<p class="wire-empty">Headlines are taking a breather. Check back soon.</p>`;
  return `<ol class="wire-list">${items.map((it) => `<li class="wire-item"><a ${linkAttrs(it.url)}><span class="wire-src">${esc(it.source)}</span><span class="wire-title">${esc(it.title)}</span><time class="wire-time" datetime="${esc(it.date || '')}">${esc(timeLabel(it.date, opts.now, opts.relative))}</time></a></li>`).join('')}</ol>`;
}

export function initials(name) {
  return String(name || '').split(/\s+/).filter((w) => /^[A-Za-z]/.test(w) && !/^(the|of)$/i.test(w)).map((w) => w[0].toUpperCase()).join('').slice(0, 3);
}

function newsCard(it, opts, cls = '') {
  const img = safeUrl(it.image);
  return `<article class="news-card${cls}"><a ${linkAttrs(it.url)}>${
    img
      ? `<span class="news-media"><img src="${esc(img)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>`
      : `<span class="news-media is-blank" aria-hidden="true"><span>${esc(initials(it.source))}</span></span>`
  }<span class="news-body"><span class="news-meta"><span class="news-src">${esc(it.source)}</span> · <time datetime="${esc(it.date || '')}">${esc(timeLabel(it.date, opts.now, opts.relative))}</time></span><span class="news-title">${esc(it.title)}</span></span></a></article>`;
}

// "Top stories": the main stories right now, each with a short summary
export function renderTopStories(top, opts = {}) {
  if (!top || !top.length) return '';
  const item = (s, i) => {
    const link = safeUrl(s.url);
    const head = link ? `<a ${linkAttrs(link)}>${esc(s.headline)}</a>` : esc(s.headline);
    const srcs = (s.sources || []).filter((x) => safeUrl(x.url));
    const shown = srcs.slice(0, 3).map((x) => `<a ${linkAttrs(x.url)}>${esc(x.name)}</a>`).join('<span aria-hidden="true"> · </span>');
    const more = s.count > 3 ? `<span class="top-more"> +${s.count - 3} more</span>` : '';
    const meta = s.pinned ? '<span class="top-pin">Kop On! pick</span>' : `${s.count > 1 ? `<span class="top-count">${s.count} sites</span>` : ''}${s.date ? `<time datetime="${esc(s.date)}">${esc(timeLabel(s.date, opts.now, opts.relative))}</time>` : ''}`;
    return `<li class="top-item"><span class="top-num" aria-hidden="true">${i + 1}</span><div class="top-text"><h3 class="top-headline">${head}</h3>${s.summary ? `<p class="top-summary">${esc(s.summary)}</p>` : ''}<p class="top-meta">${meta}${shown ? `<span class="top-sources">${shown}${more}</span>` : ''}</p></div></li>`;
  };
  return `<section class="top-stories" aria-labelledby="top-h"><div class="section-head"><h2 id="top-h">Top stories</h2></div><p class="wire-note">The main Liverpool stories right now, summarised from across the news sites. No clickbait.</p><ol class="top-list">${top.map(item).join('')}</ol></section>`;
}

// Home page: a full-width grid of picture cards
export function renderNewsGrid(items, opts = {}) {
  if (!items.length) return `<p class="news-empty">Headlines are taking a breather. Check back soon.</p>`;
  return `<div class="news-grid">${items.map((it) => newsCard(it, opts)).join('')}</div>`;
}

// Full News page body: filter chips, featured cards, then the rest as a list
export function renderNewsPage(data, opts = {}) {
  const active = opts.active || '';
  const all = data?.items || [];
  const withItems = (data?.sources || []).filter((s) => all.some((i) => i.sourceId === s.id));
  const items = active ? all.filter((i) => i.sourceId === active) : all;

  const chip = (id, label) => `<button type="button" class="chip" data-source="${esc(id)}" aria-pressed="${id === active ? 'true' : 'false'}">${esc(label)}</button>`;
  const chips = withItems.length > 1
    ? `<div class="chips" role="group" aria-label="Filter by news site">${chip('', 'All')}${withItems.map((s) => chip(s.id, s.name)).join('')}</div>`
    : '';

  if (!items.length) {
    return `${chips}<p class="news-empty">No headlines right now. The news sites may be having a moment; this page refreshes itself automatically.</p>`;
  }

  const featured = items.slice(0, 3);
  const rest = items.slice(3);
  const card = (it, i) => `<article class="news-card${i === 0 ? ' is-lead' : ''}"><a ${linkAttrs(it.url)}>${
    safeUrl(it.image)
      ? `<span class="news-media"><img src="${esc(safeUrl(it.image))}" alt="" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async" referrerpolicy="no-referrer"></span>`
      : `<span class="news-media is-blank" aria-hidden="true"><span>${esc(initials(it.source))}</span></span>`
  }<span class="news-body"><span class="news-meta"><span class="news-src">${esc(it.source)}</span> · <time datetime="${esc(it.date || '')}">${esc(timeLabel(it.date, opts.now, opts.relative))}</time></span><span class="news-title">${esc(it.title)}</span></span></a></article>`;
  const row = (it) => `<li class="news-row"><a ${linkAttrs(it.url)}><span class="news-row-text"><span class="news-meta"><span class="news-src">${esc(it.source)}</span> · <time datetime="${esc(it.date || '')}">${esc(timeLabel(it.date, opts.now, opts.relative))}</time></span><span class="news-row-title">${esc(it.title)}</span></span>${safeUrl(it.image) ? `<span class="news-thumb"><img src="${esc(safeUrl(it.image))}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer"></span>` : ''}</a></li>`;

  return `${chips}<div class="news-featured">${featured.map(card).join('')}</div>${rest.length ? `<ol class="news-list">${rest.map(row).join('')}</ol>` : ''}`;
}
