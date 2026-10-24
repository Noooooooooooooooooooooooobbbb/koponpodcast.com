// Builds the whole site into ./dist from the podcast RSS feed.
//   npm run build
// Environment variables (all optional):
//   HYVOR_WEBSITE_ID / REMARK42_HOST / REMARK42_SITE_ID  – switch on comments
//   KOPON_FEED_FILE   – build from a local feed file instead of the live feed
//   KOPON_SKIP_NEWS=1 – don't fetch news at build time
//   KOPON_SKIP_STATS=1 – don't fetch stats at build time
//   FOOTBALL_DATA_KEY / API_FOOTBALL_KEY – extra stats (see site.config.mjs)
import { mkdir, rm, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import siteConfig from '../site.config.mjs';
import { parsePodcastFeed } from '../lib/feed.mjs';
import { fetchAllNews } from '../lib/news.mjs';
import topEdits from '../content/top-stories.mjs';
import { shortsFeedUrl, parseShortsFeed, mergeShorts, assignShorts } from '../lib/shorts.mjs';
import { esc, slugify } from '../lib/text.mjs';
import { newsOptions } from '../lib/news.mjs';
import * as T from '../src/templates.mjs';
import { statsPage, previewPage } from '../src/stats-templates.mjs';
import { fansHub, lineupPage, ratingsPage, fansJson, ratePath } from '../src/fans-templates.mjs';
import { buildStats } from '../lib/stats/index.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function fetchFeed(url, fetchImpl, attempts = 3) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': 'KopOnSiteBuilder/2.0' }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      console.warn(`  feed attempt ${i} failed: ${err.message}`);
      if (i < attempts) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw new Error(`Could not download the podcast feed (${url}): ${lastErr?.message}`);
}

function resolveComments(config, env) {
  const c = { ...config.comments };
  if (env.DISQUS_SHORTNAME) { c.provider = 'disqus'; c.disqusShortname = env.DISQUS_SHORTNAME.trim(); }
  if (env.CUSDIS_APP_ID) { c.provider = 'cusdis'; c.cusdisAppId = env.CUSDIS_APP_ID.trim(); }
  if (env.HYVOR_WEBSITE_ID) { c.provider = 'hyvor'; c.hyvorWebsiteId = env.HYVOR_WEBSITE_ID.trim(); }
  if (env.REMARK42_HOST) { c.provider = 'remark42'; c.remark42Host = env.REMARK42_HOST.trim(); }
  if (env.REMARK42_SITE_ID) c.remark42SiteId = env.REMARK42_SITE_ID.trim();
  return c;
}

const hash = (buf) => createHash('sha256').update(buf).digest('hex').slice(0, 10);

async function writeOut(outDir, path, content) {
  const file = join(outDir, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, content);
}

// Copies assets to /assets/ and returns { name: "/assets/name?v=hash" }
async function buildAssets(outDir, config) {
  const assets = {};
  const srcDir = join(ROOT, 'src/assets');
  await mkdir(join(outDir, 'assets'), { recursive: true });

  for (const name of await readdir(join(srcDir, 'img'))) {
    const buf = await readFile(join(srcDir, 'img', name));
    await writeFile(join(outDir, 'assets', name), buf);
    assets[name] = `/assets/${name}?v=${hash(buf)}`;
  }
  // modules before the files that import them (their addresses carry a version)
  for (const name of ['site.css', 'player.js', 'search.js', 'comments.js', 'editor.js', 'stats.js', 'news-render.js', 'news.js', 'fans-core.js', 'fans-ui.js', 'lineup.js', 'ratings.js']) {
    let text = await readFile(join(srcDir, name), 'utf8');
    text = text.replace(/from '\.\/([\w-]+\.js)'/g, (m, dep) => (assets[dep] ? `from '${assets[dep]}'` : m));
    await writeFile(join(outDir, 'assets', name), text);
    assets[name] = `/assets/${name}?v=${hash(text)}`;
  }
  const manifest = JSON.stringify({
    name: config.title, short_name: config.shortTitle, start_url: '/', display: 'standalone',
    background_color: '#0b0b0f', theme_color: '#0b0b0f',
    icons: [
      { src: assets['icon-192.png'], sizes: '192x192', type: 'image/png' },
      { src: assets['icon-512.png'], sizes: '512x512', type: 'image/png' },
    ],
  }, null, 2);
  await writeFile(join(outDir, 'assets', 'site.webmanifest'), manifest);
  assets['site.webmanifest'] = `/assets/site.webmanifest?v=${hash(manifest)}`;
  return assets;
}

