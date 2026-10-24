// /api/fans — fans' line-ups and player ratings (see lib/fans/api.mjs).
// Votes are kept in Netlify Blobs, which every Netlify site has built in.
import { handleFans } from '../../lib/fans/api.mjs';
import { openStore } from '../../lib/fans/store.mjs';

const ENV_KEYS = ['EDITOR_PASSWORD', 'FANS_SALT', 'KOPON_STORE_DIR', 'KOPON_NOW'];
const env = () => Object.fromEntries(ENV_KEYS.map((k) => [k, globalThis.Netlify?.env?.get?.(k) ?? process.env[k]]));

// What's open for voting comes from the site itself (written by each build)
let cached = null;
async function loadConfig(origin) {
  if (cached && Date.now() - cached.t < 60000 && cached.origin === origin) return cached.data;
  const res = await fetch(`${origin}/data/fans.json`, { headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`fans.json: HTTP ${res.status}`);
  const data = await res.json();
  cached = { t: Date.now(), origin, data };
  return data;
}

export default async (req, context) => {
  const e = env();
  // preview and branch deploys keep their own votes, apart from the real site's
  const live = !context?.deploy?.context || context.deploy.context === 'production';
  const store = await openStore(live ? 'kopon-fans' : 'kopon-fans-preview', e);
  // KOPON_NOW only exists in local tests (to pretend it's a different time)
  const now = e.KOPON_NOW ? new Date(e.KOPON_NOW) : new Date();
  return handleFans(req, { store, env: e, context, now, loadConfig: () => loadConfig(new URL(req.url).origin) });
};

export const config = { path: '/api/fans' };
