// football-data.org (official tables, top scorers) and API-Football (player
// stats, injuries). Keys come from Netlify environment variables only.

// ---- football-data.org (free plan: Premier League and Champions League) ---------
export async function fdGet(fetchImpl, key, path) {
  const r = await fetchImpl(`https://api.football-data.org/v4/${path}`, { headers: { 'X-Auth-Token': key }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`football-data.org said ${r.status}${r.status === 403 ? ' (not in the free plan)' : r.status === 400 || r.status === 401 ? ' (check FOOTBALL_DATA_KEY)' : r.status === 429 ? ' (too many requests)' : ''}`);
  return r.json();
}

export function fdTable(j) {
  const st = (j.standings || []).find((s) => s.type === 'TOTAL') || (j.standings || [])[0];
  const rows = (st?.table || []).map((t) => ({
    pos: t.position, id: String(t.team?.id ?? ''), name: t.team?.shortName || t.team?.name || '?', full: t.team?.name || '', short: t.team?.tla || '',
    logo: t.team?.crest || '', P: t.playedGames ?? 0, W: t.won ?? 0, D: t.draw ?? 0, L: t.lost ?? 0, GF: t.goalsFor ?? 0, GA: t.goalsAgainst ?? 0,
    GD: t.goalDifference ?? 0, Pts: t.points ?? 0, form: String(t.form || '').replace(/,/g, '').slice(-5),
  }));
  if (!rows.length) throw new Error('football-data.org returned an empty table');
  return { name: j.competition?.name || '', matchday: j.season?.currentMatchday ?? null, rows };
}

export function fdScorers(j) {
  return (j.scorers || []).map((s) => ({
    name: s.player?.name || '?', team: s.team?.shortName || s.team?.name || '', teamId: String(s.team?.id ?? ''), logo: s.team?.crest || '',
    goals: s.goals ?? 0, assists: s.assists ?? 0, penalties: s.penalties ?? 0, played: s.playedMatches ?? 0,
  }));
}

// ---- API-Football (free plan: 100 requests a day) -----------------------------------
export function apiFootball(fetchImpl, key, cache, now = new Date(), log = () => {}, signal = null) {
  cache.af ||= {};
  // forget answers more than 3 days old (stops the remembered data growing)
  for (const [k, v] of Object.entries(cache.af)) if (!v || now.getTime() - v.t > 72 * 3600000) delete cache.af[k];
  let remaining = Infinity;
  let used = 0;
  async function get(path, params, ttlHours) {
    const qs = new URLSearchParams(params).toString();
    const ck = `${path}?${qs}`;
    const prev = cache.af[ck];
    const hit = prev && prev.data ? prev : null; // last good answer
    const fresh = (x) => x && now.getTime() - x.t < ttlHours * 3600000;
    if (hit && fresh(hit)) return hit.data;
    // a refusal (wrong key, season not in the plan) is remembered for the same time, so it isn't asked again every build
    if (prev?.err && fresh({ t: prev.errT })) throw new Error(prev.err);
    if (remaining < 8) {
      if (hit) return hit.data; // keep a few requests spare for tomorrow's matchday
      throw new Error('API-Football daily allowance nearly used up');
    }
    let r, j;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 15000);
      const stop = () => ctrl.abort();
      signal?.addEventListener?.('abort', stop, { once: true });
      if (signal?.aborted) throw new Error('stopped');
      try {
        r = await fetchImpl(`https://v3.football.api-sports.io/${ck}`, { headers: { 'x-apisports-key': key }, signal: ctrl.signal });
        used++;
        j = await r.json().catch(() => ({}));
      } finally { clearTimeout(t); signal?.removeEventListener?.('abort', stop); }
    } catch (err) {
      if (hit) return hit.data; // network trouble: the last good answer will do
      throw new Error(`API-Football unreachable (${err.message})`);
    }
    const left = parseInt(r.headers.get('x-ratelimit-requests-remaining'), 10);
    if (Number.isFinite(left)) remaining = left;
    const errs = j.errors && (Array.isArray(j.errors) ? j.errors : Object.values(j.errors));
    if (errs && errs.length) {
      const msg = `API-Football: ${String(errs[0]).replace(/\.$/, '')}`;
      const refused = !/rate|too many|limit/i.test(msg);
      if (refused) cache.af[ck] = { ...(hit || {}), t: hit ? hit.t : now.getTime(), err: msg, errT: now.getTime() };
      if (hit) return hit.data;
      throw new Error(msg);
    }
    if (!r.ok) { if (hit) return hit.data; throw new Error(`API-Football said ${r.status}`); }
    cache.af[ck] = { t: now.getTime(), data: j };
    return j;
  }
  return { get, usage: () => ({ used, remaining: Number.isFinite(remaining) ? remaining : null }) };
}