// Your own player photos: files in kopon-site/photos/ (named after the player,
// e.g. virgil-van-dijk.jpg) and addresses listed in site.config.mjs (playerPhotos)
async function copyOwnPhotos(outDir, config, log) {
  const own = {};
  for (const [name, url] of Object.entries(config.playerPhotos || {})) if (/^https:\/\/\S+$/.test(String(url))) own[slugify(name)] = String(url);
  let files = [];
  try { files = await readdir(join(ROOT, 'photos')); } catch { return own; }
  const pics = files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
  if (!pics.length) return own;
  await mkdir(join(outDir, 'photos'), { recursive: true });
  for (const f of pics) {
    const buf = await readFile(join(ROOT, 'photos', f));
    if (buf.length > 2 * 1024 * 1024) { log(`  photos: ${f} is over 2 MB, skipped (please make it smaller)`); continue; }
    const slug = slugify(f.replace(/\.[^.]+$/, ''));
    const out = `${slug}${f.slice(f.lastIndexOf('.')).toLowerCase()}`;
    await writeFile(join(outDir, 'photos', out), buf);
    own[slug] = `/photos/${out}?v=${hash(buf)}`;
  }
  log(`  photos: ${Object.keys(own).length} of your own player photos`);
  return own;
}

// Tidy up common slips in site.config.mjs (trailing slash, spaces in room names)
function normaliseConfig(c) {
  return {
    ...c,
    siteUrl: String(c.siteUrl || '').trim().replace(/\/+$/, ''),
    rooms: (c.rooms || []).map((r) => ({ ...r, slug: slugify(r.slug || r.name) })),
    slugOverrides: c.slugOverrides || {},
  };
}

// What the live site published last time (episode addresses, Shorts seen).
// Missing on the very first deploy, which is fine.
async function liveStatus(siteUrl, fetchImpl) {
  try {
    const res = await fetchImpl(`${siteUrl}/site-status.json?t=${Date.now()}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

// Episode addresses already published, so a retitled episode keeps its URL (and its comments)
function publishedSlugs(live) {
  const slugs = live && typeof live.slugs === 'object' && live.slugs ? live.slugs : {};
  const clean = {};
  for (const [guid, slug] of Object.entries(slugs)) if (/^[a-z0-9-]{1,200}$/.test(slug)) clean[guid] = slug;
  return clean;
}

// Stats. The previous build's remembered match data comes from the live site
// (stats-cache.json) so each build only fetches what's new. If everything
// fails, the last good numbers are kept.
async function loadStats(config, live, fetchImpl, env, now, log, ownPhotos = {}) {
  if (config.stats?.enabled === false) return { data: null, file: null };
  // Read the remembered data even if site-status.json couldn't be read: losing it means re-fetching everything
  let prev = null;
  try {
    const res = await fetchImpl(`${config.siteUrl}/stats-cache.json?t=${now.getTime()}`, { signal: AbortSignal.timeout(15000) });
    if (res.ok) { const j = await res.json(); if (j && typeof j === 'object' && j.v === 1) prev = j; }
  } catch { /* first build with stats, or the site is down */ }
  const cache = prev?.cache && typeof prev.cache === 'object' ? prev.cache : {};
  const save = (good) => JSON.stringify({ v: 1, savedAt: now.toISOString(), cache, data: good || null });
  if (env.KOPON_SKIP_STATS) return { data: null, file: prev ? save(prev.data) : null };

  let data = null;
  // After 4 minutes, outstanding requests are cancelled and whatever arrived is used
  const stop = new AbortController();
  const timer = setTimeout(() => { log('  stats: taking too long, using what has arrived so far'); stop.abort(); }, 240000);
  try {
    let hard;
    const limit = new Promise((_, rej) => { hard = setTimeout(() => rej(new Error('still running after 5 minutes')), 300000); });
    const r = await Promise.race([buildStats({ fetchImpl, env, config, now, cache, log, signal: stop.signal, ownPhotos }), limit]).finally(() => clearTimeout(hard));
    data = r.data;
    for (const s of data.sources) log(`  stats: ${s.name.padEnd(36)} ${s.ok ? 'ok' : 'FAILED'}${s.detail ? ` (${s.detail})` : ''}`);
    if (data.afUsage) log(`  stats: API-Football requests this build ${data.afUsage.used}, left today ${data.afUsage.remaining ?? '?'}`);
  } catch (err) {
    log(`  stats failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
    stop.abort(); // nothing left running in the background
  }
  // Nothing at all came back (e.g. ESPN down): show the last good numbers instead
  const empty = !data || (!data.next.length && !data.results.length);
  const good = empty ? prev?.data || null : data;
  if (empty && prev?.data) {
    log('  stats: using the last good numbers from the live site');
    data = { ...prev.data, stale: true };
  } else if (empty) {
    data = null; // nothing to show: the page says the stats will be back soon
  }
  // The fan zone couldn't be worked out this time: keep the last one
  if (data && !data.fans && prev?.data?.fans) data.fans = prev.data.fans;
  if (data?.fans) {
    const F = data.fans;
    // a line-up for a match that has already been played can't be picked any more
    if (F.lineup && Date.parse(F.lineup.kickoff) < now.getTime() - 3 * 3600000) F.lineup = null;
    F.rate = (F.rate || []).filter((m) => Date.parse(m.closes) > now.getTime() - 60 * 86400000);
  }
  // Matches already played drop out of "next"
  if (data) {
    data.next = (data.next || []).filter((m) => Date.parse(m.date) > now.getTime() - 3 * 3600000);
    data.previews = (data.previews || []).filter((m) => data.next.some((n) => n.slug === m.slug));
  }
  return { data, file: save(good) };
}

async function loadShorts(config, live, fetchImpl, env, log) {
  const previous = Array.isArray(live?.shorts) ? live.shorts : [];
  const url = shortsFeedUrl(config.youtube?.channelId);
  let fresh = null;
  if (url && !env.KOPON_SKIP_SHORTS) {
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': 'KopOnSiteBuilder/2.0' }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fresh = parseShortsFeed(await res.text());
      log(`  YouTube Shorts: ${fresh.length} in the feed, ${previous.length} remembered`);
    } catch (err) {
      log(`  YouTube Shorts feed unavailable (${err.message}); using the ${previous.length} remembered`);
    }
  }
  return {
    all: mergeShorts(previous, fresh || []),
    // what the scheduled checker compares against to spot new Shorts
    feedIds: fresh ? fresh.map((s) => s.id) : (Array.isArray(live?.shortsFeedIds) ? live.shortsFeedIds : null),
  };
}

