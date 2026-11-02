// The live match centre (/live/): checks /api/live every 30 seconds during a match and
// redraws the scoreboard, the action, the stats and the line-ups. Netlify's CDN shares one
// answer between everyone, so this stays cheap however many people are watching.
import { formationSlots, pitchPos, PITCH_LINES } from './fans-core.js';
import { face, esc } from './fans-ui.js';
import { feedHtml, withHalfTimeScore, pollSeconds, clockLabel, clockWords, describe } from './live-core.js';

const app = document.getElementById('live-app');
if (app) {
  const $ = (id) => document.getElementById(id);
  const TEAM = app.dataset.team || '364';
  const baseTitle = document.title;
  let data = null, seen = null, timer = null, lastFetch = 0, side = null, showAll = false, failures = 0;

  // ---- faces: Liverpool's squad photos from the fan zone ----------------------------------
  const fold = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();
  let photos = new Map();
  fetch('/data/fans.json').then((r) => (r.ok ? r.json() : null)).then((j) => {
    const squad = j?.lineup?.squad || [];
    photos = new Map(squad.filter((p) => p.photo).map((p) => [fold(p.name), p]));
    if (data) render(data);
  }).catch(() => {});
  const squadOf = (name) => {
    const f = fold(name);
    if (photos.has(f)) return photos.get(f);
    const w = f.split(' '), last = w[w.length - 1];
    for (const [k, p] of photos) { const kw = k.split(' '); if (kw[kw.length - 1] === last && kw[0][0] === w[0][0]) return p; }
    return null;
  };
  const PARTICLES = new Set(['van', 'de', 'da', 'di', 'dos', 'del', 'der', 'mac', 'mc', 'le', 'la', 'ten', 'ter', 'von']);
  const shortName = (name) => {
    const w = String(name || '').trim().split(/\s+/);
    if (w.length > 2 && PARTICLES.has(w[w.length - 2].toLowerCase())) return w.slice(-2).join(' ');
    return w[w.length - 1] || '';
  };

  // ---- times ---------------------------------------------------------------------------------
  const ukTime = (iso) => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }).format(new Date(iso));
  const ukDay = (iso) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' }).format(new Date(iso));
  const until = (iso) => {
    const ms = Date.parse(iso) - Date.now();
    if (!(ms > 0)) return '';
    const m = Math.round(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
    return d >= 2 ? `in ${d} days` : h >= 1 ? `in ${h} h ${m % 60} min` : `in ${m} min`;
  };

  // ---- the scoreboard ----------------------------------------------------------------------
  const crest = (t) => (t?.logo && /^https:\/\//.test(t.logo) ? `<img class="lv-crest" src="${esc(t.logo)}" alt="" width="56" height="56" loading="lazy" onerror="this.style.visibility='hidden'">` : '<span class="lv-crest"></span>');
  const scorers = (m, s) => {
    const goals = (m.events || []).filter((e) => ['goal', 'pen-goal', 'own-goal'].includes(e.kind) && (e.for || e.team) === s);
    return goals.length ? `<ul class="lv-scorers">${goals.map((e) => `<li>${esc(shortName(e.player))} ${esc(e.min)}${e.kind === 'pen-goal' ? ' (pen)' : e.kind === 'own-goal' ? ' (og)' : ''}</li>`).join('')}</ul>` : '';
  };
  const reds = (m, s) => (m.events || []).filter((e) => (e.kind === 'red' || e.kind === 'second-yellow') && e.team === s).length;
  function board(m) {
    if (m.state === 'none') {
      const n = m.next;
      return `<div class="lv-board lv-quiet">
<p class="lv-meta">No Liverpool match on right now</p>
${n ? `<p class="lv-next">Next: <strong>${esc(n.home.short)} v ${esc(n.away.short)}</strong>, ${esc(n.comp || '')}${n.tbc ? `, ${esc(ukDay(n.date))} (kick-off time to be confirmed)` : `, ${esc(ukDay(n.date))} at ${esc(ukTime(n.date))}`}</p>
${n.tbc ? '' : `<p class="lv-count">Live coverage starts 75 minutes before kick-off, ${esc(until(new Date(Date.parse(n.date) - 75 * 60000).toISOString()) || 'soon')}.</p>`}` : ''}
${m.last && m.last.hs != null ? `<p class="lv-last">Last time out: ${esc(m.last.home.short)} ${m.last.hs}–${m.last.as} ${esc(m.last.away.short)}</p>` : ''}
</div>`;
    }
    const live = m.state === 'in';
    const clock = clockLabel(m);
    const mid = m.postponed && m.home.score == null
      ? `<div class="lv-score lv-pre"><span class="lv-clock">${esc(m.detail || 'Postponed')}</span></div>`
      : m.state === 'pre'
      ? `<div class="lv-score lv-pre"><span class="lv-ko">${esc(ukTime(m.kickoff))}</span><span class="lv-clock">Kick-off ${esc(until(m.kickoff) || 'soon')}</span></div>`
      : `<div class="lv-score"><span class="lv-num" id="lv-h">${m.home.score ?? 0}</span><span class="lv-dash">–</span><span class="lv-num" id="lv-a">${m.away.score ?? 0}</span><span class="lv-clock${live ? ' is-live' : ''}">${live && !/HT/.test(clock) ? '<span class="lv-dot" aria-hidden="true"></span>' : ''}${esc(clockWords(m))}</span>${m.pens ? `<span class="lv-pens">${m.pens[0]}–${m.pens[1]} on penalties</span>` : ''}</div>`;
    const team = (t, s) => `<div class="lv-team lv-${s}">${crest(t)}<span class="lv-name">${esc(t.short || t.name)}${reds(m, s) ? `<span class="lv-card lv-card-r" title="${reds(m, s)} sent off" aria-label="${reds(m, s)} sent off"></span>` : ''}</span>${scorers(m, s)}</div>`;
    return `<div class="lv-board${live ? ' is-live' : ''}">
<p class="lv-meta">${esc([m.comp, m.venue].filter(Boolean).join(' · '))}</p>
<div class="lv-row">${team(m.home, 'home')}${mid}${team(m.away, 'away')}</div>
${m.state === 'post' && !m.postponed ? '<p class="lv-after"><a href="/fans/">Rate the players in the Fan zone →</a></p>' : ''}
</div>`;
  }

  // ---- stats -------------------------------------------------------------------------------
  function statsHtml(m) {
    if (!m.stats?.length) return `<p class="fine">${m.state === 'pre' ? 'Stats appear once the match starts.' : 'No stats yet.'}</p>`;
    return `<table class="duel lv-stats"><thead><tr><th scope="col">${esc(m.home.short)}</th><th scope="col"><span class="visually-hidden">Stat</span></th><th scope="col">${esc(m.away.short)}</th></tr></thead><tbody>${m.stats.map((r) => {
      const t = (+r.home || 0) + (+r.away || 0) || 1;
      const pct = r.unit === '%' && r.key === 'possessionPct';
      const hw = pct ? r.home : (r.home / t) * 100, aw = pct ? r.away : (r.away / t) * 100;
      return `<tr><td class="d-h"><span class="d-v">${esc(r.home)}${esc(r.unit)}</span><span class="d-bar"><span style="width:${Math.round(hw)}%"></span></span></td><th scope="row">${esc(r.label)}</th><td class="d-a"><span class="d-bar"><span style="width:${Math.round(aw)}%"></span></span><span class="d-v">${esc(r.away)}${esc(r.unit)}</span></td></tr>`;
    }).join('')}</tbody></table>`;
  }

  // ---- line-ups on the pitch -------------------------------------------------------------------
  function marks(p) {
    const b = [];
    for (let i = 0; i < (p.goals || []).length; i++) b.push('<span class="lv-m-goal" title="Goal">⚽</span>');
    if (p.red) b.push('<span class="lv-card lv-card-r" title="Sent off"></span>');
    else if (p.yellow) b.push('<span class="lv-card lv-card-y" title="Booked"></span>');
    if (p.off) b.push(`<span class="lv-m-off" title="Substituted">↓${esc(p.off.replace(/'$/, ''))}</span>`);
    return b.length ? `<span class="lv-marks" aria-hidden="true">${b.join('')}</span>` : '';
  }
  const said = (p) => [p.goals?.length ? `${p.goals.length} goal${p.goals.length > 1 ? 's' : ''}` : '', p.red ? 'sent off' : p.yellow ? 'booked' : '', p.off ? `substituted ${p.off}` : '', p.on ? `came on ${p.on}` : ''].filter(Boolean).join(', ');
  function lineupHtml(m, s) {
    const lu = m.lineups?.[s];
    if (!lu) return `<p class="fine">${m.state === 'pre' ? 'Line-ups usually come out an hour before kick-off.' : 'Line-ups not available.'}</p>`;
    const team = s === (m.home.id === TEAM ? 'home' : 'away') ? 'us' : 'opp';
    const person = (p) => { const sq = team === 'us' ? squadOf(p.name) : null; return { name: p.name, photo: sq?.photo || '', short: sq?.short || shortName(p.name) }; };
    let pitch = '';
    if (lu.formation && lu.xi.length === 11) {
      const slots = formationSlots(lu.formation);
      pitch = `<div class="pitch pitch-mini lv-pitch" role="img" aria-label="${esc((s === 'home' ? m.home : m.away).short)} line-up, ${esc(lu.formation)}">${PITCH_LINES}<ol class="spots">${lu.xi.map((p, i) => {
        const q = person(p);
        return `<li class="spot spot-ro${p.off ? ' lv-was' : ''}" style="${pitchPos(slots[i])}">${face(q, { size: 'sm', team })}${p.num ? `<span class="spot-num" aria-hidden="true">${esc(p.num)}</span>` : ''}<span class="spot-name">${esc(q.short)}</span>${marks(p)}</li>`;
      }).join('')}</ol></div>`;
    }
    const list = (arr) => arr.map((p) => `<li>${face(person(p), { size: 'xs', team })}<span class="lv-pn">${p.num ? `<b>${esc(p.num)}</b> ` : ''}${esc(p.name)}</span><span class="lv-pd">${esc(said(p))}</span></li>`).join('');
    return `<p class="lv-form">${esc(lu.formation || '')}</p>${pitch}${pitch ? '' : `<h3 class="h3">Starting XI</h3><ul class="lv-list">${list(lu.xi)}</ul>`}
<p class="visually-hidden">Starting eleven: ${esc(lu.xi.map((p) => `${p.name}${said(p) ? ` (${said(p)})` : ''}`).join('; '))}.</p>
${lu.subs?.length ? `<h3 class="h3">Substitutes</h3><ul class="lv-list">${list(lu.subs)}</ul>` : ''}`;
  }

  // ---- drawing it all ------------------------------------------------------------------------------
  const live = $('lv-live');
  function render(m) {
    withHalfTimeScore(m);
    const ours = m.home?.id === TEAM ? 'home' : 'away';
    const fresh = new Set();
    if (seen) for (const e of m.events || []) if (!seen.has(e.id)) fresh.add(e.id);
    // tell screen readers about goals, cards and full time as they happen
    if (fresh.size && live) live.textContent = (m.events || []).filter((e) => fresh.has(e.id)).map((e) => { const d = describe(e, m); return `${e.min} ${d.title} ${d.text}`; }).join('. ');
    seen = new Set((m.events || []).map((e) => e.id));

    $('lv-board').innerHTML = board(m);
    const has = m.state !== 'none';
    for (const id of ['lv-action', 'lv-stats-sec', 'lv-lineups']) $(id).hidden = !has;
    if (has) {
      const evs = (m.events || []).length;
      const shown = showAll || evs <= 10 ? m : { ...m, events: m.events.slice(-10) };
      $('lv-feed').innerHTML = feedHtml(shown, { ours, fresh });
      $('lv-more').hidden = showAll || evs <= 10;
      $('lv-more').textContent = `Show all ${evs} moments`;
      $('lv-stats').innerHTML = statsHtml(m);
      side ||= ours;
      $('lv-tabs').innerHTML = ['home', 'away'].map((s) => `<button type="button" class="chip" data-side="${s}" aria-pressed="${s === side}">${esc((s === 'home' ? m.home : m.away).short)}</button>`).join('');
      $('lv-xi').innerHTML = lineupHtml(m, side);
      // a goal for Liverpool: a moment of celebration
      const ourGoal = (m.events || []).find((e) => fresh.has(e.id) && ['goal', 'pen-goal', 'own-goal'].includes(e.kind) && (e.for || e.team) === ours);
      if (ourGoal) { const b = $('lv-board').firstElementChild; b?.classList.add('is-goal'); setTimeout(() => b?.classList.remove('is-goal'), 6000); }
    }
    const score = m.postponed ? `${m.home.short} v ${m.away.short} (${m.detail || 'postponed'}) | ` : m.state === 'in' || m.state === 'post' ? `${m.home.short} ${m.home.score ?? 0}–${m.away.score ?? 0} ${m.away.short} (${clockLabel(m)}) | ` : '';
    document.title = score ? `${score}Kop On! live` : baseTitle;
    $('lv-updated').textContent = m.updated ? `Updated ${new Date(m.updated).toLocaleTimeString('en-GB')}${m.state === 'in' ? ' · refreshes every 30 seconds' : ''}` : '';
  }

  let busy = false;
  async function load() {
    clearTimeout(timer);
    if (busy) return; // one check at a time (e.g. switching tabs while a check is under way)
    busy = true;
    lastFetch = Date.now();
    let next = 60;
    try {
      const r = await fetch('/api/live', { headers: { Accept: 'application/json' } });
      if (!r.ok) throw new Error(String(r.status));
      const m = await r.json();
      if (m.state === 'error') throw new Error(m.message || 'paused');
      failures = 0;
      $('lv-note').hidden = true;
      data = m;
      render(m);
      next = pollSeconds(m.state);
      // no match on: look again around the next match's coverage start
      if (m.state === 'none' && m.next?.date && !m.next.tbc) {
        const wait = (Date.parse(m.next.date) - 75 * 60000 - Date.now()) / 1000;
        next = Math.max(60, Math.min(next, wait > 0 ? wait : 60));
      }
    } catch {
      failures++;
      $('lv-note').hidden = false;
      $('lv-note').textContent = data ? 'Live updates are paused for a moment; trying again…' : "Couldn't load the live match just now; trying again…";
      next = Math.min(120, 20 * failures);
    }
    busy = false;
    clearTimeout(timer);
    if (!document.hidden) timer = setTimeout(load, next * 1000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(timer);
    else if (Date.now() - lastFetch > 15000) load();
    else { clearTimeout(timer); timer = setTimeout(load, 15000); }
  });
  $('lv-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-side]'); if (!b || !data) return; side = b.dataset.side; render(data); $('lv-tabs').querySelector(`[data-side="${side}"]`)?.focus(); });
  $('lv-more').addEventListener('click', () => { showAll = true; if (data) render(data); });
  load();
}
