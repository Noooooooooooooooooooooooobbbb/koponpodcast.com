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
  const builtAt = Date.parse(live.builtAt || '');
  // Slots are 3 h apart, so allow 3 h early to keep the refresh roughly every maxAgeHours
  if (maxAgeHours && (!Number.isFinite(builtAt) || now.getTime() - builtAt > Math.max(1, maxAgeHours - 3) * 3600000)) {
    return gated(`Daily refresh (last build ${live.builtAt || 'unknown'})`);
  }
  return { rebuild: false, reason: 'Site is up to date' };
}

// The whole scheduled check, with every outside dependency injectable for tests.
export async function runScheduledCheck({ feedUrl, siteUrl, hookUrl, fetchImpl = globalThis.fetch, parseFeed, now = new Date(), maxAgeHours = 24, log = console.log }) {
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
