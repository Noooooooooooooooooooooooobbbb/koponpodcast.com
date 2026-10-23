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
  for (const name of ['site.css', 'player.js', 'search.js', 'news-render.js', 'news.js']) {
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

// Episode addresses already published on the live site, so a retitled
// episode keeps its URL (and its comments). Missing on the first deploy.
async function liveSlugs(siteUrl, fetchImpl, log) {
  try {
    const res = await fetchImpl(`${siteUrl}/site-status.json?t=${Date.now()}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return {};
    const data = await res.json();
    const slugs = data && typeof data.slugs === 'object' && data.slugs ? data.slugs : {};
    const clean = {};
    for (const [guid, slug] of Object.entries(slugs)) if (/^[a-z0-9-]{1,200}$/.test(slug)) clean[guid] = slug;
    log(`  kept ${Object.keys(clean).length} published episode URLs from the live site`);
    return clean;
  } catch {
    return {};
  }
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
  const published = await liveSlugs(config.siteUrl, fetchImpl, log);
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
  const commentsOn = (comments.provider === 'hyvor' && comments.hyvorWebsiteId) || (comments.provider === 'remark42' && comments.remark42Host);
  log(commentsOn ? `  comments: ${comments.provider}` : '  comments: not configured yet (showing "opens soon" panels)');

  // 3. Write everything
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const assets = await buildAssets(outDir, config);
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
  await writeOut(outDir, 'site-status.json', JSON.stringify({ builtAt: builtAt.toISOString(), signature, count: episodes.length, latestGuid: episodes[0].guid, latestTitle: episodes[0].title, slugs: Object.fromEntries(episodes.map((e) => [e.guid, e.slug])) }, null, 2));

  log(`  wrote ${episodes.length + 6 + config.rooms.length} pages to ${outDir}`);
  return { episodes, news, outDir, assets };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  build().catch((err) => {
    console.error(`\nBuild failed: ${err.message}`);
    process.exit(1);
  });
}
