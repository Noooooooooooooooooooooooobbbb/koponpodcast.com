// Replays a real match (Liverpool 0–1 Arsenal, ESPN data trimmed to facts) through the pretend
// Liverpool v Arsenal fixture on 8 November, as ESPN would have shown it at any moment:
// line-ups an hour before, then the clock, events, score and stats as they happened.
import { readFileSync } from 'node:fs';
import { statsFetch, fixtureEvents } from './stats-fixtures.mjs';

export const FULL = JSON.parse(readFileSync(new URL('./live-match.json', import.meta.url), 'utf8'));
export const LIVE_EVENT = fixtureEvents().find((e) => e.date === '2026-11-08T17:30Z' && e.home === '364' && e.away === '359');
export const LIVE_KICKOFF = Date.parse(LIVE_EVENT.date);
const MIN = 60000;
const realKo = Date.parse(FULL.keyEvents.find((k) => k.type.type === 'kickoff').wallclock);
const at = (type) => Date.parse(FULL.keyEvents.find((k) => k.type.type === type).wallclock) - realKo;
const HT = at('halftime'), H2 = at('start-2nd-half'), END = at('end-regular-time');

/** ESPN's summary for the replayed match, `ms` milliseconds after kick-off (negative = before) */
export function snapshot(ms) {
  const sum = structuredClone(FULL);
  const comp = sum.header.competitions[0];
  comp.date = new Date(LIVE_KICKOFF).toISOString().replace(/:00\.000Z$/, 'Z');
  const happened = (k) => Date.parse(k.wallclock) - realKo <= ms;
  sum.keyEvents = ms < 0 ? [] : sum.keyEvents.filter(happened);
  // the clock
  let status;
  if (ms < 0) status = { type: { name: 'STATUS_SCHEDULED', state: 'pre', completed: false, description: 'Scheduled', detail: 'Sat, November 8th at 12:30 PM EST', shortDetail: '11/8 - 12:30 PM EST' } };
  else if (ms >= END) status = { type: { name: 'STATUS_FULL_TIME', state: 'post', completed: true, description: 'Full Time', detail: 'FT', shortDetail: 'FT' } };
  else if (ms >= HT && ms < H2) status = { displayClock: "45'", period: 1, type: { name: 'STATUS_HALFTIME', state: 'in', completed: false, description: 'Halftime', detail: 'Halftime', shortDetail: 'HT' } };
  else {
    const min = ms < HT ? Math.floor(ms / MIN) + 1 : 45 + Math.floor((ms - H2) / MIN) + 1;
    const label = ms < HT ? (min > 45 ? `45'+${min - 45}'` : `${min}'`) : (min > 90 ? `90'+${min - 90}'` : `${min}'`);
    status = { displayClock: label, period: ms < HT ? 1 : 2, type: { name: ms < HT ? 'STATUS_FIRST_HALF' : 'STATUS_SECOND_HALF', state: 'in', completed: false, description: ms < HT ? 'First Half' : 'Second Half', detail: label, shortDetail: label } };
  }
  comp.status = status;
  // the score so far
  for (const c of comp.competitors) c.score = ms < 0 ? undefined : String(sum.keyEvents.filter((k) => k.scoringPlay && k.team?.id === c.team.id).length);
  // stats grow through the match (possession stays as it ended)
  const share = ms < 0 ? 0 : Math.min(1, ms / END);
  for (const t of sum.boxscore.teams) for (const s of t.statistics) {
    if (/Pct$/.test(s.name)) { if (ms < 0) s.displayValue = '0'; continue; }
    if (/Cards$/.test(s.name)) { s.displayValue = String(sum.keyEvents.filter((k) => k.team?.id === t.team.id && (s.name === 'yellowCards' ? /yellow/ : /red/).test(k.type.type)).length); continue; }
    s.displayValue = String(Math.round(+s.displayValue * share));
  }
  // substitutions only once they've happened
  const subsDone = sum.keyEvents.filter((k) => k.type.type === 'substitution');
  for (const r of sum.rosters) for (const p of r.roster) {
    const on = subsDone.find((k) => k.participants[0]?.athlete.displayName === p.athlete.displayName);
    const off = subsDone.find((k) => k.participants[1]?.athlete.displayName === p.athlete.displayName);
    p.subbedIn = !!on; p.subbedOut = !!off;
    if (!on) delete p.subbedInFor;
  }
  return sum;
}

/** The pretend internet, with the replayed match; `now()` gives the pretend time */
export function liveFetch(now = () => new Date(), opts = {}) {
  const base = statsFetch(opts);
  return async (url, init) => {
    const u = new URL(url);
    if (u.host === 'site.api.espn.com' && /\/summary$/.test(u.pathname) && u.searchParams.get('event') === LIVE_EVENT.id) {
      return new Response(JSON.stringify(snapshot(now().getTime() - LIVE_KICKOFF)), { headers: { 'content-type': 'application/json' } });
    }
    return base(url, init);
  };
}
