// Turns show-notes HTML from the feed into safe, tidy HTML (no dependencies).
// - Allow-list of simple formatting tags; everything else is unwrapped or dropped
// - Links only to http(s)/mailto, opened in a new tab
// - Bare URLs become links
// - Timestamps like 12:34 or 1:02:03 become buttons that seek the player

import { decodeEntities } from './entities.mjs';
import { esc, cleanInvisible } from './text.mjs';

const ALLOWED = new Set(['p', 'br', 'a', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'h3', 'h4']);
const RENAME = { b: 'strong', i: 'em', h1: 'h3', h2: 'h3', h5: 'h4', h6: 'h4' };
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'textarea', 'select', 'head', 'title', 'canvas', 'video', 'audio', 'form']);
const BLOCKISH = new Set(['div', 'section', 'article', 'header', 'footer', 'table', 'tr']);

const TS_RE = /(^|[^\d:])((?:\d{1,2}:)?\d{1,2}:\d{2})(?![\d:])/g;

function tsSeconds(raw) {
  const parts = raw.split(':').map(Number);
  if (parts.length === 3) {
    const [h, m, s] = parts;
    if (m > 59 || s > 59) return -1;
    return h * 3600 + m * 60 + s;
  }
  const [m, s] = parts;
  if (s > 59) return -1;
  return m * 60 + s;
}

// Walk the attributes in order, so text inside one attribute's value can never
// be mistaken for another attribute.
function attr(attrs, name) {
  const re = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(attrs))) {
    if (m[1].toLowerCase() === name) return decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return null;
}

