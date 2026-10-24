// The fan zone: /fans/ (hub), /fans/lineup/ (pick your XI for the next match)
// and /fans/ratings/<match>/ (rate the players). Everything from an API is escaped.
import { esc, jsonForScript } from '../lib/text.mjs';
import { layout } from './templates.mjs';
import { compName } from './stats-templates.mjs';
import { face, chip, matchLine } from './assets/fans-ui.js';
import { formationSlots, FORMATION_NAMES } from './assets/fans-core.js';

const UK = (opts) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', ...opts });
const safe = (opts) => (d) => { const t = new Date(d); return d && Number.isFinite(t.getTime()) ? UK(opts).format(t) : ''; };
const fmtDay = safe({ weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = safe({ hour: '2-digit', minute: '2-digit' });
const fmtLong = safe({ weekday: 'long', day: 'numeric', month: 'long' });

export const fansOf = (ctx) => ctx.stats?.fans || null;
export const ratePath = (m) => `/fans/ratings/${m.slug}/`;
const scoreLine = (m, team) => (m.home ? `${team} ${m.gf}–${m.ga} ${m.opp.shortName}` : `${m.opp.shortName} ${m.ga}–${m.gf} ${team}`);
const crest = (url, size = 28) => (url ? `<img class="crest" src="${esc(url)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">` : '');
const vs = (L) => `${L.isHome ? 'v' : 'at'} ${L.opp.shortName}`;

// ---- the opposition's predicted XI (static; the flip-out tab shows it) ------------------
function oppDrawer(L) {
  const P = L.oppXI;
  if (!P) return '';
  const slots = formationSlots(P.formation);
  const name = L.opp.shortName;
  const spots = P.xi.map((p, i) => {
    const s = slots[i] || { x: 0.5, y: 0.5 };
    return `<li class="spot spot-ro${p.predicted ? ' is-predicted' : ''}${p.doubt ? ' is-doubt' : ''}" style="left:${(s.x * 100).toFixed(1)}%;top:${(s.y * 100).toFixed(1)}%">${face(p, { size: 'sm', team: 'opp' })}${p.num ? `<span class="spot-num" aria-hidden="true">${esc(p.num)}</span>` : ''}<span class="spot-name">${esc(p.short || p.name.split(' ').pop())}</span><span class="visually-hidden">${esc(p.name)}${p.predicted ? ' (predicted replacement)' : ''}${p.doubt ? ' (doubtful, no like-for-like replacement)' : ''}</span></li>`;
  }).join('');
  return `<button type="button" class="opp-tab" id="opp-tab" aria-expanded="false" aria-controls="opp-drawer">${crest(L.opp.logo, 22)}<span>${esc(name)} predicted XI</span></button>
<aside class="opp-drawer" id="opp-drawer" aria-labelledby="opp-h" hidden>
<div class="opp-head"><h2 id="opp-h" tabindex="-1">${esc(name)}: predicted XI</h2><button type="button" class="ctrl opp-close" aria-label="Close ${esc(name)}’s predicted XI"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg></button></div>
<p class="fine">${esc(P.formation)} · based on their line-up v ${esc(P.basedOn.opp)}${P.basedOn.date ? `, ${esc(fmtDay(P.basedOn.date))}` : ''}, with anyone injured or suspended swapped for a bench player.</p>
<div class="pitch pitch-mini" aria-label="${esc(name)} predicted line-up"><div class="pitch-lines" aria-hidden="true"><span class="pl-half"></span><span class="pl-circle"></span><span class="pl-box"></span><span class="pl-six"></span></div><ol class="spots">${spots}</ol></div>
${P.changes.length ? `<h3 class="h3">Changes from last time</h3><ul class="opp-list">${P.changes.map((c) => `<li><b>${esc(c.in)}</b> for ${esc(c.out)} <span class="muted">(${esc(c.why.toLowerCase())}${c.detail ? `: ${esc(c.detail)}` : ''})</span></li>`).join('')}</ul>` : ''}
${P.out.length ? `<h3 class="h3">Missing or doubtful</h3><ul class="opp-list">${P.out.map((o) => `<li>${esc(o.name)} <span class="muted">${esc(o.why)}${o.detail ? `, ${esc(o.detail)}` : ''}</span></li>`).join('')}</ul>` : '<p class="fine">No injuries or suspensions reported.</p>'}
<p class="fine">A best guess from their last team sheet. Real line-ups come out an hour before kick-off.</p>
</aside>`;
}

// ---- /fans/lineup/ -----------------------------------------------------------------------
export function lineupPage(ctx) {
  const F = fansOf(ctx), L = F?.lineup;
  if (!L) {
    return layout(ctx, { path: '/fans/lineup/', active: '/fans/', title: 'Pick your XI', description: 'Pick your Liverpool starting XI for the next match.' },
      `<div class="wrap page-head"><p class="crumbs"><a href="/">Home</a> / <a href="/fans/">Fan zone</a></p><h1 class="page-title">Pick your XI</h1><p class="lede">The next match isn't listed yet. Check back soon.</p></div>`);
  }
  const team = L.team.name;
  const data = {
    matchId: L.matchId, kickoff: L.kickoff, closes: L.closes || L.kickoff, tbc: !!L.tbc, opp: L.opp.shortName, isHome: L.isHome,
    formations: FORMATION_NAMES, lastXI: L.lastXI,
    squad: F.squad.map((p) => ({ id: p.id, name: p.name, short: p.short, num: p.num, line: p.line, letter: p.letter, flag: p.flag, nation: p.nation, photo: p.photo, out: p.out || null })),
  };
  const content = `
<div class="wrap page-head">
<p class="crumbs"><a href="/">Home</a> / <a href="/fans/">Fan zone</a></p>
<p class="kicker">${esc(compName(L.comp))} · ${esc(L.tbc ? `${fmtDay(L.kickoff)}, time TBC` : `${fmtLong(L.kickoff)}, ${fmtTime(L.kickoff)}`)}</p>
<h1 class="page-title">Pick your XI ${esc(vs(L))}</h1>
<p class="lede">Tap a position to choose a player. Save your team, then see how it compares with every other fan's. ${L.tbc ? `The kick-off time isn't fixed yet, so picks close at ${esc(fmtTime(L.closes))} on matchday.` : 'Picks close at kick-off.'}</p>
</div>
<div class="wrap xi-wrap" data-lineup>
<noscript><p class="stats-empty">The line-up picker needs JavaScript switched on.</p></noscript>
<div class="xi-pitch-col">
<div class="pitch" id="xi-pitch" aria-label="Your ${esc(team)} line-up"><div class="pitch-lines" aria-hidden="true"><span class="pl-half"></span><span class="pl-circle"></span><span class="pl-box"></span><span class="pl-six"></span><span class="pl-box pl-top"></span><span class="pl-six pl-top"></span></div><ol class="spots" id="xi-spots"></ol></div>
</div>
<div class="xi-side">
<fieldset class="formations"><legend>Formation</legend><div class="chips" id="xi-formations"></div></fieldset>
<p class="xi-count" id="xi-count" aria-live="polite"></p>
<div class="xi-actions">
<button type="button" class="btn btn-primary" id="xi-save" disabled>Save my XI</button>
${L.lastXI ? `<button type="button" class="btn" id="xi-last">Start from the XI ${L.lastXI.vs ? `v ${esc(L.lastXI.vs)}` : 'last time'}</button>` : ''}
<button type="button" class="btn" id="xi-clear">Clear</button>
</div>
<p class="xi-status" id="xi-status" role="status"></p>
<section class="fans-xi" id="fans-xi" aria-labelledby="fx-h" hidden></section>
<p class="fine">Player photos are looked up automatically (FotMob, TheSportsDB and <a href="https://commons.wikimedia.org/">Wikimedia Commons</a>, where photos are shared under free licences by their authors) and may occasionally be out of date. Picks are anonymous; your browser remembers yours so you can change it until kick-off.</p>
</div>
</div>
${oppDrawer(L)}
<dialog class="picker" id="xi-picker" aria-labelledby="pk-h">
<form method="dialog" class="pk-inner">
<div class="pk-head"><h2 id="pk-h">Choose a player</h2><button type="submit" class="ctrl" value="cancel" aria-label="Close"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z"/></svg></button></div>
<label class="visually-hidden" for="pk-search">Search the squad</label><input type="search" id="pk-search" class="pk-search" placeholder="Search the squad…" autocomplete="off">
<div class="chips pk-lines" id="pk-lines" role="group" aria-label="Show"></div>
<ul class="pk-list" id="pk-list"></ul>
<div class="pk-foot" id="pk-foot"></div>
</form>
</dialog>
<script type="application/json" id="lineup-data">${jsonForScript(data)}</script>`;
  return layout(ctx, { path: '/fans/lineup/', active: '/fans/', title: `Pick your XI ${vs(L)}`, description: `Pick your ${team} starting XI ${vs(L)}, see the fans' combined XI and ${L.opp.shortName}'s predicted line-up.`, fans: 'lineup' }, content);
}

// ---- /fans/ratings/<match>/ ------------------------------------------------------------------
export function ratingsPage(ctx, m) {
  const team = ctx.stats.team?.name || 'Liverpool';
  const title = scoreLine(m, team);
  const data = {
    matchId: m.matchId, closes: m.closes, title,
    names: Object.fromEntries((fansOf(ctx)?.squad || []).map((p) => [p.id, p.name])),
    players: m.players.map((p) => ({ id: p.id, name: p.name, short: p.short, num: p.num, letter: p.letter, starter: p.starter, mins: p.mins, g: p.g, a: p.a, y: p.y, r: p.r, stat: p.stat, photo: p.photo })),
  };
  const rows = m.players.map((p) => `<li class="rr" data-id="${esc(p.id)}">${face(p, { size: 'md' })}<span class="rr-num">${esc(p.num)}</span><span class="rr-name"><b>${esc(p.name)}</b><small>${esc(matchLine(p))}</small></span>${chip(p.stat, { label: `Stats rating ${p.stat ?? 'none'}` })}</li>`).join('');
  const content = `
<div class="wrap page-head">
<p class="crumbs"><a href="/">Home</a> / <a href="/fans/">Fan zone</a> / Ratings</p>
<p class="kicker">${esc(compName(m.comp))} · ${esc(fmtLong(m.date))}</p>
<h1 class="page-title match-title"><span class="res res-${m.r.toLowerCase()}" aria-hidden="true">${m.r}</span> ${esc(title)}</h1>
<p class="lede">Give every player a mark out of 10 and pick your player of the match. Then see what the other fans think, and how Kop On rated them.</p>
</div>
<div class="wrap rate-wrap" data-ratings>
<noscript><p class="stats-empty">Rating players needs JavaScript switched on. Here are the automatic ratings worked out from the match stats.</p><ol class="rr-list">${rows}</ol></noscript>
<div id="rate-app"></div>
<section class="block xi-vs" id="xi-vs" hidden></section>
<section class="block manager" id="manager" aria-labelledby="mgr-h">
<details><summary><span id="mgr-h">Kop On's official ratings</span> <span class="muted">(site manager)</span></summary><div id="mgr-body"></div></details>
</section>
<p class="fine">Player photos come from FotMob, TheSportsDB and <a href="https://commons.wikimedia.org/">Wikimedia Commons</a> (shared under free licences by their authors).</p>
<p class="sources-note"><a href="/fans/">← Fan zone</a></p>
</div>
<script type="application/json" id="ratings-data">${jsonForScript(data)}</script>`;
  return layout(ctx, { path: ratePath(m), active: '/fans/', title: `Player ratings: ${title}`, description: `Rate the Liverpool players: ${title} (${compName(m.comp)}). Fans' average ratings, player of the match and Kop On's ratings.`, fans: 'ratings' }, content);
}

// ---- /fans/ -----------------------------------------------------------------------------------
export function fansHub(ctx) {
  const F = fansOf(ctx), L = F?.lineup;
  const team = ctx.stats?.team?.name || 'Liverpool';
  const lineupCard = L ? `<a class="fz-card fz-xi" href="/fans/lineup/"><span class="kicker">Next match · ${esc(fmtDay(L.kickoff))}</span><span class="fz-title">Pick your XI ${esc(vs(L))}</span><span class="fz-faces" aria-hidden="true">${(L.lastXI?.xi || []).map((id) => F.squad.find((p) => p.id === id)).filter(Boolean).slice(0, 6).map((p) => face(p, { size: 'sm' })).join('')}</span><span class="fz-sub">Choose your starting eleven, see the fans' XI, and peek at ${esc(L.opp.shortName)}'s predicted line-up.</span><span class="go">Pick your team →</span></a>` : '<div class="fz-card"><span class="fz-title">Pick your XI</span><span class="fz-sub">The next match will appear here soon.</span></div>';
  const rate = (F?.rate || []).map((m) => `<li><a href="${ratePath(m)}"><span class="res res-${m.r.toLowerCase()}" aria-hidden="true">${m.r}</span><span class="fz-m"><b>${esc(scoreLine(m, team))}</b><small>${esc(compName(m.comp))} · ${esc(fmtDay(m.date))}</small></span><span class="fz-open">${Date.parse(m.closes) > ctx.builtAt.getTime() ? 'Rate players →' : 'See ratings →'}</span></a></li>`).join('');
  const content = `
<div class="wrap page-head">
<p class="crumbs"><a href="/">Home</a> / Fan zone</p>
<h1 class="page-title">Fan zone</h1>
<p class="lede">Pick your XI before every match and rate the players after it. Every fan's picks are added up so you can see what the Kop thinks.</p>
</div>
<div class="wrap fz">
${lineupCard}
<section class="fz-card fz-rate" aria-labelledby="fz-rate-h"><span class="kicker">After the match</span><h2 class="fz-title" id="fz-rate-h">Player ratings</h2>
${rate ? `<ul class="fz-matches">${rate}</ul>` : '<p class="fz-sub">Ratings open after the next match.</p>'}</section>
</div>`;
  return layout(ctx, { path: '/fans/', active: '/fans/', title: 'Fan zone', description: 'Pick your Liverpool XI for the next match and rate the players after every game.' }, content);
}

// a small strip on the home page
export function fansBand(ctx) {
  const F = fansOf(ctx);
  if (!F || (!F.lineup && !F.rate?.length)) return '';
  const team = ctx.stats?.team?.name || 'Liverpool';
  const m = F.rate?.[0];
  return `<div class="wrap"><section class="fz-band" aria-label="Fan zone"><span class="kicker">Fan zone</span>${F.lineup ? `<a href="/fans/lineup/">Pick your XI ${esc(vs(F.lineup))} →</a>` : ''}${m ? `<a href="${ratePath(m)}">${Date.parse(m.closes) > ctx.builtAt.getTime() ? 'Rate the players' : 'Player ratings'}: ${esc(scoreLine(m, team))} →</a>` : ''}</section></div>`;
}

// what the voting function needs to know (published as /data/fans.json)
export function fansJson(ctx) {
  const F = fansOf(ctx);
  return JSON.stringify({
    updated: F?.updated || null,
    lineup: F?.lineup ? { matchId: F.lineup.matchId, closes: F.lineup.closes || F.lineup.kickoff, squad: F.squad.map((p) => p.id) } : null,
    rate: (F?.rate || []).map((m) => ({ matchId: m.matchId, kickoff: m.date, closes: m.closes, players: m.players.map((p) => p.id) })),
  });
}
