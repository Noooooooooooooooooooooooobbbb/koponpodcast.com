// The top-stories editor (POST /api/editor). Owen's edits are saved as
// content/top-stories.mjs in the GitHub repository, which makes Netlify
// rebuild the site with them. Needs these Netlify environment variables:
//   EDITOR_PASSWORD  – the password for /editor/ (8+ characters)
//   GITHUB_TOKEN     – a fine-grained token with "Contents: read and write" on the repo
//   GITHUB_REPO      – e.g. "owner/koponpodcast.com"
//   GITHUB_FILE      – optional, default "kopon-site/content/top-stories.mjs"
//   GITHUB_BRANCH    – optional, default "main"
import { createHash, timingSafeEqual } from 'node:crypto';

const LIMITS = { pinned: 10, hidden: 300, changes: 60, headline: 200, summary: 600, url: 500, source: 60 };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const sha256 = (s) => createHash('sha256').update(String(s)).digest();

export function passwordOk(given, expected) {
  if (!expected || String(expected).length < 8 || typeof given !== 'string' || !given) return false;
  return timingSafeEqual(sha256(given), sha256(expected));
}

const str = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

// Only what the site understands, within sensible sizes
export function cleanEdits(input, now = new Date()) {
  const e = input && typeof input === 'object' ? input : {};
  const pinned = (Array.isArray(e.pinned) ? e.pinned : []).slice(0, LIMITS.pinned).map((p, i) => {
    const days = Math.min(30, Math.max(1, parseInt(p?.days, 10) || 3));
    const until = p?.until && Number.isFinite(Date.parse(p.until)) ? new Date(p.until).toISOString() : new Date(now.getTime() + days * 86400000).toISOString();
    const url = str(p?.url, LIMITS.url);
    return {
      id: str(p?.id, 40).replace(/[^\w-]/g, '') || `${now.getTime().toString(36)}${i}`,
      headline: str(p?.headline, LIMITS.headline),
      summary: str(p?.summary, LIMITS.summary),
      url: /^https?:\/\/[^\s]+$/i.test(url) ? url : '',
      source: str(p?.source, LIMITS.source),
      date: p?.date && Number.isFinite(Date.parse(p.date)) ? new Date(p.date).toISOString() : now.toISOString(),
      until,
    };
  }).filter((p) => p.headline && Date.parse(p.until) > now.getTime());
  const hidden = [...new Set((Array.isArray(e.hidden) ? e.hidden : []).map((h) => str(h, LIMITS.url)).filter(Boolean))].slice(-LIMITS.hidden);
  const changes = {};
  for (const [k, v] of Object.entries(e.changes && typeof e.changes === 'object' ? e.changes : {}).slice(0, LIMITS.changes)) {
    const key = str(k, LIMITS.url);
    const headline = str(v?.headline, LIMITS.headline), summary = str(v?.summary, LIMITS.summary);
    if (key && (headline || summary)) changes[key] = { headline, summary };
  }
  return { pinned, hidden, changes };
}

export function serialiseEdits(edits) {
  return `// Edits to the "Top stories" box. The site's editor page (/editor/) writes\n// this file for you, so you normally never need to touch it by hand.\nexport default ${JSON.stringify(edits, null, 2)};\n`;
}

export function parseEditsFile(text) {
  const s = String(text || '');
  const start = s.indexOf('{', s.indexOf('export default'));
  const end = s.lastIndexOf('}');
  if (start === -1 || end < start) return { pinned: [], hidden: [], changes: {} };
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return { pinned: [], hidden: [], changes: {} }; }
}

function github(env, fetchImpl) {
  const repo = String(env.GITHUB_REPO || '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
  const file = String(env.GITHUB_FILE || 'kopon-site/content/top-stories.mjs').replace(/^\/+/, '');
  const branch = env.GITHUB_BRANCH || 'main';
  const token = env.GITHUB_TOKEN;
  if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  const url = `https://api.github.com/repos/${repo}/contents/${file.split('/').map(encodeURIComponent).join('/')}`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'KopOnEditor/1.0' };
  return {
    async read() {
      const res = await fetchImpl(`${url}?ref=${encodeURIComponent(branch)}`, { headers, signal: AbortSignal.timeout(10000) });
      if (res.status === 404) return { edits: { pinned: [], hidden: [], changes: {} }, sha: null };
      if (!res.ok) throw new Error(`GitHub said ${res.status}${res.status === 401 || res.status === 403 ? ' (check GITHUB_TOKEN and its permissions)' : ''}`);
      const j = await res.json();
      return { edits: parseEditsFile(Buffer.from(j.content || '', 'base64').toString('utf8')), sha: j.sha };
    },
    async write(text, sha, message) {
      const body = { message, content: Buffer.from(text, 'utf8').toString('base64'), branch };
      if (sha) body.sha = sha;
      const res = await fetchImpl(url, { method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
      if (res.status === 409 || res.status === 422) throw Object.assign(new Error('The stories were changed somewhere else in the meantime. Reload the editor and try again.'), { status: 409 });
      if (!res.ok) throw new Error(`GitHub said ${res.status}${res.status === 401 || res.status === 403 || res.status === 404 ? ' (check GITHUB_TOKEN, GITHUB_REPO and the token\'s permissions)' : ''}`);
      return (await res.json())?.content?.sha || null;
    },
  };
}

/**
 * @param {Request} req
 * @param {{ env: object, fetchImpl?: Function, loadNews: (edits) => Promise<object>, now?: Date, delay?: (ms) => Promise<void> }} deps
 */
export async function handleEditor(req, { env, fetchImpl = globalThis.fetch, loadNews, now = new Date(), delay = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (req.method !== 'POST') return json(405, { error: 'Use POST' });
  if (!env.EDITOR_PASSWORD || String(env.EDITOR_PASSWORD).length < 8) return json(503, { error: 'The editor is not switched on yet: add EDITOR_PASSWORD (8+ characters) in Netlify.' });
  let body;
  try { body = await req.json(); } catch { return json(400, { error: 'Bad request' }); }
  if (!passwordOk(body?.password, env.EDITOR_PASSWORD)) { await delay(800); return json(401, { error: 'Wrong password' }); }
  const gh = github(env, fetchImpl);
  if (!gh) return json(503, { error: 'Saving is not set up yet: add GITHUB_TOKEN and GITHUB_REPO in Netlify.' });

  try {
    if (body.action === 'load') {
      const { edits, sha } = await gh.read();
      const news = await loadNews(cleanEdits(edits, now));
      return json(200, { edits: cleanEdits(edits, now), sha, candidates: news.candidates || [], top: news.top || [], updated: news.updated });
    }
    if (body.action === 'save') {
      const edits = cleanEdits(body.edits, now);
      const sha = await gh.write(serialiseEdits(edits), body.sha || null, 'Update top stories (from the editor)');
      return json(200, { ok: true, sha, edits });
    }
    return json(400, { error: 'Unknown action' });
  } catch (err) {
    return json(err.status || 502, { error: err.message || 'Something went wrong' });
  }
}