function safeHref(raw) {
  const href = cleanInvisible(String(raw ?? '')).trim();
  // Reject anything with control chars or whitespace tricks inside the scheme
  if (/[\u0000-\u001f\u007f]/.test(href)) return '';
  if (/^https?:\/\//i.test(href) || /^mailto:[^\s]+@[^\s]+$/i.test(href)) return href;
  return '';
}

const linkAttrs = (href) => `href="${esc(href)}" target="_blank" rel="nofollow noopener ugc"`;

function linkifyBareUrls(escapedText) {
  // The text is already escaped, so stop at escaped quotes/brackets too
  return escapedText.replace(/https?:\/\/(?:(?!&quot;|&#39;|&lt;|&gt;)[^\s<>"'])+/g, (url) => {
    let tail = '';
    for (;;) {
      if (/[.,;:!?\]]$/.test(url)) { tail = url.slice(-1) + tail; url = url.slice(0, -1); continue; }
      // Keep a closing bracket that belongs to the URL, e.g. .../Foo_(bar)
      if (url.endsWith(')') && (url.match(/\(/g) || []).length < (url.match(/\)/g) || []).length) { tail = ')' + tail; url = url.slice(0, -1); continue; }
      break;
    }
    // url is already HTML-escaped; unescape for the href, escape again inside linkAttrs
    const raw = url.replace(/&amp;/g, '&');
    return `<a ${linkAttrs(raw)}>${url}</a>${tail}`;
  });
}

function linkifyTimestamps(escapedText, maxSeconds, atLineStartOnly, state) {
  const segmentStartsLine = state.atLineStart;
  return escapedText.replace(TS_RE, (m, before, ts, offset) => {
    const secs = tsSeconds(ts);
    if (secs < 0 || (maxSeconds && secs > maxSeconds)) return m;
    if (atLineStartOnly) {
      const prefix = escapedText.slice(0, offset + before.length);
      if (!(segmentStartsLine && /^[\s\-–—•*(\[]*$/.test(prefix))) return m;
    }
    state.count++;
    return `${before}<button type="button" class="ts" data-t="${secs}" aria-label="Play from ${ts}">${ts}</button>`;
  });
}

// Count timestamp-like strings in the plain text (to decide how eager to be)
function countTimestamps(text, maxSeconds) {
  let n = 0;
  for (const m of text.matchAll(TS_RE)) {
    const s = tsSeconds(m[2]);
    if (s >= 0 && (!maxSeconds || s <= maxSeconds)) n++;
  }
  return n;
}

/**
 * @param {string} html
 * @param {{ durationSeconds?: number, timestamps?: boolean }} opts
 */
export function sanitizeHtml(html, opts = {}) {
  const src = String(html ?? '');
  const maxSeconds = opts.durationSeconds ? opts.durationSeconds + 5 : 6 * 3600;
  const wantTs = opts.timestamps !== false;
  // With 2+ timestamps the notes clearly contain chapters: link them all.
  // With just one, only link it if it starts a line (avoids "kick-off at 20:00").
  const plain = decodeEntities(src.replace(/<[^>]*>/g, '\n'));
  const tsCount = wantTs ? countTimestamps(plain, maxSeconds) : 0;
  const tsLineStartOnly = tsCount < 2;

  const out = [];
  const stack = [];
  const state = { atLineStart: true, count: 0 };
  let dropUntil = null;
  let inLink = 0;

  const open = (tag) => stack.includes(tag);
  const closeTo = (tag) => {
    const idx = stack.lastIndexOf(tag);
    if (idx === -1) return;
    while (stack.length > idx) {
      const t = stack.pop();
      out.push(`</${t}>`);
      if (t === 'a') inLink--;
    }
  };

  const TOKEN = /<!--[\s\S]*?(?:-->|$)|<\/?([A-Za-z][A-Za-z0-9-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*\/?>/g;
  let last = 0;
  let m;

  const pushText = (rawText) => {
    if (dropUntil || !rawText) return;
    let t = esc(cleanInvisible(decodeEntities(rawText)));
    if (!inLink) {
      t = linkifyBareUrls(t);
      if (wantTs && tsCount > 0) {
        // Only operate on segments outside the anchors we just created
        t = t.split(/(<a [^>]*>[\s\S]*?<\/a>)/).map((seg) =>
          seg.startsWith('<a ') ? seg : linkifyTimestamps(seg, maxSeconds, tsLineStartOnly, state)).join('');
      }
    }
    if (/\S/.test(rawText)) state.atLineStart = false;
    out.push(t);
  };

  while ((m = TOKEN.exec(src))) {
    pushText(src.slice(last, m.index));
    last = TOKEN.lastIndex;
    const full = m[0];
    if (full.startsWith('<!--')) continue;
    const isClose = full[1] === '/';
    let tag = m[1].toLowerCase();
    const attrs = m[2] || '';

    if (dropUntil) {
      if (isClose && tag === dropUntil) dropUntil = null;
      continue;
    }
    if (DROP_WITH_CONTENT.has(tag)) {
      if (!isClose && !/\/>$/.test(full)) dropUntil = tag;
      continue;
    }
    tag = RENAME[tag] || tag;

    if (tag === 'br') { out.push('<br>'); state.atLineStart = true; continue; }

    if (!ALLOWED.has(tag)) {
      if (BLOCKISH.has(tag) && isClose) { out.push('<br>'); state.atLineStart = true; }
      continue; // unwrap: keep the text, drop the tag
    }

    if (isClose) {
      closeTo(tag);
      if (tag !== 'a' && tag !== 'strong' && tag !== 'em') state.atLineStart = true;
      continue;
    }

    if (tag === 'a') {
      const href = safeHref(attr(attrs, 'href'));
      if (!href || inLink) continue; // unwrap bad or nested links
      out.push(`<a ${linkAttrs(href)}>`);
      stack.push('a');
      inLink++;
      continue;
    }
    if (tag === 'p' || tag === 'blockquote' || tag === 'h3' || tag === 'h4' || tag === 'ul' || tag === 'ol') {
      if (open('p')) closeTo('p'); // block elements can't live inside <p>
    }
    if (tag === 'li' && open('li')) {
      const li = stack.lastIndexOf('li');
      const list = Math.max(stack.lastIndexOf('ul'), stack.lastIndexOf('ol'));
      if (li > list) closeTo('li');
    }
    out.push(`<${tag}>`);
    stack.push(tag);
    state.atLineStart = true;
  }
  pushText(src.slice(last));
  while (stack.length) {
    const t = stack.pop();
    out.push(`</${t}>`);
  }

  return out.join('')
    .replace(/<p>(?:\s|<br>|&nbsp;| )*<\/p>/g, '')
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    .replace(/^(?:\s|<br>)+|(?:\s|<br>)+$/g, '')
    .trim();
}
