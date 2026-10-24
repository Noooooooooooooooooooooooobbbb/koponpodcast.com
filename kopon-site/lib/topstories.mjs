// Free "top stories": groups the same story from different sites, ignores
// clickbait, ranks by how many sites are covering it, and uses the most
// factual headline plus the publishers' own one- or two-sentence summary.
// No AI service, no cost. Owen can edit the result (content/top-stories.mjs).

// ---- clickbait ---------------------------------------------------------------
// [pattern, weight]: a headline scoring 2 or more is treated as clickbait.
const RULES = [
  [/^['‘"“][^'’"”]{1,90}(?:…|\.\.\.)\s*['’"”]/, 3], // 'If he continues like this…' –
  [/\b(?:you won'?t believe|what happened next|here'?s why|here is why|the reason why|find out|this is why)\b/i, 3],
  [/\bfans (?:rush|spot|react|go wild|fume|left|divided|baffled|furious|in stitches|all say|think|notice)\b/i, 3],
  [/(?:\d+% off|flash sale|discount|bargain|shirt sale|buy now|free bet|bet builder|betting tips?|best odds|\bodds\b|\bquiz\b)/i, 3],
  [/\b(?:imparts?|shares?|gives?) (?:\w+[- ])?\d+-word\b|\b\d+-word (?:advice|message|verdict|response)\b/i, 3],
  [/£\d+(?:\.\d+)?m (?:wizard|sensation|star|powerhouse|ace|gem|wonderkid|starlet|maestro|machine|monster|titan|talent)\b/i, 2],
  [/\b(?:wantaway|wonderkid|starlet|powerhouse|sensation)\b/i, 1],
  [/…|\.\.\./, 1],
  [/\?\s*$/, 1],
  [/\b(?:stunning|sensational|incredible|insane|wild|bombshell|heartbreaking|brutal|emphatic|explosive|jaw-?dropping|unbelievable|outrageous|furious|epic|blockbuster|red-?hot|astonishing|shock(?:ing)?|savage)\b/i, 1],
  [/\b(?:sends? (?:a )?(?:\w+ )?message|breaks? (?:his |her )?silence|drops? (?:a )?(?:\w+ )?hint|makes? (?:\w+ ){0,3}(?:admission|confession|claim|feelings clear)|delivers? (?:\w+ ){0,2}verdict|issues? (?:\w+ ){0,2}(?:warning|verdict)|explains why|reveals? why|admits?)\b/i, 1],
  [/\b(?:hits? back|slams?|blasts?|rips? into|reignites?|feud|fires? (?:a )?(?:\w+ )?warning|war of words|furious)\b/i, 1],
  [/\b(?:quietly|eye-?catching|jaw-?dropping|mouth-?watering|tongues wagging|the internet)\b/i, 2],
  [/\b(?:front-?runners?|reportedly|rumou?red|tipped|could (?:be|make|sign|land)|keen on|eyeing|monitoring|considering)\b/i, 1],
  [/\b(?:sky reporter|journalist|pundit|chris sutton|paul merson|jamie carragher|gary neville|roy keane|micah richards)\b/i, 1],
  [/\b(?:prediction|predicts?|predicted score)\b/i, 1],
  [/^(?:\d+|five|ten|three|four) (?:things|reasons|players|ways|stats|talking points)\b/i, 2],
  [/\b[A-Z]{5,}\b/, 1], // SHOUTING
];

export function clickbaitScore(title, extraWords = []) {
  const t = String(title || '');
  let s = 0;
  for (const [re, w] of RULES) if (re.test(t)) s += w;
  for (const w of extraWords) if (w && t.toLowerCase().includes(String(w).toLowerCase())) s += 2;
  return s;
}
export const isClickbait = (title, extraWords) => clickbaitScore(title, extraWords) >= 2;

