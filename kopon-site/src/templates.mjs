// HTML templates for every page. Everything from the feed is escaped with esc().
import { esc, jsonForScript, clock } from '../lib/text.mjs';
import { renderNewsGrid, renderNewsPage, renderTopStories, pickDiverse } from './assets/news-render.js';
import { fansBand } from './fans-templates.mjs';

// ---- icons --------------------------------------------------------------------
const I = {
  play: '<svg class="icon i-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z"/></svg>',
  pause: '<svg class="icon i-pause" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>',
  back: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/></svg>',
  fwd: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
};
const playPause = I.play + I.pause;

// ---- helpers --------------------------------------------------------------------
const epUrl = (ep) => `/episodes/${ep.slug}/`;
const playData = (ep) => esc(JSON.stringify({ guid: ep.guid, title: ep.title, src: ep.audio?.url || '', href: epUrl(ep), dur: ep.durationSeconds || 0 }));

// Deterministic "waveform" per episode (decorative; the seek bar is a real slider)
function waveBars(seed, count) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const rand = () => { h ^= h << 13; h >>>= 0; h ^= h >>> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
  let out = '';
  let prev = 0.5;
  for (let i = 0; i < count; i++) {
    const v = Math.min(1, Math.max(0.15, prev * 0.45 + rand() * 0.7));
    prev = v;
    out += `<span class="bar" style="height:${Math.round(v * 100)}%"></span>`;
  }
  return out;
}

function wave(ep, count, label) {
  return `<div class="wave"><div class="bars" aria-hidden="true">${waveBars(ep.guid, count)}</div><input class="seek" type="range" min="0" max="1000" step="1" value="0" aria-label="${esc(label)}"></div>`;
}

const listenLinks = (config, onlyFeatured, cls = 'btn') => config.listen
  .filter((l) => !onlyFeatured || l.featured)
  .map((l) => `<a${cls ? ` class="${cls}"` : ''} href="${esc(l.url)}" rel="me noopener">${esc(onlyFeatured ? l.short || l.name : l.name)}</a>`).join('');

export function epRow(ep, { showExcerpt = false, search = '' } = {}) {
  const canPlay = !!ep.audio;
  return `<li class="ep-row"${search ? ` data-search="${esc(search)}"` : ''}>${
    canPlay ? `<button class="play-btn" type="button" data-play="${playData(ep)}" aria-label="Play ${esc(ep.title)}">${playPause}</button>` : '<span class="play-btn" aria-hidden="true"></span>'
  }<div class="ep-text"><a class="ep-title" href="${epUrl(ep)}">${esc(ep.title)}</a><span class="ep-meta"><time datetime="${esc(ep.dateIso)}">${esc(ep.dateShort)}</time>${ep.durationText ? ` · ${esc(ep.durationText)}` : ''}</span>${showExcerpt && ep.excerpt ? `<p class="ep-excerpt">${esc(ep.excerpt)}</p>` : ''}</div></li>`;
}

// ---- YouTube Shorts ----------------------------------------------------------------
// Thumbnails only until someone presses play (no YouTube tracking before that)
export function shortsBlock(ep) {
  const list = ep.shorts || [];
  if (!list.length) return '';
  return `<section class="shorts" aria-labelledby="shorts-h">
<h2 class="h2" id="shorts-h">Clips from this episode</h2>
<div class="shorts-row" data-allow-scroll>${list.map((s) => `<div class="short"><button type="button" class="short-play" data-yt="${esc(s.id)}" aria-label="Play clip: ${esc(s.title)}"><img src="https://i.ytimg.com/vi/${esc(s.id)}/hqdefault.jpg" alt="" loading="lazy" decoding="async" width="480" height="360"><span class="short-icon" aria-hidden="true">${I.play}</span></button><a class="short-title" href="https://www.youtube.com/shorts/${esc(s.id)}">${esc(s.title)}</a></div>`).join('')}</div>
</section>`;
}

