// Builds the whole site into ./dist from the podcast RSS feed.
//   npm run build
// Environment variables (all optional):
//   HYVOR_WEBSITE_ID / REMARK42_HOST / REMARK42_SITE_ID  – switch on comments
//   KOPON_FEED_FILE   – build from a local feed file instead of the live feed
//   KOPON_SKIP_NEWS=1 – don't fetch news at build time
import { mkdir, rm, readFile, writeFile, readdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import siteConfig from '../site.config.mjs';
import { parsePodcastFeed } from '../lib/feed.mjs';
import { fetchAllNews } from '../lib/news.mjs';
import { shortsFeedUrl, parseShortsFeed, mergeShorts, assignShorts } from '../lib/shorts.mjs';
import { esc, slugify } from '../lib/text.mjs';
import * as T from '../src/templates.mjs';

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
  // news-render.js first, because news.js imports it
  for (const name of ['site.css', 'player.js', 'search.js', 'comments.js', 'news-render.js', 'news.js']) {
    let text = await readFile(join(srcDir, name), 'utf8');
    if (name === 'news.js') text = text.replace("from './news-render.js'", `from '${assets['news-render.js']}'`);
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
  let news = { updated: builtAt.toISOString(), sources: config.news.sources.map((s) => ({ id: s.id, name: s.name, homepage: s.homepage, ok: false, count: 0, errors: [] })), items: [] };
  if (!env.KOPON_SKIP_NEWS) {
    try {
      news = await fetchAllNews(config.news.sources, { fetch: fetchImpl, perSource: config.news.perSource, max: config.news.max, maxAgeDays: config.news.maxAgeDays, now: builtAt });
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

  const ctx = { config, show, episodes, news, assets, comments, builtAt };

  await writeOut(outDir, 'index.html', T.homePage(ctx));
  await writeOut(outDir, 'episodes/index.html', T.episodesPage(ctx));
  for (const ep of episodes) await writeOut(outDir, `episodes/${ep.slug}/index.html`, T.episodePage(ctx, ep));
  await writeOut(outDir, 'news/index.html', T.newsPage(ctx));
  await writeOut(outDir, 'community/index.html', T.communityPage(ctx));
  for (const room of config.rooms) await writeOut(outDir, `community/${room.slug}/index.html`, T.roomPage(ctx, room));
  await writeOut(outDir, '404.html', T.notFoundPage(ctx));

  // Static files (favicon.ico, IndexNow key, …)
  for (const name of await readdir(join(ROOT, 'src/static'))) await copyFile(join(ROOT, 'src/static', name), join(outDir, name));

  const today = builtAt.toISOString().slice(0, 10);
  const urls = [
    ['/', episodes[0].dateIso], ['/episodes/', episodes[0].dateIso], ['/news/', today], ['/community/', today],
    ...config.rooms.map((r) => [`/community/${r.slug}/`, today]),
    ...episodes.map((ep) => [`/episodes/${ep.slug}/`, ep.dateIso]),
  ];
  await writeOut(outDir, 'sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(([u, d]) => `  <url><loc>${esc(config.siteUrl + u)}</loc><lastmod>${d}</lastmod></url>`).join('\n')}\n</urlset>\n`);
  await writeOut(outDir, 'robots.txt', `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
  // Read by the scheduled checker to decide whether a rebuild is needed
  await writeOut(outDir, 'site-status.json', JSON.stringify({ builtAt: builtAt.toISOString(), signature, count: episodes.length, latestGuid: episodes[0].guid, latestTitle: episodes[0].title, slugs: Object.fromEntries(episodes.map((e) => [e.guid, e.slug])), shortsFeedIds: shorts.feedIds, shorts: shorts.all }, null, 2));

  log(`  wrote ${episodes.length + 6 + config.rooms.length} pages to ${outDir}`);
  return { episodes, news, outDir, assets };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  build().catch((err) => {
    console.error(`\nBuild failed: ${err.message}`);
    process.exit(1);
  });
}
