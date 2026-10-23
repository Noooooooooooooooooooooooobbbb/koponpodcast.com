import { decodeEntities } from './entities.mjs';

// ---- escaping ---------------------------------------------------------------
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON that is safe to drop inside a <script> element.
export function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// Only allow http(s) URLs through to href/src attributes.
export function safeUrl(url) {
  const s = String(url ?? '').trim();
  return /^https?:\/\//i.test(s) ? s : '';
}

// ---- text cleanup -------------------------------------------------------------
// Spotify/Anchor wraps links in U+2060 word joiners; also drop other invisibles.
export function cleanInvisible(s) {
  return String(s ?? '').replace(/[⁠​‌‍﻿­]/g, '');
}

// Removes <script>/<style> blocks in linear time (a regex here can be made
// to take minutes on hostile input).
function dropBlocks(s) {
  const lower = s.toLowerCase();
  let out = '', i = 0;
  for (;;) {
    const a = lower.indexOf('<script', i), b = lower.indexOf('<style', i);
    const start = a === -1 ? b : b === -1 ? a : Math.min(a, b);
    if (start === -1) return out + s.slice(i);
    const tag = start === a ? 'script' : 'style';
    out += s.slice(i, start) + ' ';
    const end = lower.indexOf(`</${tag}`, start);
    if (end === -1) return out;
    const close = lower.indexOf('>', end);
    i = close === -1 ? s.length : close + 1;
  }
}

export function stripTags(html) {
  return dropBlocks(String(html ?? ''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<\/?[A-Za-z][^>]*>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

// Plain one-line text from something that may hold tags and entities.
export function plainText(s, maxInput = 20000) {
  return cleanInvisible(decodeEntities(stripTags(String(s ?? '').slice(0, maxInput)))).replace(/\s+/g, ' ').trim();
}

export function truncate(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max + 1);
  const at = cut.lastIndexOf(' ');
  return (at > max * 0.6 ? cut.slice(0, at) : cut.slice(0, max)).replace(/[\s,;:.\-–—]+$/, '') + '…';
}

// Excerpt for listings: stops at boilerplate markers (e.g. "YNWA!! KOP ON YOUTUBE")
export function excerpt(html, max = 200, stopMarkers = []) {
  let text = plainText(html);
  for (const marker of stopMarkers) {
    const at = text.toLowerCase().indexOf(marker.toLowerCase());
    if (at > 40) text = text.slice(0, at).trim();
  }
  return truncate(text, max);
}

// Matches the URL scheme of the existing site:
// "Iraola's Interview (pt. 3), and Darwin to return?" -> "iraola-s-interview-pt-3-and-darwin-to-return"
const SPECIAL = { ø: 'o', Ø: 'o', ß: 'ss', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe', đ: 'd', Đ: 'd', ł: 'l', Ł: 'l', þ: 'th', Þ: 'th', ı: 'i' };
export function slugify(title) {
  return String(title ?? '')
    .replace(/[øØßæÆœŒđĐłŁþÞı]/g, (c) => SPECIAL[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'episode';
}

// ---- time ------------------------------------------------------------------
// "01:23:00" | "34:57" | "4980" | "4980.5" -> seconds
export function parseDuration(value) {
  const s = String(value ?? '').trim();
  if (!s) return 0;
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(parseFloat(s));
  const parts = s.split(':').map((p) => parseInt(p, 10));
  if (parts.some((p) => !Number.isFinite(p))) return 0;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

// 4980 -> "1 h 23 min", 2097 -> "35 min" (rounded like the old site)
export function formatDuration(seconds) {
  if (!seconds) return '';
  const totalMin = Math.round(seconds / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${Math.max(1, m)} min`;
}

// 4980 -> "1:23:00"
export function clock(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = h ? String(m).padStart(2, '0') : String(m);
  return `${h ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Dates are shown in UK time, since that's where matches happen.
function ukParts(date) {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const o = {};
  for (const p of f.formatToParts(date)) o[p.type] = p.value;
  return { y: +o.year, mo: +o.month - 1, d: +o.day, hh: o.hour, mm: o.minute };
}

export const formatDateLong = (date) => { const p = ukParts(date); return `${p.d} ${MONTHS[p.mo]} ${p.y}`; };
export const formatDateShort = (date) => { const p = ukParts(date); return `${p.d} ${MONTHS[p.mo].slice(0, 3)} ${p.y}`; };
export const formatMonthYear = (date) => { const p = ukParts(date); return `${MONTHS[p.mo]} ${p.y}`; };
export const isoDate = (date) => { const p = ukParts(date); return `${p.y}-${String(p.mo + 1).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`; };

// Feeds sometimes use zone names JavaScript doesn't know (e.g. "BST").
const ZONES = { BST: '+0100', IST: '+0100', CET: '+0100', CEST: '+0200', WET: '+0000', WEST: '+0100', EET: '+0200', EEST: '+0300' };

export function parseDate(value) {
  if (!value) return null;
  const s = String(value).trim().replace(/\b(BST|IST|CEST|CET|WEST|WET|EEST|EET)\b/, (z) => ZONES[z]);
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
