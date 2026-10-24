// Decides whether the scheduled checker should trigger a new Netlify build.
// `live` is the /site-status.json published with the current deploy (null if
// missing); `feed` describes the podcast feed as it is right now.
//
// Builds cost build minutes, so retries are throttled: a brand-new episode
// triggers straight away (checks in its first 45 minutes: at most 3), while
// everything else (edits, daily refresh, retrying after a failed build) only
// happens in the first 15 minutes of every 3rd hour. Worst case if builds
// keep failing: 8 a day, plus up to 3 extra on the day an episode comes out.
export function decideRebuild(live, feed, { now = new Date(), maxAgeHours = 24 } = {}) {
  if (!feed || !feed.count) return { rebuild: false, reason: 'Feed returned no episodes; leaving the site alone' };
  const slot = now.getUTCHours() % 3 === 0 && now.getUTCMinutes() < 15;
  const gated = (reason) => (slot ? { rebuild: true, reason } : { rebuild: false, reason: `${reason} (waiting for the next 3-hourly slot)` });

  if (!live || !live.signature) return gated('No build status found on the live site');
  if (live.signature !== feed.signature) {
    if (live.latestGuid !== feed.latestGuid) {
      const age = feed.latestDate ? now.getTime() - Date.parse(feed.latestDate) : NaN;
      // Only for genuinely fresh episodes (not future-dated ones, which would loop)
      if (age >= 0 && age < 45 * 60000) return { rebuild: true, reason: `New episode: ${feed.latestTitle}` };
      return gated(`Feed has a newer episode than the site: ${feed.latestTitle}`);
    }
    return gated('Episode details changed in the feed');
  }
  if (Array.isArray(feed.shortsIds) && Array.isArray(live.shortsFeedIds) && feed.shortsIds.join() !== live.shortsFeedIds.join()) {
    return gated('New YouTube Shorts');
  }
  const builtAt = Date.parse(live.builtAt || '');
  // Stats: refresh soon after a match ends (results, table, next preview), and
  // on the day before / day of a match (team news). `nextKickoff` is the first
  // upcoming match when the live site was built.
  // A match was still going when the site last built (extra time, penalties, a late kick-off):
  // build again 45 minutes later, for up to 4 hours after its kick-off
  const inPlay = Date.parse(live.inPlay || '');
  if (Number.isFinite(inPlay) && Number.isFinite(builtAt) && now.getTime() - builtAt >= 45 * 60000) {
    if (now.getTime() - inPlay < 4 * 3600000) return { rebuild: true, reason: 'Match was still going at the last build: updating the stats' };
    if (builtAt < inPlay + 4 * 3600000) return gated('Match was still going at the last build: updating the stats');
  }
  const ko = Date.parse(live.nextKickoff || '');
  if (Number.isFinite(ko) && Number.isFinite(builtAt)) {
    const sinceKo = now.getTime() - ko;
    if (builtAt < ko + 2 * 3600000 && sinceKo >= 2.25 * 3600000) {
      // first 45 minutes after the final whistle: straight away (3 checks at most), then throttled
      if (sinceKo < 3 * 3600000) return { rebuild: true, reason: 'Match finished: updating the stats' };
      return gated('Match finished: updating the stats');
    }
    if (sinceKo < 0 && -sinceKo < 26 * 3600000 && now.getTime() - builtAt > 6 * 3600000) return gated('Matchday: refreshing team news');
  }
  // Slots are 3 h apart, so allow 3 h early to keep the refresh roughly every maxAgeHours
  if (maxAgeHours && (!Number.isFinite(builtAt) || now.getTime() - builtAt > Math.max(1, maxAgeHours - 3) * 3600000)) {
    return gated(`Daily refresh (last build ${live.builtAt || 'unknown'})`);
  }
  return { rebuild: false, reason: 'Site is up to date' };
}

// The whole scheduled check, with every outside dependency injectable for tests.
export async function runScheduledCheck({ feedUrl, siteUrl, hookUrl, fetchImpl = globalThis.fetch, parseFeed, shortsUrl = '', parseShorts = null, now = new Date(), maxAgeHours = 24, log = console.log }) {
  if (!hookUrl) {
    log('BUILD_HOOK_URL is not set, so automatic rebuilds are off. See README: "Turn on automatic rebuilds".');
    return { rebuild: false, reason: 'No build hook configured' };
  }
  const get = async (url, as) => {
    const res = await fetchImpl(url, { headers: { 'User-Agent': 'KopOnRebuildCheck/2.0', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return as === 'json' ? res.json() : res.text();
  };

  let feed;
  try {
    const { episodes, signature } = parseFeed(await get(feedUrl, 'text'));
    feed = { count: episodes.length, signature, latestGuid: episodes[0]?.guid, latestTitle: episodes[0]?.title, latestDate: episodes[0]?.date?.toISOString?.() };
  } catch (err) {
    log(`Could not read the podcast feed (${err.message}); will try again next time.`);
    return { rebuild: false, reason: 'Feed unavailable' };
  }

  // New YouTube Shorts (optional; ignored if YouTube can't be reached)
  if (shortsUrl && parseShorts) {
    try { feed.shortsIds = parseShorts(await get(shortsUrl, 'text')).map((s) => s.id); } catch (err) { log(`YouTube Shorts feed unavailable (${err.message})`); }
  }

  let live = null;
  try {
    const res = await fetchImpl(`${siteUrl.replace(/\/+$/, '')}/site-status.json?t=${now.getTime()}`, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(10000) });
    if (res.status === 404) live = null; // site predates this system: build it
    else if (!res.ok) throw new Error(`HTTP ${res.status}`);
    else live = await res.json();
  } catch (err) {
    // Can't see the live site right now; don't guess (could loop builds)
    log(`Could not read site-status.json from ${siteUrl} (${err.message}); will try again next time.`);
    return { rebuild: false, reason: 'Live site status unavailable' };
  }

  const decision = decideRebuild(live, feed, { now, maxAgeHours });
  log(decision.reason);
  if (decision.rebuild) {
    try {
      const res = await fetchImpl(`${hookUrl}${hookUrl.includes('?') ? '&' : '?'}trigger_title=${encodeURIComponent(decision.reason.slice(0, 80))}`, { method: 'POST', signal: AbortSignal.timeout(10000) });
      log(res.ok ? 'Rebuild triggered.' : `Build hook returned HTTP ${res.status}`);
      decision.triggered = res.ok;
    } catch (err) {
      log(`Could not reach the build hook: ${err.message}`);
      decision.triggered = false;
    }
  }
  return decision;
}