export async function build(options = {}) {
  const env = options.env || process.env;
  const config = normaliseConfig(options.config || siteConfig);
  const fetchImpl = options.fetch || globalThis.fetch;
  const outDir = options.outDir || join(ROOT, 'dist');
  const builtAt = options.now ? new Date(options.now) : new Date();
  const log = options.quiet ? () => {} : (...a) => console.log(...a);

  log('Kop On! site build');
  // 1. Podcast feed (a build without it would be empty, so fail loudly)
  const xml = env.KOPON_FEED_FILE
    ? await readFile(env.KOPON_FEED_FILE, 'utf8')
    : await fetchFeed(config.feedUrl, fetchImpl);
  const live = env.KOPON_NO_LIVE ? null : await liveStatus(config.siteUrl, fetchImpl);
  const published = publishedSlugs(live);
  if (Object.keys(published).length) log(`  kept ${Object.keys(published).length} published episode URLs from the live site`);
  const { show, episodes, signature } = parsePodcastFeed(xml, {
    excerptStopMarkers: config.excerptStopMarkers,
    slugOverrides: { ...published, ...config.slugOverrides },
  });
  if (!episodes.length) throw new Error('The podcast feed has no episodes; refusing to publish an empty site.');
  log(`  ${episodes.length} episodes (latest: ${episodes[0].title})`);

  // 2. News (never fatal: the live /api/news keeps it fresh anyway)
  let news = { top: [], updated: builtAt.toISOString(), sources: config.news.sources.map((s) => ({ id: s.id, name: s.name, homepage: s.homepage, ok: false, count: 0, errors: [] })), items: [] };
  if (!env.KOPON_SKIP_NEWS) {
    try {
      news = await fetchAllNews(config.news.sources, newsOptions(config, { fetch: fetchImpl, now: builtAt, edits: options.topEdits || topEdits }));
      for (const s of news.sources) log(`  news: ${s.name.padEnd(20)} ${s.ok ? `${s.count} headlines` : `FAILED (${s.errors.join('; ')})`}`);
    } catch (err) {
      console.warn(`  news fetch failed: ${err.message}`);
    }
  }

  const comments = resolveComments(config, env);
  const commentsOn = (comments.provider === 'hyvor' && comments.hyvorWebsiteId) || (comments.provider === 'remark42' && comments.remark42Host)
    || (comments.provider === 'disqus' && /^[a-z0-9-]+$/i.test(comments.disqusShortname || '')) || (comments.provider === 'cusdis' && comments.cusdisAppId);
  log(commentsOn ? `  comments: ${comments.provider}` : '  comments: not configured yet (showing "opens soon" panels)');

  // 3. Write everything
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const assets = await buildAssets(outDir, config);
  const shorts = await loadShorts(config, live, fetchImpl, env, log);
  const shortsBySlug = assignShorts(episodes, shorts.all, {
    perEpisode: config.youtube?.shortsPerEpisode ?? 6,
    extra: config.youtube?.extraShorts,
    hide: config.youtube?.hideShorts || [],
  });
  for (const ep of episodes) ep.shorts = shortsBySlug.get(ep.slug) || [];

  const ownPhotos = await copyOwnPhotos(outDir, config, log);
  const stats = await loadStats(config, live, fetchImpl, env, builtAt, log, ownPhotos);
  const ctx = { config, show, episodes, news, assets, comments, builtAt, stats: stats.data };

  await writeOut(outDir, 'index.html', T.homePage(ctx));
  await writeOut(outDir, 'episodes/index.html', T.episodesPage(ctx));
  for (const ep of episodes) await writeOut(outDir, `episodes/${ep.slug}/index.html`, T.episodePage(ctx, ep));
  await writeOut(outDir, 'news/index.html', T.newsPage(ctx));
  await writeOut(outDir, 'community/index.html', T.communityPage(ctx));
  for (const room of config.rooms) await writeOut(outDir, `community/${room.slug}/index.html`, T.roomPage(ctx, room));
  // A surprise in the stats data must never stop the podcast site from publishing
  let previews = [];
  try {
    const pages = [['stats/index.html', statsPage(ctx)]];
    for (const p of stats.data?.previews || []) pages.push([`stats/${p.slug}/index.html`, previewPage(ctx, p)]);
    for (const [path, html] of pages) await writeOut(outDir, path, html);
    previews = stats.data?.previews || [];
  } catch (err) {
    console.warn(`  stats pages failed (${err.message}); publishing a placeholder`);
    await writeOut(outDir, 'stats/index.html', statsPage({ ...ctx, stats: null }));
  }
  if (stats.file) await writeOut(outDir, 'stats-cache.json', stats.file);
  // The fan zone (line-up picker and player ratings)
  let ratePages = [];
  try {
    await writeOut(outDir, 'fans/index.html', fansHub(ctx));
    await writeOut(outDir, 'fans/lineup/index.html', lineupPage(ctx));
    for (const m of stats.data?.fans?.rate || []) { await writeOut(outDir, `fans/ratings/${m.slug}/index.html`, ratingsPage(ctx, m)); ratePages.push(ratePath(m)); }
    await writeOut(outDir, 'data/fans.json', fansJson(ctx));
  } catch (err) {
    console.warn(`  fan zone pages failed (${err.message}); publishing placeholders`);
    const plain = { ...ctx, stats: ctx.stats ? { ...ctx.stats, fans: null } : null };
    await writeOut(outDir, 'fans/index.html', fansHub(plain));
    await writeOut(outDir, 'fans/lineup/index.html', lineupPage(plain));
    await writeOut(outDir, 'data/fans.json', fansJson(plain));
    ratePages = [];
  }
  await writeOut(outDir, '404.html', T.notFoundPage(ctx));
  await writeOut(outDir, 'editor/index.html', T.editorPage(ctx));

  // Static files (favicon.ico, IndexNow key, …)
  for (const name of await readdir(join(ROOT, 'src/static'))) await copyFile(join(ROOT, 'src/static', name), join(outDir, name));

  const today = builtAt.toISOString().slice(0, 10);
  const urls = [
    ['/', episodes[0].dateIso], ['/episodes/', episodes[0].dateIso], ['/news/', today], ['/stats/', today], ['/community/', today],
    ...previews.map((p) => [`/stats/${p.slug}/`, today]),
    ['/fans/', today], ['/fans/lineup/', today], ...ratePages.map((p) => [p, today]),
    ...config.rooms.map((r) => [`/community/${r.slug}/`, today]),
    ...episodes.map((ep) => [`/episodes/${ep.slug}/`, ep.dateIso]),
  ];
  await writeOut(outDir, 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d]) => `  <url><loc>${esc(config.siteUrl + u)}</loc><lastmod>${d}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  await writeOut(outDir, 'robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /editor/\nDisallow: /stats-cache.json\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
  // Read by the scheduled checker to decide whether a rebuild is needed
  await writeOut(outDir, 'site-status.json', JSON.stringify({ builtAt: builtAt.toISOString(), signature, count: episodes.length, latestGuid: episodes[0].guid, latestTitle: episodes[0].title, slugs: Object.fromEntries(episodes.map((e) => [e.guid, e.slug])), shortsFeedIds: shorts.feedIds, shorts: shorts.all, nextKickoff: stats.data && !stats.data.stale ? stats.data.nextKickoff || null : null, inPlay: stats.data && !stats.data.stale ? stats.data.inPlay || null : null }, null, 2));

  log(`  wrote ${episodes.length + 9 + config.rooms.length + previews.length + ratePages.length} pages to ${outDir}`);
  return { episodes, news, outDir, assets, stats: stats.data };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  build().catch((err) => {
    console.error(`\nBuild failed: ${err.message}`);
    process.exit(1);
  });
}
