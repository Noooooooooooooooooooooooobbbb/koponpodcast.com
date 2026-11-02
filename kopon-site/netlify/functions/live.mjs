// GET /api/live — Liverpool's live match (or the next one) as JSON.
// Netlify's CDN keeps one shared copy for a few seconds, so however many people are
// watching, ESPN is asked only about three times a minute during a match.
import { liveNow } from '../../lib/live.mjs';
import siteConfig from '../../site.config.mjs';

const env = (k) => globalThis.Netlify?.env?.get?.(k) ?? process.env[k];

// how long everyone can share one answer (seconds)
export function cacheSeconds(data) {
  if (data.state === 'in') return 20;
  if (data.state === 'pre') return 60;
  if (data.state === 'post') return 120;
  if (data.state === 'error') return 30;
  return 300;
}

export async function handleLive(req, { fetchImpl = globalThis.fetch, now = new Date(), teamId = String(siteConfig.stats?.espnTeamId || '364') } = {}) {
  let data;
  try {
    data = await liveNow({ fetchImpl, teamId, now, signal: AbortSignal.timeout(9000) });
  } catch (err) {
    data = { state: 'error', message: 'Live updates are paused for a moment.', updated: now.toISOString() };
  }
  const s = cacheSeconds(data);
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // browsers always ask again (the page has its own timing); Netlify's CDN shares one copy for everyone
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Netlify-CDN-Cache-Control': `public, durable, s-maxage=${s}, stale-while-revalidate=${s}`,
    },
  });
}

export default async (req) => {
  // KOPON_NOW: a fixed "now", only ever set by the local preview and tests
  const now = env('KOPON_NOW') ? new Date(env('KOPON_NOW')) : new Date();
  return handleLive(req, { now });
};

export const config = { path: '/api/live' };