const n = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };

// Every player's season, all competitions added together
export function playerSeason(responses) {
  const players = new Map();
  for (const j of responses) {
    for (const row of j.response || []) {
      const p = row.player || {};
      let acc = players.get(p.id);
      if (!acc) {
        acc = { id: p.id, name: p.name || [p.firstname, p.lastname].filter(Boolean).join(' '), photo: p.photo || '', age: p.age || null, pos: '', apps: 0, starts: 0, mins: 0, goals: 0, assists: 0, shots: 0, shotsOn: 0, keyPasses: 0, passes: 0, dribbles: 0, dribblesTried: 0, tackles: 0, ints: 0, blocks: 0, duels: 0, duelsWon: 0, fouled: 0, fouls: 0, yellow: 0, red: 0, saves: 0, conceded: 0, ratingW: 0, ratingMins: 0 };
        players.set(p.id, acc);
      }
      for (const s of row.statistics || []) {
        if (/friendl/i.test(s.league?.name || '')) continue; // friendlies don't count
        const g = s.games || {};
        const mins = n(g.minutes);
        acc.pos ||= g.position || '';
        acc.apps += n(g.appearences ?? g.appearances); acc.starts += n(g.lineups); acc.mins += mins;
        acc.goals += n(s.goals?.total); acc.assists += n(s.goals?.assists); acc.saves += n(s.goals?.saves); acc.conceded += n(s.goals?.conceded);
        acc.shots += n(s.shots?.total); acc.shotsOn += n(s.shots?.on);
        acc.keyPasses += n(s.passes?.key); acc.passes += n(s.passes?.total);
        // (pass accuracy isn't used: API-Football's season figure isn't a reliable percentage)
        acc.dribbles += n(s.dribbles?.success); acc.dribblesTried += n(s.dribbles?.attempts);
        acc.tackles += n(s.tackles?.total); acc.ints += n(s.tackles?.interceptions); acc.blocks += n(s.tackles?.blocks);
        acc.duels += n(s.duels?.total); acc.duelsWon += n(s.duels?.won);
        acc.fouled += n(s.fouls?.drawn); acc.fouls += n(s.fouls?.committed);
        acc.yellow += n(s.cards?.yellow) + n(s.cards?.yellowred); acc.red += n(s.cards?.red);
        if (g.rating != null && mins) { acc.ratingW += n(g.rating) * mins; acc.ratingMins += mins; }
      }
    }
  }
  return [...players.values()].filter((p) => p.apps > 0 || p.mins > 0).map((p) => ({
    id: p.id, name: p.name, photo: p.photo, age: p.age, pos: p.pos,
    apps: p.apps, starts: p.starts, mins: p.mins, goals: p.goals, assists: p.assists, shots: p.shots, shotsOn: p.shotsOn,
    keyPasses: p.keyPasses, passes: p.passes, passPct: null,
    dribbles: p.dribbles, dribblesTried: p.dribblesTried, tackles: p.tackles, ints: p.ints, blocks: p.blocks,
    duelsWonPct: p.duels ? Math.round((p.duelsWon / p.duels) * 100) : null, fouled: p.fouled, fouls: p.fouls, yellow: p.yellow, red: p.red,
    saves: p.saves, conceded: p.conceded, rating: p.ratingMins ? Math.round((p.ratingW / p.ratingMins) * 100) / 100 : null,
  })).sort((a, b) => b.mins - a.mins);
}

export function afInjuries(j) {
  return (j.response || []).map((r) => ({
    name: r.player?.name || '', teamId: r.team?.id ?? null, team: r.team?.name || '',
    why: /questionable|doubt/i.test(r.player?.type || '') ? 'Doubtful' : /susp|red card|yellow card|ban/i.test(r.player?.reason || '') ? 'Suspended' : 'Out',
    detail: r.player?.reason || '',
  })).filter((x) => x.name);
}