// ---- comments ------------------------------------------------------------------
export function commentsBlock(c, { pageId, url, title }) {
  if (c.provider === 'disqus' && /^[a-z0-9-]+$/i.test(c.disqusShortname || '')) {
    // Loads only when the visitor agrees (Disqus sets advertising cookies)
    return `<div class="disqus" data-disqus="${esc(c.disqusShortname.toLowerCase())}" data-url="${esc(url)}" data-id="${esc(pageId)}" data-title="${esc(title)}">
<div class="comments-gate"><p>The discussion is hosted by Disqus. You can sign in with Google, Facebook or X, or post as a guest. Showing it lets Disqus set cookies (<a href="https://help.disqus.com/en/articles/1717103-disqus-privacy-policy">Disqus privacy policy</a>).</p><button type="button" class="btn btn-primary disqus-load">Show the discussion</button></div>
<div id="disqus_thread"></div>
</div>`;
  }
  if (c.provider === 'cusdis' && c.cusdisAppId) {
    return `<div id="cusdis_thread" data-host="https://cusdis.com" data-app-id="${esc(c.cusdisAppId)}" data-page-id="${esc(pageId)}" data-page-url="${esc(url)}" data-page-title="${esc(title)}" data-theme="dark"></div>
<script async defer src="https://cusdis.com/js/cusdis.es.js"></script>`;
  }
  if (c.provider === 'hyvor' && c.hyvorWebsiteId) {
    return `<hyvor-talk-comments website-id="${esc(c.hyvorWebsiteId)}" page-id="${esc(pageId)}" page-url="${esc(url)}" page-title="${esc(title)}" colors="dark" loading="lazy"></hyvor-talk-comments>
<script async src="https://talk.hyvor.com/embed/embed.js" type="module"></script>`;
  }
  if (c.provider === 'remark42' && c.remark42Host) {
    const cfg = { host: c.remark42Host.replace(/\/+$/, ''), site_id: c.remark42SiteId || 'remark', url, page_title: title, theme: 'dark', components: ['embed'], show_email_subscription: true };
    return `<div id="remark42"></div>
<script>var remark_config = ${jsonForScript(cfg)};</script>
<script>(function(c,d){for(var i=0;i<c.length;i++){var s=d.createElement('script');s.type='module';s.async=true;s.src=remark_config.host+'/web/'+c[i]+'.mjs';(d.head||d.body).appendChild(s);}})(remark_config.components||['embed'],document);</script>`;
  }
  return `<div class="comments-soon"><h3>The discussion opens soon</h3><p>We're getting the Kop On forum ready. Until then, come and chat in the comments on <a href="https://www.youtube.com/c/koponpodcast" rel="noopener">YouTube</a>.</p></div>`;
}