// Videos, podcasts and live blogs: fine in the list, but not "stories"
export function isNonStory(title) {
  return /\|\s*[^|]{2,50}$/.test(title) // "Title | Show Name" (YouTube / podcast episodes)
    || /\blive(?: updates?| blog|:)|\bLIVE\b|as it happened|player ratings|\bwatch:|\bvideo:|\bpodcast\b|\bpictures:|\bgallery\b/i.test(title);
}

// ---- grouping the same story -------------------------------------------------------
const STOP = new Set(('the a an and or but of to in on at for from by with as is are was were be been has have had it its this that these those his her their they he she we you our your not no yes will would can could should may might must than then so if about into over after before ahead under up out off new latest news update updates report reports says say said told set get gets got make makes made take takes took give gives gave more most very just also still now how why what who when where which while amid despite against during per vs v versus first last next one two three four five').split(' '));
const GENERIC = new Set(('liverpool lfc reds anfield club team side boss manager coach player players star stars fans fan supporters game games match matches clash fixture season week weekend premier league champions cup transfer transfers deal move sign signing signs contract injury injuries update latest win wins draw loss defeat victory goal goals football soccer english european europe uefa press conference ahead time sky echo').split(' '));

// First names are ignored inside a name ("Bradley Barcola" = "Barcola")
const FIRST_NAMES = /^(?:mohamed|virgil|trent|andy|alexis|dominik|ryan|cody|luis|diogo|darwin|curtis|harvey|conor|joe|jarell|ibrahima|alisson|caoimhin|giorgi|federico|florian|hugo|alexander|jeremie|milos|jeremy|bradley|victor|rio|ifeanyi|stefan|wataru|kostas|andoni|arne|jurgen|ian|kenny|steven|jamie|gary|roy|chris|paul|micah|felix|harry|bukayo|erling|cole|kevin|james|john|david|michael|mark|tom|ben|jack|sam|daniel|matt|matthew|luke|adam|josh|joshua|jordan|jake|kieran|virgil)$/;

const stem = (w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

const norm = (w) => stem(w.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, ''));

