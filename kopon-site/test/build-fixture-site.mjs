// Builds the site from the test fixtures (no network) for browser testing.
//   node test/build-fixture-site.mjs [--port 8899] [--out dir] [--feed podcast.xml] [--comments hyvor|remark42|none] [--no-news]
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../scripts/build.mjs';
import config from '../site.config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const port = opt('--port', '8899');
const out = opt('--out', join(here, '..', 'dist'));
const feed = opt('--feed', 'podcast.xml');
const comments = opt('--comments', 'none');

let xml = (await readFile(join(here, 'fixtures', feed), 'utf8')).replaceAll('{{AUDIO}}', `http://127.0.0.1:${port}/test-media/tone.mp3`);
if (args.includes('--retitle')) xml = xml.replace('<![CDATA[Feeling better!]]>', '<![CDATA[Feeling MUCH better!]]>');
if (args.includes('--flaky-audio')) xml = xml.replace(/tone\.mp3\?ep=1"/, 'tone.mp3?ep=1&amp;failonce=1"');
const tmp = await mkdtemp(join(tmpdir(), 'kopon-'));
const feedFile = join(tmp, 'feed.xml');
await writeFile(feedFile, xml);

const newsMap = {};
for (const s of config.news.sources) newsMap[typeof s.urls[0] === 'string' ? s.urls[0] : s.urls[0].url] = join(here, 'fixtures/news', `${s.id}.xml`);
const liveStatus = opt('--live-status', null);
const fixtureFetch = async (url) => {
  if (url.includes('/site-status.json')) return liveStatus ? new Response(await readFile(liveStatus, 'utf8')) : new Response('nope', { status: 404 });
  const f = newsMap[url];
  if (!f) return new Response('nope', { status: 404 });
  return new Response(await readFile(f, 'utf8'));
};

const env = { KOPON_FEED_FILE: feedFile };
if (args.includes('--no-news')) env.KOPON_SKIP_NEWS = '1';
if (comments === 'hyvor') env.HYVOR_WEBSITE_ID = '12345';
if (comments === 'remark42') { env.REMARK42_HOST = 'https://comments.example.com/'; env.REMARK42_SITE_ID = 'kopon'; }

await build({ env, fetch: fixtureFetch, outDir: out, now: '2026-10-23T12:00:00Z' });
