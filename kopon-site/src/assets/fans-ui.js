// Little pieces of the fan zone's look, used both when the pages are built and
// in the browser: player faces (Flappy Jim style: a photo in a circle with a
// white ring, or the player's initials), rating chips and bars.
import { ratingColor } from './fans-core.js';

export function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const safeImg = (u) => (/^(https:\/\/|\/photos\/)[^\s"'<>]+$/i.test(String(u || '')) ? String(u) : '');

export function initials(name) {
  return String(name || '?').replace(/[^\p{L}\s.'-]/gu, '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(-2).join('').toUpperCase() || '?';
}

// <span class="face"> with the photo on top of the initials; a photo that won't load just disappears
export function face(p, { size = 'md', team = 'us' } = {}) {
  const src = safeImg(p?.photo);
  return `<span class="face face-${size} face-${team}" aria-hidden="true"><span class="face-ini">${esc(initials(p?.name))}</span>${src ? `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</span>`;
}

export function chip(value, { big = false, label = '' } = {}) {
  const has = value != null && Number.isFinite(+value);
  return `<span class="rchip${big ? ' rchip-big' : ''}${has ? '' : ' rchip-none'}"${has ? ` style="--rc:${ratingColor(+value)}"` : ''}${label ? ` aria-label="${esc(label)}"` : ''}>${has ? (+value).toFixed(1) : '–'}</span>`;
}

export function bar(value) {
  const has = value != null && Number.isFinite(+value);
  const w = has ? Math.max(0, Math.min(100, (+value / 10) * 100)) : 0;
  return `<span class="rbar" aria-hidden="true"><span style="width:${w.toFixed(1)}%;${has ? `--rc:${ratingColor(+value)}` : ''}"></span></span>`;
}

// what a player did in the match: "90′ · 2 goals · 1 assist"
export function matchLine(p) {
  const bits = [];
  if (p.mins != null) bits.push(`${p.mins}′`);
  if (!p.starter) bits.push('sub');
  if (p.g) bits.push(`${p.g} goal${p.g > 1 ? 's' : ''}`);
  if (p.a) bits.push(`${p.a} assist${p.a > 1 ? 's' : ''}`);
  if (p.r) bits.push('sent off');
  else if (p.y) bits.push('booked');
  return bits.join(' · ');
}

export const LINE_NAMES = ['Goalkeepers', 'Defenders', 'Midfielders', 'Forwards'];
export const LINE_SHORT = ['GK', 'DEF', 'MID', 'FWD'];