// Names count once: "Bradley Barcola" and "Barcola" are the same person (the
// last word of a run of capitalised words), so a shared first name never
// glues two different stories together.
export function keywords(title) {
  const words = String(title || '').replace(/[’']s\b/g, '').split(/\s+/).filter(Boolean);
  const proper = new Set(), other = new Set();
  let run = [];
  const endRun = () => {
    if (run.length) {
      let named = false;
      for (let j = run.length - 1; j >= 0; j--) {
        const w = norm(run[j]);
        if (w.length < 3 || GENERIC.has(w) || STOP.has(w)) continue;
        if (!named) { proper.add(w); named = true; } else if (!FIRST_NAMES.test(w)) other.add(w);
      }
    }
    run = [];
  };
  words.forEach((raw, i) => {
    const bare = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
    const breaks = /[,:;.!?)\]”"’–—|]$/.test(raw) || /^[(“"‘–—|]/.test(raw);
    if (!bare) { endRun(); return; }
    if (/^[(“"‘]/.test(raw)) endRun();
    const w = norm(bare);
    const cap = /^\p{Lu}/u.test(bare) && bare !== bare.toUpperCase();
    const isName = cap && (i > 0 || (bare.length > 3 && !STOP.has(w) && !GENERIC.has(w)));
    if (isName) run.push(bare);
    else {
      endRun();
      if (w.length >= 3 && !STOP.has(w) && !GENERIC.has(w) && !/^\d+$/.test(w)) other.add(w);
    }
    if (breaks) endRun();
  });
  endRun();
  for (const p of proper) other.delete(p);
  return { proper, other };
}

// Same story? Shared names count most; ordinary words need help from the summaries.
function sameStory(a, b) {
  let p = 0, o = 0;
  for (const w of a.proper) if (b.proper.has(w)) p++; else if (b.other.has(w)) o++;
  for (const w of a.other) if (b.other.has(w) || b.proper.has(w)) o++;
  if (p >= 2 || (p >= 1 && o >= 1) || o >= 3) return true;
  if (o >= 2 || p >= 1) {
    // Only new evidence counts: words that aren't already in either headline, and not first names
    let s = 0;
    for (const w of a.sum) {
      if (!b.sum.has(w) || a.proper.has(w) || b.proper.has(w) || a.other.has(w) || b.other.has(w) || FIRST_NAMES.test(w)) continue;
      s++;
    }
    return s >= 2;
  }
  return false;
}

const summaryWords = (text) => new Set((String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').match(/[a-z]{4,}/g) || [])
  .map(stem).filter((w) => !STOP.has(w) && !GENERIC.has(w)));

// ---- summaries ------------------------------------------------------------------------
export function cleanSummary(s) {
  let t = String(s || '')
    .replace(/The post .{0,300}? appeared first on .{0,120}$/i, '')
    .replace(/\s*(?:\[…\]|\[\.\.\.\]|\[&#8230;\])\s*$/, '')
    .replace(/\s*(?:Continue reading|Read more|Read the full|Click here|Tap here|Subscribe)\b.*$/i, '')
    .replace(/\s+/g, ' ').trim();
  t = t.replace(/(?:…|\.\.\.)$/, '').trim();
  return t;
}

function firstSentences(text, max = 280) {
  const parts = text.split(/(?<=[.!?])\s+(?=["“‘'A-Z0-9])/);
  let out = '';
  for (const p of parts) {
    if (!out) out = p;
    else if ((out + ' ' + p).length <= max) out += ' ' + p;
    else break;
  }
  if (out.length > max) {
    const cut = out.slice(0, max + 1);
    out = cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6)).replace(/[\s,;:–—-]+$/, '') + '…';
  }
  if (out && !/[.!?…"”’]$/.test(out)) out += '.';
  return out;
}

// How many meaningful words a summary adds beyond the headline
const newWords = (summary, headline) => {
  const H = new Set((headline.toLowerCase().match(/[a-z0-9]{3,}/g) || []).map(stem));
  let n = 0;
  for (const w of new Set((summary.toLowerCase().match(/[a-z0-9]{3,}/g) || []).map(stem))) if (!H.has(w) && !STOP.has(w)) n++;
  return n;
};

export function cleanHeadline(t) {
  return String(t || '')
    .replace(/\s+[–—-]\s+(?:Latest LFC News|Liverpool FC News|LFC News)\s*$/i, '')
    .replace(/^(?:LIVE|BREAKING)[:\s-]+/i, '')
    .replace(/\s+\|\s+[^|]{2,50}$/, '')
    .trim();
}

export const storyKey = (url) => String(url || '').replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/^https?:\/\/(www\.)?/i, '').toLowerCase();

/**
 * @param items  news items (with title, url, date, source, sourceId, summary, image)
 * @param sourceOrder  source ids in order of trust (earlier = preferred headline)
 */
export function computeTopStories(items, { sourceOrder = [], now = new Date(), maxAgeHours = 48, limit = 10, extraClickbait = [] } = {}) {
  const cutoff = now.getTime() - maxAgeHours * 3600000;
  const recent = items.filter((it) => it.date && Date.parse(it.date) >= cutoff)
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date)); // oldest first: the story's key stays stable
  const prio = (id) => { const i = sourceOrder.indexOf(id); return i === -1 ? 99 : i; };

  // Names that are everywhere this week (usually the next opponent) can't tie stories together
  const keyed = recent.map((it) => ({ it, k: keywords(it.title) }));
  const df = new Map();
  for (const { k } of keyed) for (const w of k.proper) df.set(w, (df.get(w) || 0) + 1);
  const common = (w) => df.get(w) >= 4 && df.get(w) > keyed.length * 0.2;
  for (const { k } of keyed) for (const w of [...k.proper]) if (common(w)) { k.proper.delete(w); k.other.add(w); }

  const clusters = [];
  for (const { it, k } of keyed) {
    k.sum = summaryWords(cleanSummary(it.summary));
    const entry = { it, k, cb: clickbaitScore(it.title, extraClickbait), non: isNonStory(it.title) };
    const home = clusters.find((c) => c.members.length < 15 && c.members.some((m) => sameStory(m.k, k)));
    if (home) home.members.push(entry); else clusters.push({ members: [entry] });
  }

  const stories = [];
  for (const c of clusters) {
    const good = c.members.filter((m) => m.cb < 2 && !m.non);
    if (!good.length) continue; // only clickbait or videos: not a story
    const sources = [...new Set(c.members.map((m) => m.it.sourceId))];
    const newest = Math.max(...c.members.map((m) => Date.parse(m.it.date)));
    const ageH = (now.getTime() - newest) / 3600000;
    const score = sources.length * 3 + good.length + Math.max(0, 3 - ageH / 8);

    const head = [...good].sort((a, b) => a.cb - b.cb || prio(a.it.sourceId) - prio(b.it.sourceId) || a.it.title.length - b.it.title.length)[0];
    const headline = cleanHeadline(head.it.title);

    // The summary: a publisher's standfirst that adds something to the headline
    const cands = c.members
      .filter((m) => m.cb < 3)
      .map((m) => ({ m, text: cleanSummary(m.it.summary) }))
      .filter((x) => x.text.length >= 50 && newWords(x.text, headline) >= 5 && !isClickbait(x.text.slice(0, 160), extraClickbait))
      .sort((a, b) => prio(a.m.it.sourceId) - prio(b.m.it.sourceId) || b.text.length - a.text.length);
    const summary = cands.length ? firstSentences(cands[0].text) : '';

    const bySource = new Map();
    for (const m of [head, ...good, ...c.members]) if (!bySource.has(m.it.sourceId)) bySource.set(m.it.sourceId, { name: m.it.source, url: m.it.url });
    stories.push({
      key: storyKey(c.members[0].it.url),
      urls: c.members.map((m) => storyKey(m.it.url)),
      headline, summary,
      url: head.it.url,
      source: head.it.source,
      sources: [...bySource.values()].slice(0, 6),
      count: sources.length,
      date: new Date(newest).toISOString(),
      image: head.it.image || c.members.find((m) => m.it.image)?.it.image || null,
      score,
    });
  }
  return stories.sort((a, b) => b.score - a.score || Date.parse(b.date) - Date.parse(a.date)).slice(0, limit);
}

// ---- Owen's edits ---------------------------------------------------------------------
// edits = { pinned: [{id, headline, summary, url, source, until}], hidden: [storyKey], changes: { storyKey: {headline, summary} } }
export function applyTopEdits(stories, edits = {}, { now = new Date(), limit = 5 } = {}) {
  const hidden = new Set((edits.hidden || []).map(storyKey));
  const changes = edits.changes || {};
  const t = now.getTime();
  const pinned = (edits.pinned || [])
    .filter((p) => p && p.headline && (!p.until || Date.parse(p.until) > t))
    .map((p) => ({ key: `pin-${p.id}`, headline: String(p.headline).slice(0, 200), summary: String(p.summary || '').slice(0, 600), url: /^https?:\/\//i.test(p.url || '') ? p.url : '', source: p.source || 'Kop On!', sources: p.url ? [{ name: p.source || 'Read more', url: p.url }] : [], count: 0, date: p.date || null, image: null, pinned: true }));
  const auto = stories
    .filter((s) => !s.urls.some((u) => hidden.has(u)) && !hidden.has(s.key))
    .map((s) => {
      const ch = changes[s.key];
      return ch ? { ...s, headline: ch.headline ? String(ch.headline).slice(0, 200) : s.headline, summary: ch.summary != null && ch.summary !== '' ? String(ch.summary).slice(0, 600) : s.summary, edited: true } : s;
    });
  return [...pinned, ...auto].slice(0, limit).map(({ urls, score, ...rest }) => rest);
}
