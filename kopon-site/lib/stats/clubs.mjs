// Telling club names apart: "Man Utd" = "Manchester United FC" = "Man United", but never "Manchester City".
const CLUB_ALIAS = { 'man united': 'manchester united', 'man utd': 'manchester united', 'man city': 'manchester city', spurs: 'tottenham hotspur', tottenham: 'tottenham hotspur', wolves: 'wolverhampton wanderers', 'nottm forest': 'nottingham forest', 'nott m forest': 'nottingham forest', 'west ham': 'west ham united', psg: 'paris saint germain', inter: 'internazionale', atletico: 'atletico madrid', bayern: 'bayern munich', 'bayern munchen': 'bayern munich', 'brighton hove': 'brighton and hove albion', brighton: 'brighton and hove albion' };
export function clubNorm(n) {
  const x = String(n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(fc|afc|cf|sc|ac|ssc|club|de|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return CLUB_ALIAS[x] || x;
}
export function sameClub(a, b) {
  const A = clubNorm(a), B = clubNorm(b); if (!A || !B) return false; if (A === B) return true;
  const ta = A.split(' '), tb = B.split(' '), [sh, lo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (sh[0] === lo[0] && sh.every((t) => lo.includes(t)) && !(sh.length === 1 && ['manchester', 'sheffield', 'bristol', 'real', 'athletic', 'sporting', 'inter'].includes(sh[0]))) return true;
  return sh.length === 1 && sh[0].length >= 5 && lo.includes(sh[0]) && !['united', 'city', 'town', 'rovers', 'athletic', 'wanderers', 'albion', 'county', 'forest', 'hotspur', 'madrid', 'munich'].includes(sh[0]);
}
export const findRow = (rows, team) => rows.find((r) => [r.name, r.full, r.short].some((x) => x && [team.name, team.shortName, team.short].some((y) => y && (x === y || sameClub(x, y)))));

