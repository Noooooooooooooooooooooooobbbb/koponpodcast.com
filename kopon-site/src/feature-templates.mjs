// Stats features: a short written piece with a ranked table (content/features.mjs)
import { esc } from '../lib/text.mjs';
import { layout } from './templates.mjs';

// The default table: [tackles, interceptions, clearances, shots blocked, recoveries, minutes]. Minutes are always the last number.
const METRICS = [['Minutes', null], ['Tackles', [0]], ['Interceptions', [1]], ['Clearances', [2]], ['Shots blocked', [3]], ['Recoveries', [4]], ['Tackles + interceptions', [0, 1]]];
const per90 = (v, mins) => (mins > 0 ? (v * 90) / mins : 0);
const num = (n) => (Number.isInteger(n) ? n.toLocaleString('en-GB') : n.toFixed(2));
// A feature has one table (players at the top level) or several (tables: [{ heading, metrics, players, marks }])
export const featureTables = (f) => f.tables || [{ players: f.players, marks: f.marks, metrics: f.metrics }];

// One block of rows per stat, players ranked by the all-seasons rate (minutes by total)
export function featureRows(f) {
  return (f.metrics || METRICS).map(([name, idx]) => {
    const rows = Object.entries(f.players).map(([player, raw]) => {
      const width = raw.find(Boolean).length;
      const seasons = raw.map((s) => s || new Array(width).fill(0));
      const mins = seasons.map((s) => s[width - 1]);
      const totalMins = mins.reduce((a, b) => a + b, 0);
      const vals = idx ? seasons.map((s) => idx.reduce((a, i) => a + s[i], 0)) : mins;
      const total = vals.reduce((a, b) => a + b, 0);
      const rate = idx ? per90(total, totalMins) : null;
      return { player, key: idx ? rate : total, total, rate, cells: vals.map((v, i) => (raw[i] ? { v, rate: idx ? per90(v, mins[i]) : null, mark: f.marks?.[player]?.[i] || '' } : null)) };
    }).sort((a, b) => b.key - a.key);
    return { name, rows };
  });
}

const cell = (c) => (c ? `${num(c.v)}${c.rate === null ? '' : ` <span class="per">(${c.rate.toFixed(2)})</span>`}${esc(c.mark)}` : '–');

function featureTable(f, t) {
  const groups = featureRows(t);
  return `<div class="table-wrap"><table class="ftable">
<thead><tr><th scope="col" class="c-stat">Stat</th><th scope="col">Rank</th><th scope="col" class="c-name">Player</th>${f.seasons.map((s) => `<th scope="col">${esc(s)}</th>`).join('')}<th scope="col" class="c-all">All seasons</th></tr></thead>
${groups.map((g) => `<tbody>${g.rows.map((r, i) => `<tr${r.player === f.highlight ? ' class="us"' : ''}>${i === 0 ? `<th scope="rowgroup" rowspan="${g.rows.length}" class="c-stat">${esc(g.name)}</th>` : ''}<td class="c-rank">${i + 1}</td><th scope="row" class="c-name">${esc(r.player)}</th>${r.cells.map((c) => `<td>${cell(c)}</td>`).join('')}<td class="c-all">${num(r.total)}${r.rate === null ? '' : ` <span class="per">(${r.rate.toFixed(2)})</span>`}</td></tr>`).join('\n')}</tbody>`).join('\n')}
</table></div>`;
}

const fmtDate = (iso) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
export const featurePath = (f) => `/stats/${f.slug}/`;

export function featurePage(ctx, f) {
  const path = featurePath(f);
  const content = `
<div class="wrap page-head">
<p class="crumbs"><a href="/">Home</a> / <a href="/stats/">Stats</a></p>
<h1 class="page-title">${esc(f.title)}</h1>
<p class="lede">${esc(f.lede)}</p>
<p class="fine" style="margin-top:14px"><time datetime="${esc(f.date)}">${esc(fmtDate(f.date))}</time></p>
</div>
<div class="wrap feature">
<div class="notes">${f.body.map(([h, paras]) => `<h3>${esc(h)}</h3>${paras.map((p) => `<p>${esc(p)}</p>`).join('')}`).join('')}</div>
${featureTables(f).map((t, i) => `<section class="block" aria-labelledby="ft-h${i}"><div class="section-head"><h2 id="ft-h${i}">${esc(t.heading || 'The numbers')}</h2></div>
<p class="fine">Season total, with the rate per 90 minutes in brackets.${f.highlight ? ` ${esc(f.highlight)} is highlighted.` : ''} On a phone, swipe the table sideways.</p>
${featureTable(f, t)}
</section>`).join('\n')}
<div class="feature-notes">${f.notes.map((n) => `<p class="fine" style="margin:12px 0 0">${esc(n)}</p>`).join('')}</div>
<p style="margin-top:40px"><a href="/stats/">← All stats</a></p>
</div>`;
  const jsonLd = [{ '@context': 'https://schema.org', '@type': 'Article', headline: f.title, datePublished: f.date, url: ctx.config.siteUrl + path, author: { '@type': 'Organization', name: ctx.config.title }, isPartOf: { '@id': `${ctx.config.siteUrl}/#podcast` } }];
  return layout(ctx, { path, active: '/stats/', title: f.title, crumbTitle: f.short || f.title, description: f.description, jsonLd }, content);
}

// Links from the Stats page
export function featureLinks(features) {
  if (!features?.length) return '';
  return `<section class="block" aria-labelledby="features-h"><div class="section-head"><h2 id="features-h">Stats features</h2></div>
<ul class="thread-list">${features.map((f) => `<li><a href="${featurePath(f)}"><strong>${esc(f.short || f.title)}</strong><span>${esc(fmtDate(f.date))}</span></a></li>`).join('')}</ul></section>`;
}