// ---- layout ----------------------------------------------------------------------
// Links to other websites open in a new tab; links within the site don't.
export function externalLinksInNewTab(html, siteUrl) {
  const own = siteUrl.replace(/^https?:\/\//, '').toLowerCase();
  return html.replace(/<a\s([^>]*?)>/g, (tag, attrs) => {
    const href = (attrs.match(/\bhref="([^"]*)"/) || [])[1] || '';
    if (!/^(https?:)?\/\//i.test(href)) return tag;
    const host = href.replace(/^(https?:)?\/\//i, '').split(/[/?#]/)[0].toLowerCase();
    if (host === own || host === `www.${own}` || `www.${host}` === own) return tag;
    let a = attrs;
    if (!/\btarget=/.test(a)) a += ' target="_blank"';
    if (/\brel="/.test(a)) { if (!/\brel="[^"]*\bnoopener\b/.test(a)) a = a.replace(/\brel="/, 'rel="noopener '); }
    else a += ' rel="noopener"';
    return `<a ${a}>`;
  });
}

export function layout(ctx, page, content) {
  return externalLinksInNewTab(layoutInner(ctx, page, content), ctx.config.siteUrl);
}

function layoutInner(ctx, page, content) {
  const { config, assets } = ctx;
  const url = config.siteUrl + page.path;
  const title = page.title ? `${page.title} | ${config.shortTitle}` : config.title;
  const desc = page.description || config.description;
  const img = page.image || `${config.siteUrl}${assets['og-card.jpg']}`;
  const nav = [['Episodes', '/episodes/'], ['News', '/news/'], ['Stats', '/stats/'], ['Fan zone', '/fans/'], ['Community', '/community/']];
  const jsonLd = (page.jsonLd || []).map((j) => `<script type="application/ld+json">${jsonForScript(j)}</script>`).join('\n');
  const scripts = [
    `<script src="${assets['player.js']}" defer></script>`,
    page.search ? `<script src="${assets['search.js']}" defer></script>` : '',
    page.editor ? `<script src="${assets['editor.js']}" defer></script>` : '',
    content.includes('data-disqus=') ? `<script src="${assets['comments.js']}" defer></script>` : '',
    page.news ? `<script type="module" src="${assets['news.js']}"></script>` : '',
    page.stats ? `<script src="${assets['stats.js']}" defer></script>` : '',
    page.fans === 'lineup' ? `<script type="module" src="${assets['lineup.js']}"></script>` : '',
    page.fans === 'ratings' ? `<script type="module" src="${assets['ratings.js']}"></script>` : '',
  ].join('');

  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<link rel="alternate" type="application/rss+xml" title="${esc(config.title)}" href="${esc(config.feedUrl)}">
<link rel="icon" href="${assets['favicon-32.png']}" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="${assets['apple-touch-icon.png']}">
<link rel="manifest" href="${assets['site.webmanifest']}">
<meta name="theme-color" content="#0b0b0f">
<meta name="color-scheme" content="dark">
<meta name="kopon-art" content="${config.siteUrl}${assets['icon-512.png']}">
<meta property="og:type" content="${page.ogType || 'website'}">
<meta property="og:site_name" content="${esc(config.title)}">
<meta property="og:title" content="${esc(page.title || config.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">
${page.noindex ? '<meta name="robots" content="noindex">\n' : ''}<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&amp;family=Inter:wght@400;500;600;700&amp;display=swap">
<link rel="stylesheet" href="${assets['site.css']}">
${jsonLd}
${scripts}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="site-header wrap">
<a class="brand" href="/"><img src="${assets['logo-96.jpg']}" alt="" width="44" height="44">${esc(config.welcome)}</a>
<nav class="site-nav" aria-label="Main">${nav.map(([label, href]) => `<a href="${href}"${page.active === href ? ' aria-current="page"' : ''}>${label}</a>`).join('')}<a class="nav-patreon" href="${esc(config.patreon)}" rel="me noopener">Patreon</a></nav>
</header>
<main id="main">
${content}
</main>
<footer class="site-footer wrap" id="listen">
<p class="kicker">Listen everywhere</p>
<div class="listen-links">${listenLinks(config, false, '')}<a href="${esc(config.feedUrl)}">RSS</a></div>
<p class="legal">© ${new Date().getUTCFullYear()} ${esc(config.author)} · Kop On! is an independent fan podcast, not affiliated with Liverpool FC.</p>
</footer>
<div id="miniplayer" class="mini" role="region" aria-label="Audio player" hidden>
<input class="mini-seek" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek">
<div class="wrap mini-inner">
<img src="${assets['logo-96.jpg']}" alt="" width="48" height="48">
<div class="mini-info"><a class="mini-title" href="/">Now playing</a><span class="mini-time">0:00</span></div>
<div class="mini-ctrls">
<button type="button" class="ctrl skip-back hide-sm" aria-label="Back 15 seconds">${I.back}</button>
<button type="button" class="mini-toggle" aria-label="Play">${playPause}</button>
<button type="button" class="ctrl skip-fwd hide-sm" aria-label="Forward 30 seconds">${I.fwd}</button>
<button type="button" class="ctrl speed" aria-label="Playback speed">1×</button>
<button type="button" class="ctrl mini-close" aria-label="Close player">${I.close}</button>
</div>
</div>
</div>
</body>
</html>
`;
}

// ---- pages -------------------------------------------------------------------------
const seriesLd = (config, show) => ({
  '@context': 'https://schema.org', '@type': 'PodcastSeries', '@id': `${config.siteUrl}/#podcast`,
  url: `${config.siteUrl}/`, name: config.title, alternateName: 'Kop On', description: config.description,
  image: show.image, webFeed: config.feedUrl, inLanguage: 'en', genre: ['Liverpool FC', 'Sports'],
  author: { '@type': 'Person', name: config.author },
  sameAs: [...config.listen.map((l) => l.url), config.patreon],
});

export function homePage(ctx) {
  const { config, episodes, news, show } = ctx;
  const latest = episodes[0];
  const titleClass = latest.title.length > 40 ? ' is-xlong' : latest.title.length > 22 ? ' is-long' : '';
  const homeNews = pickDiverse(news.items, 6, 2);

  const content = `
<section class="hero" aria-labelledby="hero-title">
<div class="hero-glow" aria-hidden="true"></div>
<div class="wrap hero-grid player" data-play="${playData(latest)}">
<div class="hero-copy">
<p class="hero-label">Latest episode</p>
<h1 id="hero-title" class="hero-title${titleClass}"><a href="${epUrl(latest)}">${esc(latest.title)}</a></h1>
<p class="hero-meta"><time datetime="${esc(latest.dateIso)}">${esc(latest.dateLong)}</time>${latest.durationText ? ` · ${esc(latest.durationText)}` : ''}</p>
${latest.excerpt ? `<p class="lede">${esc(latest.excerpt)}</p>` : ''}
<div class="actions">
${latest.audio ? `<button type="button" class="btn btn-primary player-toggle" data-label-play="Play episode" data-label-pause="Pause" aria-label="Play episode: ${esc(latest.title)}">${playPause}<span class="label">Play episode</span></button>` : ''}
${listenLinks(config, true)}
<a class="text-link" href="#listen">More apps</a>
</div>
<p class="hero-more"><a href="${epUrl(latest)}">Show notes &amp; discussion →</a></p>
<p class="prev-link"><a href="/episodes/">Previous episodes →</a></p>
</div>
<div class="hero-art">
<img class="art" src="${ctx.assets['logo.jpg']}" alt="Kop On! podcast logo" width="340" height="340" fetchpriority="high">
${latest.audio ? `${wave(latest, 48, `Seek within ${latest.title}`)}<div class="times"><span class="t-cur">0:00</span><span class="t-dur">${esc(clock(latest.durationSeconds))}</span></div><p class="resume-note" hidden></p>` : ''}
</div>
</div>
</section>

${fansBand(ctx)}
<section class="wrap home-news" aria-labelledby="wire-h" data-news="grid">
<div data-top-body>${renderTopStories(news.top || [], { now: ctx.builtAt.getTime(), relative: false })}</div>
<div class="section-head"><h2 id="wire-h">Latest LFC news</h2><a href="/news/">All news →</a></div>
<p class="wire-note">Latest LFC headlines from around the web, updated automatically.</p>
<div data-news-body>${renderNewsGrid(homeNews, { now: ctx.builtAt.getTime(), relative: false })}</div>
<script type="application/json" id="news-data">${jsonForScript(news)}</script>
</section>

<section class="wrap community-band" aria-labelledby="community-h">
<div class="community-card">
<div>
<h2 id="community-h">Join the Kop On community</h2>
<p>Match threads, episode discussions and transfer chat with Reds all over the world.</p>
</div>
<div class="btns">
<a class="btn btn-light" href="/community/">Open the forum</a>
<a class="btn" href="${esc(config.patreon)}" rel="me noopener">Support on Patreon</a>
</div>
</div>
</section>`;

  return layout(ctx, {
    path: '/', active: '/', news: true,
    jsonLd: [seriesLd(config, show), { '@context': 'https://schema.org', '@type': 'WebSite', name: config.title, url: `${config.siteUrl}/` }],
  }, content);
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’']/g, '');

export function episodesPage(ctx) {
  const { episodes } = ctx;
  const groups = [];
  for (const ep of episodes) {
    const key = ep.monthYear;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, eps: [] }; groups.push(g); }
    g.eps.push(ep);
  }
  const content = `
<div class="wrap page-head">
<h1 class="page-title">All episodes</h1>
<div class="search-box">${I.search}<label class="visually-hidden" for="episode-search">Search episodes</label><input id="episode-search" type="search" placeholder="Search episodes, guests, players…" autocomplete="off"></div>
<p class="ep-count" id="episode-count" aria-live="polite">${episodes.length} episodes</p>
</div>
<div class="wrap">
${groups.map((g) => `<section class="ep-group"><h2>${esc(g.key)}</h2><ul class="ep-list">${g.eps.map((ep) => epRow(ep, { showExcerpt: true, search: norm(`${ep.title} ${ep.excerpt} ${ep.dateLong}`) })).join('')}</ul></section>`).join('\n')}
<p class="ep-empty" id="episode-empty" hidden>No episodes match that search. Try a player, guest or opponent.</p>
</div>`;
  return layout(ctx, { path: '/episodes/', active: '/episodes/', title: 'All episodes', description: `Every Kop On! episode: ${episodes.length} Liverpool FC podcast episodes and counting.`, search: true }, content);
}

export function episodePage(ctx, ep) {
  const { config } = ctx;
  const url = `${config.siteUrl}${epUrl(ep)}`;
  const metaBits = [
    ep.season && ep.number ? `Season ${ep.season}, episode ${ep.number}` : '',
    `<time datetime="${esc(ep.dateIso)}">${esc(ep.dateLong)}</time>`,
    ep.durationText ? esc(ep.durationText) : '',
  ].filter(Boolean).join(' · ');

  const player = ep.audio ? `
<div class="player player-lg" data-play="${playData(ep)}">
<button type="button" class="player-toggle big-play" aria-label="Play ${esc(ep.title)}">${playPause}</button>
<div class="player-main">
${wave(ep, 64, `Seek within ${ep.title}`)}
<div class="player-row"><span class="t-cur">0:00</span>
<div class="ctrls"><button type="button" class="ctrl skip-back" aria-label="Back 15 seconds">${I.back}</button><button type="button" class="ctrl speed" aria-label="Playback speed">1×</button><button type="button" class="ctrl skip-fwd" aria-label="Forward 30 seconds">${I.fwd}</button></div>
<span class="t-dur">${esc(clock(ep.durationSeconds))}</span></div>
<p class="resume-note" hidden></p>
</div>
</div>` : '<p class="lede">The audio for this episode isn\'t available here. Try one of the apps below.</p>';

  const pn = [
    ep.newer ? `<a href="${epUrl(ep.newer)}" rel="next"><small>Newer episode</small><strong>${esc(ep.newer.title)}</strong></a>` : '',
    ep.older ? `<a href="${epUrl(ep.older)}" rel="prev"><small>Older episode</small><strong>${esc(ep.older.title)}</strong></a>` : '',
  ].join('');

  const content = `
<section class="ep-hero" aria-labelledby="ep-title">
<div class="hero-glow" aria-hidden="true"></div>
<div class="wrap ep-hero-inner">
<p class="crumbs"><a href="/">Home</a> / <a href="/episodes/">Episodes</a></p>
<p class="kicker">${metaBits}</p>
<h1 id="ep-title">${esc(ep.title)}</h1>
${player}
<div class="listen-row">${listenLinks(config, true)}</div>
</div>
</section>
<div class="wrap ep-body">
<article class="notes-col" aria-labelledby="notes-h">
${shortsBlock(ep)}
<section class="discussion" id="comments" aria-labelledby="disc-h">
<h2 class="h2" id="disc-h">Discussion</h2>
${commentsBlock(ctx.comments, { pageId: `episode-${ep.guid}`, url, title: ep.title })}
</section>
<h2 class="h2" id="notes-h">Show notes</h2>
<div class="notes">${ep.notesHtml || '<p>No show notes for this one.</p>'}</div>
</article>
<aside class="side-col" aria-label="More episodes">
${pn ? `<div class="pn">${pn}</div>` : ''}
<p style="margin-top:20px"><a href="/episodes/">All episodes →</a></p>
</aside>
</div>`;

  const ld = {
    '@context': 'https://schema.org', '@type': 'PodcastEpisode', url, name: ep.title,
    datePublished: ep.dateIso, description: ep.excerpt,
    ...(ep.durationSeconds ? { timeRequired: `PT${Math.floor(ep.durationSeconds / 3600)}H${Math.floor((ep.durationSeconds % 3600) / 60)}M${ep.durationSeconds % 60}S` } : {}),
    ...(ep.audio ? { associatedMedia: { '@type': 'MediaObject', contentUrl: ep.audio.url, encodingFormat: ep.audio.type } } : {}),
    ...(ep.season && ep.number ? { episodeNumber: ep.number } : {}),
    image: ep.image,
    partOfSeries: { '@type': 'PodcastSeries', '@id': `${config.siteUrl}/#podcast`, name: config.title, url: `${config.siteUrl}/` },
  };
  return layout(ctx, {
    path: epUrl(ep), active: '/episodes/', title: ep.title, description: ep.excerpt || config.description,
    image: ep.image, ogType: 'article', jsonLd: [ld],
  }, content);
}

export function newsPage(ctx) {
  const { news, config } = ctx;
  const live = news.sources.filter((s) => s.count > 0);
  const content = `
<div data-news="page">
<div class="wrap page-head">
<p class="crumbs"><a href="/">Home</a> / News</p>
<h1 class="page-title">Latest LFC news</h1>
<p class="lede">The newest Liverpool FC headlines from around the web, all in one place and refreshed automatically.</p>
<p class="updated">Updated <span data-news-updated>${esc(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }).format(new Date(news.updated)))}</span></p>
</div>
<div class="wrap">
<div data-top-body>${renderTopStories(news.top || [], { now: ctx.builtAt.getTime(), relative: false })}</div>
<h2 class="visually-hidden">All headlines</h2>
<div data-news-body>${renderNewsPage(news, { now: ctx.builtAt.getTime(), relative: false })}</div>
<p class="sources-note">Headlines link to the original publishers: ${config.news.sources.map((s) => `<a href="${esc(s.homepage)}" rel="noopener">${esc(s.name)}</a>`).join(', ')}.</p>
</div>
<script type="application/json" id="news-data">${jsonForScript(news)}</script>
</div>`;
  void live;
  return layout(ctx, { path: '/news/', active: '/news/', title: 'Latest LFC news', description: 'The latest Liverpool FC news headlines from This Is Anfield, the Liverpool Echo, Empire of the Kop, The Anfield Wrap and more.', news: true }, content);
}

export function communityPage(ctx) {
  const { config, episodes } = ctx;
  const content = `
<div class="wrap page-head">
<p class="crumbs"><a href="/">Home</a> / Community</p>
<h1 class="page-title">The Kop On forum</h1>
<p class="lede">Pull up a seat. Pick a room, or join the conversation on any episode: every episode gets its own discussion thread automatically.</p>
</div>
<div class="wrap">
<div class="rooms">${config.rooms.map((r) => `<div class="room"><a href="/community/${esc(r.slug)}/"><h3>${esc(r.name)}</h3><p>${esc(r.description)}</p><span class="go">Join the conversation →</span></a></div>`).join('')}</div>
<section class="block" aria-labelledby="threads-h">
<div class="section-head"><h2 id="threads-h">Latest episode threads</h2><a href="/episodes/">All episodes →</a></div>
<ul class="thread-list">${episodes.slice(0, 8).map((ep) => `<li><a href="${epUrl(ep)}#comments"><strong>${esc(ep.title)}</strong><span>${esc(ep.dateShort)}</span></a></li>`).join('')}</ul>
</section>
</div>`;
  return layout(ctx, { path: '/community/', active: '/community/', title: 'Community', description: 'The Kop On! forum: chat about Liverpool FC with fans from all over the world.' }, content);
}

export function roomPage(ctx, room) {
  const { config } = ctx;
  const path = `/community/${room.slug}/`;
  const content = `
<div class="wrap page-head">
<p class="crumbs"><a href="/">Home</a> / <a href="/community/">Community</a></p>
<h1 class="page-title">${esc(room.name)}</h1>
<p class="lede">${esc(room.description)}</p>
</div>
<div class="wrap" style="padding-top:40px">
${commentsBlock(ctx.comments, { pageId: `room-${room.slug}`, url: config.siteUrl + path, title: `${room.name} · Kop On! forum` })}
<p style="margin-top:40px"><a href="/community/">← All rooms</a></p>
</div>`;
  return layout(ctx, { path, active: '/community/', title: `${room.name} · Forum`, description: room.description }, content);
}

export function editorPage(ctx) {
  const content = `
<div class="wrap page-head">
<p class="crumbs"><a href="/">Home</a> / Editor</p>
<h1 class="page-title">Top stories editor</h1>
<p class="lede">Rewrite or hide the automatic top stories, or add your own. Changes appear on the site about 2 minutes after you save.</p>
</div>
<div class="wrap editor" id="editor">
<p id="editor-status" class="editor-status" role="status" aria-live="polite"></p>
<form id="editor-login" class="ed-login">
<label class="ed-label" for="editor-password">Editor password</label>
<input id="editor-password" class="ed-input" type="password" autocomplete="current-password" required>
<button class="btn btn-primary" type="submit">Open the editor</button>
</form>
<div id="editor-main" hidden>
<div class="ed-bar"><button id="editor-save" class="btn btn-primary" type="button">Save changes</button><button id="editor-logout" class="btn" type="button">Log out</button></div>
<section aria-labelledby="ed-own-h">
<h2 class="h2" id="ed-own-h">Your own stories</h2>
<p class="ed-help">These go at the top of the box, above the automatic ones.</p>
<ul id="editor-pinned" class="ed-list"></ul>
<form id="editor-add" class="ed-card ed-add">
<label class="ed-label">Headline<input class="ed-input" name="headline" maxlength="200" required></label>
<label class="ed-label">Summary<textarea class="ed-input" name="summary" rows="3" maxlength="600"></textarea></label>
<div class="ed-grid">
<label class="ed-label">Link (optional)<input class="ed-input" name="url" type="url" placeholder="https://"></label>
<label class="ed-label">Source name (optional)<input class="ed-input" name="source" maxlength="60" placeholder="e.g. BBC Sport"></label>
<label class="ed-label">Keep it for<select class="ed-input" name="days"><option value="1">1 day</option><option value="2">2 days</option><option value="3" selected>3 days</option><option value="7">1 week</option><option value="14">2 weeks</option></select></label>
</div>
<button class="btn" type="submit">Add story</button>
</form>
</section>
<section aria-labelledby="ed-auto-h" class="block">
<h2 class="h2" id="ed-auto-h">Automatic top stories</h2>
<p class="ed-help">The top 5 that aren't hidden appear on the site. Edit the wording, or tick "Hide" to drop a story.</p>
<ul id="editor-auto" class="ed-list"></ul>
</section>
</div>
</div>`;
  return layout(ctx, { path: '/editor/', title: 'Editor', noindex: true, editor: true }, content);
}

export function notFoundPage(ctx) {
  const latest = ctx.episodes[0];
  const content = `
<div class="wrap lost">
<p class="kicker">Error 404</p>
<h1 class="page-title">Offside!</h1>
<p class="lede">That page doesn't exist, or it has moved. Try the latest episode instead.</p>
<div class="actions"><a class="btn btn-primary" href="${epUrl(latest)}">${esc(latest.title)}</a><a class="btn" href="/episodes/">All episodes</a><a class="btn" href="/">Home</a></div>
</div>`;
  return layout(ctx, { path: '/404.html', title: 'Page not found', noindex: true }, content);
}
