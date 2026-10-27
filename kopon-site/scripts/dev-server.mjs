// Local preview that behaves like Netlify: serves ./dist, runs /api/news
// through the real function, supports HTTP range requests (for audio seeking)
// and serves 404.html for unknown paths.
//   npm run dev                -> http://localhost:8888 (live news)
//   node scripts/dev-server.mjs --fixtures   (news from test/fixtures, offline)
import { createServer } from 'node:http';
import { stat, readFile, open, readdir } from 'node:fs/promises';
import { join, extname, resolve, dirname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const PORT = +opt('--port', process.env.PORT || 8888);
const DIST = resolve(opt('--dir', join(ROOT, 'dist')));

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
};

let apiMode = opt('--api', 'ok'); // ok | fail | slow
const failedOnce = new Set();
if (flag('--fixtures')) {
  const { default: config } = await import(pathToFileURL(join(ROOT, 'site.config.mjs')).href);
  const map = {};
  for (const s of config.news.sources) map[(typeof s.urls[0] === 'string' ? s.urls[0] : s.urls[0].url)] = join(ROOT, 'test/fixtures/news', `${s.id}.xml`);
  // A stand-in for GitHub's file API, so the editor can be tried offline
  process.env.EDITOR_PASSWORD ??= 'kopon-test-password';
  process.env.GITHUB_TOKEN ??= 'test-token';
  process.env.GITHUB_REPO ??= 'owner/repo';
  const ghFiles = new Map();
  let ghSha = 0;
  globalThis.__ghFiles = ghFiles;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    // this preview server itself (e.g. the fan zone reading /data/fans.json)
    if (/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(String(url))) return realFetch(url, init);
    if (String(url).startsWith('https://api.github.com/repos/')) {
      const key = String(url).split('?')[0];
      if (!init.method || init.method === 'GET') {
        const f = ghFiles.get(key);
        return f ? new Response(JSON.stringify({ content: Buffer.from(f.text).toString('base64'), sha: f.sha })) : new Response('{}', { status: 404 });
      }
      const body = JSON.parse(init.body);
      const cur = ghFiles.get(key);
      if (cur && body.sha !== cur.sha) return new Response('{}', { status: 409 });
      const sha = `sha${++ghSha}`;
      ghFiles.set(key, { text: Buffer.from(body.content, 'base64').toString('utf8'), sha });
      return new Response(JSON.stringify({ content: { sha } }));
    }
    const file = map[url];
    if (!file) return new Response('not found', { status: 404 });
    try { return new Response(await readFile(file, 'utf8'), { status: 200 }); } catch { return new Response('not found', { status: 404 }); }
  };
}
const newsFn = (await import(pathToFileURL(join(ROOT, 'netlify/functions/news.mjs')).href)).default;
const editorFn = (await import(pathToFileURL(join(ROOT, 'netlify/functions/editor.mjs')).href)).default;
process.env.KOPON_STORE_DIR ||= join(ROOT, '.fans-store'); // votes go in a local folder, not Netlify
const fansFn = (await import(pathToFileURL(join(ROOT, 'netlify/functions/fans.mjs')).href)).default;

async function sendFile(req, res, file, status = 200) {
  const info = await stat(file);
  const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (range && status === 200) {
    let start = range[1] === '' ? info.size - +range[2] : +range[1];
    let end = range[1] === '' || range[2] === '' ? info.size - 1 : +range[2];
    end = Math.min(end, info.size - 1);
    if (start > end || start < 0) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); return res.end(); }
    res.writeHead(206, { 'Content-Type': type, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Accept-Ranges': 'bytes' });
    const fh = await open(file);
    const stream = fh.createReadStream({ start, end });
    stream.on('close', () => fh.close());
    return stream.pipe(res);
  }
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': info.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
  if (req.method === 'HEAD') return res.end();
  res.end(await readFile(file));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/news') {
      if (apiMode === 'fail') { res.writeHead(500); return res.end('boom'); }
      if (apiMode === 'slow') await new Promise((r) => setTimeout(r, 3000));
      const r = await newsFn(new Request(url));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(await r.text());
    }
    if (url.pathname === '/api/editor') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const r = await editorFn(new Request(url, { method: req.method, headers: { 'Content-Type': 'application/json', 'x-forwarded-for': req.headers['x-forwarded-for'] || req.socket.remoteAddress || '' }, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }), null);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(await r.text());
    }
    if (url.pathname === '/api/fans') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const headers = { 'Content-Type': req.headers['content-type'] || '', 'x-forwarded-for': req.headers['x-forwarded-for'] || req.socket.remoteAddress || '', ...(req.headers.origin ? { origin: req.headers.origin } : {}) };
      const r = await fansFn(new Request(url, { method: req.method, headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined }), null);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(await r.text());
    }
    // Netlify's Image CDN, imitated: with --fixtures a test picture (none for addresses containing
    // "missing", to test the logo fallback); otherwise the original picture, unresized
    if (url.pathname === '/.netlify/images') {
      const src = url.searchParams.get('url') || '';
      if (!/^https:\/\/d3t3ozftmdmh3i\.cloudfront\.net\//.test(src)) { res.writeHead(400); return res.end('remote image not allowed'); }
      if (flag('--fixtures')) {
        if (/missing/.test(src)) { res.writeHead(404); return res.end('no such image'); }
        const faces = (await readdir(join(ROOT, 'test/fixtures/faces'))).filter((f) => f.endsWith('.png')).sort();
        let h = 0; for (const c of src) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        return await sendFile(req, res, join(ROOT, 'test/fixtures/faces', faces[h % faces.length]));
      }
      const r = await fetch(src);
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'image/jpeg' });
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    if (url.pathname === '/__now') { if (url.searchParams.get('t')) process.env.KOPON_NOW = url.searchParams.get('t'); else delete process.env.KOPON_NOW; res.writeHead(200); return res.end(process.env.KOPON_NOW || 'real'); }
    if (url.pathname === '/__gh-file') {
      const f = [...(globalThis.__ghFiles || new Map()).values()][0];
      res.writeHead(200, { 'Content-Type': 'text/plain' }); return res.end(f ? f.text : '');
    }
    if (url.pathname === '/__api-mode') { apiMode = url.searchParams.get('m') || 'ok'; res.writeHead(200); return res.end(apiMode); }
    if (url.pathname.startsWith('/test-media/')) {
      if (url.searchParams.has('failonce') && !failedOnce.has(url.search)) { failedOnce.add(url.search); res.writeHead(503); return res.end('try again'); }
      return await sendFile(req, res, join(ROOT, 'test/fixtures/media', normalize(url.pathname.slice(12)).replace(/^(\.\.[/\\])+/, '')));
    }
    let p = decodeURIComponent(url.pathname);
    const file = join(DIST, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
    let s = await stat(file).catch(() => null);
    if (s?.isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' + url.search }); return res.end(); }
      const idx = join(file, 'index.html');
      if (await stat(idx).catch(() => null)) return await sendFile(req, res, idx);
      s = null;
    }
    if (s?.isFile()) return await sendFile(req, res, file);
    return await sendFile(req, res, join(DIST, '404.html'), 404);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(String(err?.stack || err));
  }
});

server.listen(PORT, '127.0.0.1', () => console.log(`Kop On! preview: http://localhost:${PORT}  (api: ${apiMode}${flag('--fixtures') ? ', fixture news' : ''})`));
