// The Stats page (/stats/) and a preview page per upcoming match (/stats/<slug>/).
// Everything that came from an API is escaped with esc().
import { esc, jsonForScript, slugify } from '../lib/text.mjs';
import { layout, commentsBlock } from './templates.mjs';

// ---- formatting ----------------------------------------------------------------------
const UK = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', ...opts });
// A missing or unreadable date from an API shows as blank instead of stopping the build
const safe = (opts) => (d) => { const t = new Date(d); return d && Number.isFinite(t.getTime()) ? UK(opts).format(t) : ''; };
const fmtDay = safe({ weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = safe({ hour: '2-digit', minute: '2-digit' });
const fmtDate = safe({ day: 'numeric', month: 'short', year: 'numeric' });
const fmtUpdated = safe({ hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' });
const when = (m) => [fmtDay(m.date), m.tbc ? 'time TBC' : fmtTime(m.date)].filter(Boolean).join(' · ');
export const compName = (c) => String(c || '').replace(/^English\s+/i, '').replace(/^UEFA\s+/i, '').replace(/^Spanish\s+/i, '').trim() || 'Match';
export const ordinal = (n) => { n = +n; if (!n) return '–'; const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };
const num = (v, dp = 0) => (v == null || !Number.isFinite(+v) ? '–' : (+v).toFixed(dp));

// Values in the team rankings
export function fmtMetric(v, unit) {
  if (v == null || !Number.isFinite(v)) return '–';
  if (unit === 'pct') return `${v.toFixed(1)}%`;
  if (unit === 'tot') return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
  if (unit === 'num') return v.toFixed(2);
  return v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
}

const crest = (url, size = 24) => (url ? `<img class="crest" src="${esc(url)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">` : `<span class="crest crest-blank" style="width:${size}px;height:${size}px" aria-hidden="true"></span>`);
const WORD = { W: 'Win', D: 'Draw', L: 'Loss' };
const badge = (r, title = '') => (WORD[r] ? `<span class="res res-${r.toLowerCase()}"${title ? ` title="${esc(title)}"` : ''}><span aria-hidden="true">${r}</span><span class="visually-hidden">${WORD[r]}${title ? ` (${esc(title)})` : ''}</span></span>` : '');

// ---- pieces --------------------------------------------------------------------------
function nextCards(ctx) {
  const list = ctx.stats.next || [];
  if (!list.length) return '<p class="stats-empty">No upcoming fixtures are listed right now.</p>';
  return `<ol class="fixtures">${list.map((m) => `<li class="fixture"><a href="/stats/${esc(m.slug)}/">
<span class="fx-comp">${esc(compName(m.comp))}</span>
<span class="fx-opp">${crest(m.opp.logo, 40)}<span><span class="fx-ha">${m.isHome ? 'Home' : 'Away'}${m.isHome ? ' v' : ' at'}</span><strong>${esc(m.opp.shortName || m.opp.name)}</strong></span></span>
<span class="fx-when"><time datetime="${esc(m.tbc ? String(m.date).slice(0, 10) : m.date)}">${esc(when(m))}</time></span>
<span class="fx-go">Preview →</span>
</a></li>`).join('')}</ol>
<p class="fine">Kick-off times are UK time. TBC means the time hasn't been fixed yet (usually waiting on TV picks).</p>`;
}

function resultsList(ctx) {
  const list = ctx.stats.results || [];
  if (!list.length) return '<p class="stats-empty">No results yet this season.</p>';
  const us = ctx.stats.team;
  return `<ul class="results">${list.map((r) => {
    const [h, a, hs, as] = r.home ? [us, r.opp, r.gf, r.ga] : [r.opp, us, r.ga, r.gf];
    return `<li class="result">${badge(r.r)}<span class="rs-teams"><span class="rs-team${r.home ? ' us' : ''}">${esc(h.shortName || h.name)}</span><span class="rs-score">${esc(num(hs))}–${esc(num(as))}</span><span class="rs-team${r.home ? '' : ' us'}">${esc(a.shortName || a.name)}</span></span><span class="rs-meta">${esc(compName(r.comp))} · <time datetime="${esc(r.date)}">${esc(fmtDay(r.date))}</time></span></li>`;
  }).join('')}</ul>`;
}

function seasonTiles(ctx) {
  const s = ctx.stats.season, l = ctx.stats.seasonLeague;
  if (!s || !s.P) return '';
  const tile = (label, v, sub) => `<div class="tile"><span class="tile-v">${esc(v)}</span><span class="tile-l">${esc(label)}</span>${sub != null ? `<span class="tile-s">${esc(sub)}</span>` : ''}</div>`;
  const lg = l && l.P ? l : null;
  return `<section class="block" aria-labelledby="season-h">
<div class="section-head"><h2 id="season-h">Season so far</h2></div>
<p class="fine">All competitions${lg ? '; Premier League only underneath' : ''}.</p>
<div class="tiles">
${tile('Played', s.P, lg ? `PL ${lg.P}` : null)}${tile('Won', s.W, lg ? `PL ${lg.W}` : null)}${tile('Drawn', s.D, lg ? `PL ${lg.D}` : null)}${tile('Lost', s.L, lg ? `PL ${lg.L}` : null)}
${tile('Goals for', s.GF, lg ? `PL ${lg.GF}` : null)}${tile('Goals against', s.GA, lg ? `PL ${lg.GA}` : null)}${tile('Clean sheets', s.cs, lg ? `PL ${lg.cs}` : null)}${tile('Points per game', s.ppg.toFixed(2), lg ? `PL ${lg.ppg.toFixed(2)}` : null)}
</div>
</section>`;
}

const ZONES = {
  pl: (pos, n) => (pos <= 4 ? 'z-ucl' : pos > n - 3 ? 'z-down' : ''),
  ucl: (pos) => (pos <= 8 ? 'z-ko' : pos <= 24 ? 'z-po' : 'z-out'),
};
const LEGENDS = {
  pl: '<span class="key z-ucl">Champions League places</span><span class="key z-down">Relegation</span>',
  ucl: '<span class="key z-ko">Round of 16</span><span class="key z-po">Play-offs</span><span class="key z-out">Out</span>',
};

export function leagueTable(ctx, key, { collapse = 0, highlight = [], id = '', size = 0 } = {}) {
  const t = ctx.stats.tables?.[key];
  if (!t || !t.rows?.length) return '';
  const usRow = t.rows.find((r) => isUsRow(ctx, r));
  const shown = (r) => !collapse || r.pos <= collapse || r === usRow || highlight.some((h) => h === r);
  return `<div class="table-wrap" data-allow-scroll><table class="league${collapse ? ' collapsible' : ''}"${id ? ` id="${esc(id)}"` : ''}>
<caption class="visually-hidden">${esc(t.name)} table</caption>
<thead><tr><th scope="col" class="c-pos"><abbr title="Position">#</abbr></th><th scope="col" class="c-team">Club</th><th scope="col"><abbr title="Played">P</abbr></th><th scope="col" class="hide-sm"><abbr title="Won">W</abbr></th><th scope="col" class="hide-sm"><abbr title="Drawn">D</abbr></th><th scope="col" class="hide-sm"><abbr title="Lost">L</abbr></th><th scope="col" class="hide-sm"><abbr title="Goals for">GF</abbr></th><th scope="col" class="hide-sm"><abbr title="Goals against">GA</abbr></th><th scope="col"><abbr title="Goal difference">GD</abbr></th><th scope="col"><abbr title="Points">Pts</abbr></th>${t.rows.some((r) => r.form) ? '<th scope="col" class="c-form hide-sm">Form</th>' : ''}</tr></thead>
<tbody>${t.rows.map((r) => `<tr class="${[ZONES[key]?.(r.pos, size || t.rows.length), r === usRow || highlight.includes(r) ? 'us' : '', shown(r) ? '' : 'more'].filter(Boolean).join(' ')}"><td class="c-pos">${esc(r.pos)}</td><th scope="row" class="c-team">${crest(r.logo, 20)}<span>${esc(r.name)}</span></th><td>${esc(r.P)}</td><td class="hide-sm">${esc(r.W)}</td><td class="hide-sm">${esc(r.D)}</td><td class="hide-sm">${esc(r.L)}</td><td class="hide-sm">${esc(r.GF)}</td><td class="hide-sm">${esc(r.GA)}</td><td>${r.GD > 0 ? '+' : ''}${esc(r.GD)}</td><td class="c-pts">${esc(r.Pts)}</td>${t.rows.some((x) => x.form) ? `<td class="c-form hide-sm">${[...String(r.form || '')].reverse().map((c) => badge(c)).join('')}</td>` : ''}</tr>`).join('')}</tbody>
</table></div>
<p class="legend">${LEGENDS[key] || ''}<span class="src">Source: ${esc(t.source)}${t.matchday ? ` · matchday ${esc(t.matchday)}` : ''}</span></p>
${collapse && t.rows.length > collapse + 1 ? `<button type="button" class="btn btn-small table-toggle" data-table="${esc(id)}" aria-controls="${esc(id)}" aria-expanded="false" hidden>Show all ${t.rows.length} teams</button>` : ''}`;
}
const isUsRow = (ctx, r) => {
  const us = ctx.stats.team;
  return r && (String(r.id) === String(us.id) || [r.name, r.full].some((n) => n && n.replace(/\s+FC$/i, '').toLowerCase() === String(us.name).toLowerCase()));
};

function rankRows(ctx) {
  const R = ctx.stats.ranks;
  const me = R?.teams?.find((t) => String(t.id) === String(ctx.stats.team.id));
  if (!me) return '';
  const n = R.teams.length;
  const groups = [...new Set(R.metrics.map((m) => m.group))];
  const avg = {}, lo = {}, hi = {};
  for (const m of R.metrics) {
    const vals = R.teams.map((t) => t.v[m.key]).filter((v) => v != null && Number.isFinite(v));
    avg[m.key] = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    lo[m.key] = Math.min(0, ...vals); hi[m.key] = Math.max(...vals);
  }
  const w = (k, v) => (v == null || hi[k] === lo[k] ? 0 : Math.max(2, Math.round(((v - lo[k]) / (hi[k] - lo[k])) * 100)));
  const tier = (r) => (!r ? '' : r <= Math.ceil(n / 5) ? 'r-top' : r > n - Math.ceil(n / 5) ? 'r-low' : 'r-mid');
  const others = R.teams.filter((t) => t !== me).sort((a, b) => a.name.localeCompare(b.name));
  return `<section class="block" aria-labelledby="ranks-h">
<div class="section-head"><h2 id="ranks-h">How we compare</h2></div>
<p class="fine">${esc(ctx.stats.team.name)} against the rest of the Premier League, per game, from ${esc(R.counted)} matches. Rank is out of ${n}; a longer bar is a bigger number.</p>
<div class="compare-pick"><label for="cmp">Compare with</label><select id="cmp" class="select"><option value="">League average</option>${others.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}</select></div>
<div class="rank-groups">${groups.map((g) => `<div class="rank-group"><h3>${esc(g)}</h3><dl class="ranks">${R.metrics.filter((m) => m.group === g).map((m) => `<div class="rank" data-k="${esc(m.key)}"><dt>${esc(m.label)}</dt><dd>
<span class="bar-row us"><span class="bar-name">${esc(me.short || 'LIV')}</span><span class="bar"><span style="width:${w(m.key, me.v[m.key])}%"></span></span><span class="bar-v">${esc(fmtMetric(me.v[m.key], m.unit))}</span><span class="bar-r ${tier(me.rank[m.key])}">${esc(ordinal(me.rank[m.key]))}</span></span>
<span class="bar-row them"><span class="bar-name" data-cmp-name>Avg</span><span class="bar"><span data-cmp-bar style="width:${w(m.key, avg[m.key])}%"></span></span><span class="bar-v" data-cmp-v>${esc(fmtMetric(avg[m.key], m.unit))}</span><span class="bar-r" data-cmp-r></span></span>
</dd></div>`).join('')}</dl></div>`).join('')}</div>
<script type="application/json" id="ranks-data">${jsonForScript({ n, teams: R.teams.map((t) => ({ id: t.id, short: t.short, v: t.v, rank: t.rank })), metrics: R.metrics.map((m) => ({ key: m.key, unit: m.unit })), avg, lo, hi })}</script>
<p class="fine">xG (expected goals) is Kop On's own estimate of how likely each shot was to go in, worked out from where it was taken. Big chances are shots worth at least 0.3 xG. PPDA is opposition passes allowed per defensive action: lower means a more intense press.</p>
</section>`;
}

// [key, heading, title, per-90 allowed, decimals]
const PLAYER_COLS = [
  ['apps', 'Apps', 'Appearances (starts in brackets)'], ['mins', 'Mins', 'Minutes played'],
  ['goals', 'G', 'Goals', true], ['assists', 'A', 'Assists', true], ['shots', 'Sh', 'Shots', true], ['shotsOn', 'SoT', 'Shots on target', true],
  ['keyPasses', 'KP', 'Key passes (passes that led to a shot)', true], ['passPct', 'Pass%', 'Pass accuracy'], ['dribbles', 'Drb', 'Successful dribbles', true],
  ['tackles', 'Tkl', 'Tackles', true], ['ints', 'Int', 'Interceptions', true], ['duelsWonPct', 'Duel%', 'Duels won'], ['yellow', 'YC', 'Yellow cards'], ['red', 'RC', 'Red cards'], ['rating', 'Rating', 'Average match rating (out of 10)'],
];
const POS = { Goalkeeper: 'GK', Defender: 'DEF', Midfielder: 'MID', Attacker: 'FWD' };

function playersSection(ctx) {
  const ps = (ctx.stats.players || []).filter((p) => p.mins > 0);
  if (!ps.length) return '';
  const regular = ps.filter((p) => p.mins >= 270);
  const lead = (label, key, fmt = (v) => v, pool = ps, ok = (v) => v > 0) => {
    const best = [...pool].sort((a, b) => (b[key] ?? -1) - (a[key] ?? -1))[0];
    return best && ok(best[key]) ? `<div class="leader"><span class="ld-l">${esc(label)}</span><span class="ld-v">${esc(fmt(best[key]))}</span><span class="ld-n">${esc(best.name)}</span></div>` : '';
  };
  const cols = PLAYER_COLS.filter(([k]) => ps.some((p) => p[k] != null));
  const espn = ctx.stats.playersSource === 'ESPN';
  const per90 = (p, k) => (p.mins ? (p[k] / p.mins) * 90 : 0);
  const cell = (p, [k, , , p90]) => {
    let v = p[k], txt = v == null ? '–' : String(v);
    if (k === 'apps') txt = `${p.apps} (${p.starts})`;
    if (k === 'passPct' || k === 'duelsWonPct') txt = v == null ? '–' : `${v}%`;
    if (k === 'rating') txt = v == null ? '–' : v.toFixed(2);
    if (k === 'mins') txt = v.toLocaleString('en-GB');
    return `<td data-v="${esc(v ?? -1)}"${p90 ? ` data-p90="${esc(per90(p, k).toFixed(2))}" data-tot="${esc(txt)}"` : ''}>${esc(txt)}</td>`;
  };
  return `<section class="block" aria-labelledby="players-h">
<div class="section-head"><h2 id="players-h">Player stats</h2></div>
<p class="fine">This season, all competitions.</p>
<div class="leaders">
${lead('Goals', 'goals')}${lead('Assists', 'assists')}${lead('Key passes', 'keyPasses')}${espn ? lead('Shots on target', 'shotsOn') : ''}${lead('Dribbles', 'dribbles')}${lead('Tackles', 'tackles')}${espn ? lead('Saves', 'saves') : ''}${lead(espn ? 'Kop On rating' : 'Best rating', 'rating', (v) => v.toFixed(2), regular.length ? regular : ps, (v) => v != null)}
</div>
<div class="player-tools">
<div class="chips" role="group" aria-label="Show players by position"><button type="button" class="chip" data-pos="" aria-pressed="true">All</button>${Object.entries(POS).filter(([p]) => ps.some((x) => x.pos === p)).map(([p, s]) => `<button type="button" class="chip" data-pos="${esc(p)}" aria-pressed="false">${esc(s)}</button>`).join('')}</div>
<div class="chips" role="group" aria-label="Numbers shown"><button type="button" class="chip" data-mode="tot" aria-pressed="true">Totals</button><button type="button" class="chip" data-mode="p90" aria-pressed="false">Per 90 mins</button></div>
</div>
<div class="table-wrap" data-allow-scroll><table class="players" id="players-table">
<caption class="visually-hidden">Player stats this season. Select a column heading to sort.</caption>
<thead><tr><th scope="col" class="c-player"><button type="button" class="sort" data-sort="name">Player</button></th><th scope="col"><abbr title="Position">Pos</abbr></th>${cols.map(([k, h, t]) => `<th scope="col" aria-sort="${k === 'mins' ? 'descending' : 'none'}"><button type="button" class="sort" data-sort="${esc(k)}" title="${esc(t)}">${esc(h)}</button></th>`).join('')}</tr></thead>
<tbody>${ps.map((p) => `<tr data-pos="${esc(p.pos)}" data-mins="${esc(p.mins)}"><th scope="row" class="c-player" data-v="${esc(p.name)}">${esc(p.name)}</th><td>${esc(POS[p.pos] || p.pos || '–')}</td>${cols.map((c) => cell(p, c)).join('')}</tr>`).join('')}</tbody>
</table></div>
<p class="fine p90-note" hidden>Per 90 minutes: players with fewer than 270 minutes are listed last when sorting, so short cameos don't top the table.</p>
<p class="fine player-key">${cols.filter(([k, h]) => h.length <= 6 && h.toLowerCase() !== k).map(([, h, t]) => `<span><b>${esc(h)}</b> ${esc(t.toLowerCase())}</span>`).join(' · ')}.</p>
<p class="fine">${espn ? 'Worked out from ESPN line-ups and match stats. Minutes are estimated from substitution times, and the rating is Kop On\'s own (goals, assists, shots, saves, clean sheets, results and cards).' : 'Source: API-Football.'}</p>
</section>`;
}

function scorersList(ctx) {
  const s = ctx.stats.scorers || [];
  if (!s.length) return '';
  const us = ctx.stats.team.name.toLowerCase();
  return `<section class="block" aria-labelledby="scorers-h">
<div class="section-head"><h2 id="scorers-h">Premier League top scorers</h2></div>
<ol class="scorers">${s.map((p) => `<li class="${String(p.team).toLowerCase().startsWith(us) ? 'us' : ''}">${crest(p.logo, 20)}<span class="sc-name">${esc(p.name)}<span class="sc-team">${esc(p.team)}</span></span><span class="sc-g"><strong>${esc(p.goals)}</strong> goals${p.assists ? `<span class="sc-a">${esc(p.assists)} assists</span>` : ''}</span></li>`).join('')}</ol>
</section>`;
}

const SOURCE_LINKS = { ESPN: 'https://www.espn.co.uk/football/', 'football-data.org': 'https://www.football-data.org/', 'API-Football': 'https://www.api-football.com/' };
function sourcesNote(ctx) {
  const used = new Set(['ESPN']);
  for (const s of ctx.stats.sources || []) if (s.ok) for (const k of Object.keys(SOURCE_LINKS)) if (s.name.includes(k) || s.detail?.includes?.(k)) used.add(k);
  if (Object.values(ctx.stats.tables || {}).some((t) => t.source === 'football-data.org')) used.add('football-data.org');
  return `<p class="sources-note">Updated ${esc(fmtUpdated(ctx.stats.updated))} UK time${ctx.stats.stale ? ' (the latest update failed, so these are the last good numbers)' : ''}. Data: ${[...used].map((k) => `<a href="${SOURCE_LINKS[k]}" rel="noopener">${esc(k)}</a>`).join(', ')}.</p>`;
}

// ---- pages --------------------------------------------------------------------------
export function statsPage(ctx) {
  const st = ctx.stats;
  const head = `<div class="wrap page-head">
<p class="crumbs"><a href="/">Home</a> / Stats</p>
<h1 class="page-title">Stats</h1>
<p class="lede">Fixtures, results, tables and the numbers behind ${esc(st?.team?.name || 'Liverpool')}'s season. Pick a match for a full preview.</p>
</div>`;
  if (!st) {
    return layout(ctx, { path: '/stats/', active: '/stats/', title: 'Stats', description: 'Liverpool FC fixtures, results, tables and stats.', jsonLd: [pageLd(ctx, 'Stats', '/stats/')] }, `${head}<div class="wrap"><p class="stats-empty">The stats are having a breather and will be back after the next update.</p></div>`);
  }
  const content = `${head}
<div class="wrap stats">
<div class="stats-top">
<section aria-labelledby="next-h"><div class="section-head"><h2 id="next-h">Next ${st.next.length > 1 ? st.next.length : ''} ${st.next.length === 1 ? 'match' : 'matches'}</h2></div>${nextCards(ctx)}</section>
<section aria-labelledby="results-h"><div class="section-head"><h2 id="results-h">Results</h2></div>${resultsList(ctx)}</section>
</div>
${seasonTiles(ctx)}
${st.tables?.pl ? `<section class="block" aria-labelledby="pl-h"><div class="section-head"><h2 id="pl-h">Premier League</h2></div>${leagueTable(ctx, 'pl', { id: 'pl-table' })}</section>` : ''}
${st.tables?.ucl ? `<section class="block" aria-labelledby="ucl-h"><div class="section-head"><h2 id="ucl-h">Champions League</h2></div>${leagueTable(ctx, 'ucl', { collapse: 8, id: 'ucl-table' })}</section>` : ''}
${rankRows(ctx)}
${playersSection(ctx)}
${scorersList(ctx)}
${sourcesNote(ctx)}
</div>`;
  return layout(ctx, { path: '/stats/', active: '/stats/', title: 'Stats', description: `${st.team.name} fixtures, results, the Premier League and Champions League tables, and team and player stats.`, stats: true, jsonLd: [pageLd(ctx, 'Liverpool FC stats', '/stats/')] }, content);
}

const pageLd = (ctx, name, path) => ({ '@context': 'https://schema.org', '@type': 'WebPage', name, url: ctx.config.siteUrl + path, isPartOf: { '@id': `${ctx.config.siteUrl}/#podcast` } });

function formRow(list) {
  if (!list?.length) return '<p class="fine">No recent matches found.</p>';
  return `<ol class="form-list">${list.map((f) => `<li>${badge(f.r)}<span class="fl-score">${esc(f.gs?.[0])}–${esc(f.gs?.[1])}</span><span class="fl-opp">${f.at === 'H' ? 'v' : 'at'} ${esc(f.opp)}</span><span class="fl-meta">${esc(compName(f.comp))} · ${esc(fmtDay(f.date))}</span></li>`).join('')}</ol>`;
}

const CREDIT = { 'Fantasy Premier League': 'the Premier League (official Fantasy Premier League data)', ESPN: 'ESPN', 'API-Football': 'API-Football' };
function newsCredit(p) {
  const used = p.newsSources ? [...new Set([...(p.newsSources.home || []), ...(p.newsSources.away || [])])] : ['ESPN', ...(p.afInjuries ? ['API-Football'] : [])];
  const order = Object.keys(CREDIT);
  const names = used.sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((u) => CREDIT[u] || u);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || 'ESPN';
  return `Injury and suspension news from ${esc(list)}, refreshed every few hours and on matchday; check the club's own news before kick-off.`;
}

function newsList(list) {
  if (!list?.length) return '<p class="fine">No injuries or suspensions reported.</p>';
  const label = (o) => (o.why === 'Doubtful' && o.chance != null ? `${o.chance}% chance` : o.why);
  return `<ul class="out-list">${list.map((o) => `<li><span class="out-name">${esc(o.name)}</span><span class="out-why why-${esc(slugify(o.why))}">${esc(label(o))}</span>${o.detail && o.detail.toLowerCase() !== o.why.toLowerCase() ? `<span class="out-detail">${esc(o.detail)}${o.since ? ` <span class="out-since">(news from ${esc(o.since)})</span>` : ''}</span>` : ''}</li>`).join('')}</ul>`;
}

function seasonCompare(p) {
  const H = p.seasons?.home, A = p.seasons?.away;
  if (!H?.P || !A?.P) return '';
  const rows = [['Played', H.P, A.P], ['Won', H.W, A.W], ['Drawn', H.D, A.D], ['Lost', H.L, A.L], ['Goals for', H.GF, A.GF], ['Goals against', H.GA, A.GA], ['Clean sheets', H.cs, A.cs], ['Failed to score', H.fts, A.fts], ['Points per game', +H.ppg.toFixed(2), +A.ppg.toFixed(2)]];
  return `<section class="block" aria-labelledby="season-h"><h2 class="h2" id="season-h">Season so far</h2><p class="fine">All competitions.</p>
<table class="duel"><thead><tr><th scope="col">${esc(p.home.shortName || p.home.name)}</th><th scope="col"><span class="visually-hidden">Stat</span></th><th scope="col">${esc(p.away.shortName || p.away.name)}</th></tr></thead><tbody>
${rows.map(([l, h, a]) => { const t = (+h || 0) + (+a || 0) || 1; return `<tr><td class="d-h"><span class="d-v">${esc(h)}</span><span class="d-bar"><span style="width:${Math.round((h / t) * 100)}%"></span></span></td><th scope="row">${esc(l)}</th><td class="d-a"><span class="d-bar"><span style="width:${Math.round((a / t) * 100)}%"></span></span><span class="d-v">${esc(a)}</span></td></tr>`; }).join('')}
</tbody></table></section>`;
}

const KEY_METRICS = ['goals', 'xg', 'shots', 'big', 'conceded', 'xga', 'poss', 'passPct', 'ppda'];
function leagueCompare(ctx, p) {
  const R = ctx.stats.ranks;
  if (p.tableKey !== 'pl' || !R) return '';
  const th = R.teams.find((t) => String(t.id) === String(p.home.id)), ta = R.teams.find((t) => String(t.id) === String(p.away.id));
  if (!th || !ta) return '';
  const ms = R.metrics.filter((m) => KEY_METRICS.includes(m.key));
  return `<section class="block" aria-labelledby="nums-h"><h2 class="h2" id="nums-h">Premier League numbers</h2><p class="fine">Per game this season, with each side's rank out of ${R.teams.length}.</p>
<table class="duel duel-ranks"><thead><tr><th scope="col">${esc(p.home.shortName || p.home.name)}</th><th scope="col"><span class="visually-hidden">Stat</span></th><th scope="col">${esc(p.away.shortName || p.away.name)}</th></tr></thead><tbody>
${ms.map((m) => { const better = (a, b) => (a == null || b == null ? false : m.dir > 0 ? a > b : a < b); return `<tr><td class="d-h${better(th.v[m.key], ta.v[m.key]) ? ' better' : ''}"><span class="d-v">${esc(fmtMetric(th.v[m.key], m.unit))}</span> <span class="d-rank">${esc(ordinal(th.rank[m.key]))}</span></td><th scope="row">${esc(m.label)}</th><td class="d-a${better(ta.v[m.key], th.v[m.key]) ? ' better' : ''}"><span class="d-rank">${esc(ordinal(ta.rank[m.key]))}</span> <span class="d-v">${esc(fmtMetric(ta.v[m.key], m.unit))}</span></td></tr>`; }).join('')}
</tbody></table></section>`;
}

function h2hList(p) {
  if (!p.h2h?.length) return '';
  const hn = p.home.shortName || p.home.name, an = p.away.shortName || p.away.name;
  return `<section class="block" aria-labelledby="h2h-h"><h2 class="h2" id="h2h-h">Recent meetings</h2>
<ul class="results">${p.h2h.map((g) => `<li class="result">${badge(g.r, g.r === 'W' ? `${hn} won` : g.r === 'L' ? `${an} won` : 'Draw')}<span class="rs-teams"><span class="rs-team">${esc(hn)}</span><span class="rs-score">${esc(g.gs[0])}–${esc(g.gs[1])}</span><span class="rs-team">${esc(an)}</span></span><span class="rs-meta">${esc(compName(g.comp))} · <time datetime="${esc(g.date)}">${esc(fmtDate(g.date))}</time></span></li>`).join('')}</ul>
<p class="fine">Results shown from ${esc(hn)}'s point of view, whoever was at home.</p></section>`;
}

function tableSnippet(ctx, p) {
  const t = ctx.stats.tables?.[p.tableKey];
  const rh = p.tableRows?.home, ra = p.tableRows?.away;
  if (!t || !rh || !ra) return '';
  const rows = t.rows.filter((r) => r.pos === rh.pos || r.pos === ra.pos);
  if (rows.length < 2) return '';
  return `<section class="block" aria-labelledby="tbl-h"><h2 class="h2" id="tbl-h">In the ${esc(t.name)} table</h2>
${leagueTable({ ...ctx, stats: { ...ctx.stats, tables: { [p.tableKey]: { ...t, rows } } } }, p.tableKey, { highlight: rows, size: t.rows.length })}
<p class="fine"><a href="/stats/#${p.tableKey}-h">Full table →</a></p></section>`;
}

export function previewPage(ctx, p) {
  const { config } = ctx;
  const hn = p.home.shortName || p.home.name, an = p.away.shortName || p.away.name;
  const title = `${hn} v ${an}`;
  const path = `/stats/${p.slug}/`;
  const desc = `${title} preview (${compName(p.comp)}, ${fmtDay(p.date)}): form, team news, head to head, stats and talking points.`;
  const content = `
<div class="wrap page-head">
<p class="crumbs"><a href="/">Home</a> / <a href="/stats/">Stats</a> / Preview</p>
<p class="kicker">${esc(compName(p.comp))} preview</p>
<h1 class="page-title match-title"><span class="mt-team">${crest(p.home.logo, 56)}<span>${esc(hn)}</span></span><span class="mt-v">v</span><span class="mt-team">${crest(p.away.logo, 56)}<span>${esc(an)}</span></span></h1>
<p class="match-meta"><time datetime="${esc(p.tbc ? String(p.date).slice(0, 10) : p.date)}">${esc(p.tbc ? `${fmtDay(p.date)}, kick-off time to be confirmed` : `${fmtDay(p.date)}, ${fmtTime(p.date)} UK time`)}</time>${p.venue ? ` · ${esc(p.venue)}` : ''}</p>
</div>
<div class="wrap preview">
${ctx.stats?.fans?.lineup?.matchId === p.id ? `<p class="fz-band fz-inline"><span class="kicker">Fan zone</span><a href="/fans/lineup/">Pick your XI for this match →</a></p>` : ''}
${p.points?.length ? `<section class="block first" aria-labelledby="tp-h"><h2 class="h2" id="tp-h">Talking points</h2><ul class="points">${p.points.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
${p.error ? '<p class="stats-empty">Some of the numbers for this match could not be fetched; they will appear after the next update.</p>' : ''}
<section class="block" aria-labelledby="form-h"><h2 class="h2" id="form-h">Form</h2><p class="fine">Last five matches, most recent first, all competitions.</p>
<div class="two"><div><h3 class="h3">${esc(hn)}</h3>${formRow(p.form?.home)}</div><div><h3 class="h3">${esc(an)}</h3>${formRow(p.form?.away)}</div></div></section>
<section class="block" aria-labelledby="news-h"><h2 class="h2" id="news-h">Team news</h2>
<div class="two"><div><h3 class="h3">${esc(hn)}</h3>${newsList(p.out?.home)}</div><div><h3 class="h3">${esc(an)}</h3>${newsList(p.out?.away)}</div></div>
<p class="fine">${newsCredit(p)}</p></section>
${seasonCompare(p)}
${leagueCompare(ctx, p)}
${tableSnippet(ctx, p)}
${h2hList(p)}
<section class="block discussion" id="comments" aria-labelledby="disc-h"><h2 class="h2" id="disc-h">Match thread</h2>
${commentsBlock(ctx.comments, { pageId: `match-${p.id}`, url: config.siteUrl + path, title: `${title}: match thread` })}</section>
<p class="sources-note"><a href="/stats/">← All stats and fixtures</a></p>
</div>`;
  const ld = {
    '@context': 'https://schema.org', '@type': 'SportsEvent', name: title, startDate: p.tbc ? String(p.date).slice(0, 10) : p.date, url: config.siteUrl + path, sport: 'Football',
    eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    homeTeam: { '@type': 'SportsTeam', name: p.home.name }, awayTeam: { '@type': 'SportsTeam', name: p.away.name },
    competitor: [{ '@type': 'SportsTeam', name: p.home.name }, { '@type': 'SportsTeam', name: p.away.name }],
    ...(p.venue ? { location: { '@type': 'Place', name: p.venue, address: p.venue } } : {}),
  };
  return layout(ctx, { path, active: '/stats/', title: `${title} preview`, description: desc, stats: true, jsonLd: [ld] }, content);
}
