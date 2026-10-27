// POST /api/editor — load and save Owen's top-story edits (see lib/editor.mjs)
import { handleEditor } from '../../lib/editor.mjs';
import { fetchAllNews, newsOptions } from '../../lib/news.mjs';
import { openStore } from '../../lib/fans/store.mjs';
import { overLimit, connectionOf } from '../../lib/fans/api.mjs';
import siteConfig from '../../site.config.mjs';
import { createHash } from 'node:crypto';

const ENV_KEYS = ['EDITOR_PASSWORD', 'GITHUB_TOKEN', 'GITHUB_REPO', 'GITHUB_FILE', 'GITHUB_BRANCH', 'FANS_SALT', 'KOPON_STORE_DIR'];
const env = () => Object.fromEntries(ENV_KEYS.map((k) => [k, globalThis.Netlify?.env?.get?.(k) ?? process.env[k]]));

export default async (req, context) => {
  const e = env();
  // at most 40 editor requests an hour from one connection, so the password can't be guessed by brute force
  if (req.method === 'POST') {
    try {
      const store = await openStore('kopon-fans', e);
      const conn = createHash('sha256').update(`${e.FANS_SALT || ''}|editor|${connectionOf(req, context)}`).digest('hex').slice(0, 32);
      if (await overLimit(store, `edtries/${conn}`, 40, 3600000, Date.now())) {
        return new Response(JSON.stringify({ error: 'Too many attempts. Try again in an hour.' }), { status: 429, headers: { 'Content-Type': 'application/json' } });
      }
    } catch { /* storage unavailable: carry on (the editor still checks the password) */ }
  }
  return handleEditor(req, {
    env: e,
    // KOPON_NOW: a fixed "now", only ever set by the local preview and tests
    loadNews: (edits) => fetchAllNews(siteConfig.news.sources, newsOptions(siteConfig, { edits, includeCandidates: true, ...(process.env.KOPON_NOW ? { now: process.env.KOPON_NOW } : {}) })),
  });
};

export const config = { path: '/api/editor' };
