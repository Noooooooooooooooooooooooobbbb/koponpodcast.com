// IndexNow: tells Bing (and so DuckDuckGo, Yahoo and Ecosia), Yandex, Seznam and Naver
// about new and changed pages straight away, instead of waiting for them to crawl.
// The key below is public by design: search engines check it against the file of the
// same name at the root of the site (src/static/<key>.txt), which proves the site is ours.
export const INDEXNOW_KEY = 'e0c17130937fbfb6c3e05325380eec19';
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX = 10000; // per request

// Which pages changed in this build: new episodes, plus the pages that change every build
export function changedUrls({ siteUrl, live, episodes = [], everyBuild = [] }) {
  const before = new Set(Object.values(live?.slugs && typeof live.slugs === 'object' ? live.slugs : {}));
  const fresh = episodes.filter((ep) => !before.has(ep.slug)).map((ep) => `/episodes/${ep.slug}/`);
  return [...new Set([...everyBuild, ...fresh])].map((p) => siteUrl + p);
}

export const sitemapUrls = (xml) => [...String(xml || '').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&')).filter((u) => !/\.(jpe?g|png|webp)(\?|$)/i.test(u));

export async function submitIndexNow({ fetchImpl = globalThis.fetch, siteUrl, urls }) {
  const host = new URL(siteUrl).host;
  const list = [...new Set(urls)].filter((u) => { try { return new URL(u).host === host; } catch { return false; } }).slice(0, MAX);
  if (!list.length) return { ok: true, sent: 0, status: 0 };
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: INDEXNOW_KEY, keyLocation: `${siteUrl.replace(/\/+$/, '')}/${INDEXNOW_KEY}.txt`, urlList: list }),
    signal: AbortSignal.timeout(15000),
  });
  // 200 = done, 202 = accepted (key still being checked)
  return { ok: res.status === 200 || res.status === 202, sent: list.length, status: res.status };
}

/**
 * Run from the scheduled check: once per published build, send that build's changed pages.
 * The first time ever, the whole sitemap is sent. `store` remembers which build was sent.
 */
export async function indexNowForLiveBuild({ live, siteUrl, store, fetchImpl = globalThis.fetch, log = console.log }) {
  if (!live?.builtAt || !store) return { skipped: 'no live build' };
  const done = await store.get('indexnow/last', { type: 'json' }).catch(() => null);
  if (done?.builtAt === live.builtAt) return { skipped: 'already sent' };
  let urls = Array.isArray(live.indexNow) ? live.indexNow : [];
  if (!done) {
    try {
      const r = await fetchImpl(`${siteUrl.replace(/\/+$/, '')}/sitemap.xml`, { signal: AbortSignal.timeout(10000) });
      if (r.ok) urls = [...urls, ...sitemapUrls(await r.text())];
    } catch { /* the changed pages are enough */ }
  }
  if (!urls.length) { await store.setJSON('indexnow/last', { builtAt: live.builtAt, sent: 0, at: new Date().toISOString() }); return { sent: 0 }; }
  let result;
  try { result = await submitIndexNow({ fetchImpl, siteUrl, urls }); } catch (err) { log(`IndexNow: could not reach the search engines (${err.message}); will try again next time`); return { error: err.message }; }
  if (result.ok) {
    await store.setJSON('indexnow/last', { builtAt: live.builtAt, sent: result.sent, at: new Date().toISOString() });
    log(`IndexNow: told search engines about ${result.sent} page${result.sent === 1 ? '' : 's'}`);
  } else if (result.status === 429) {
    log('IndexNow: too many requests; will try again next time');
  } else {
    // a permanent refusal (bad key, wrong host): don't keep retrying this build
    await store.setJSON('indexnow/last', { builtAt: live.builtAt, sent: 0, refused: result.status, at: new Date().toISOString() });
    log(`IndexNow: refused (HTTP ${result.status})`);
  }
  return result;
}
