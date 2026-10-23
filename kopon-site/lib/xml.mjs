// A small, forgiving XML parser for RSS/Atom feeds (no dependencies).
// It builds a simple tree:  { name, attrs, children: [ node | string ] }.
// Text is entity-decoded; CDATA is kept raw. Broken nesting is recovered
// from instead of throwing, because real-world feeds are often sloppy.

import { decodeEntities } from './entities.mjs';

const NAME_START = /[A-Za-z_:]/;

export function parseXml(input) {
  let src = String(input ?? '');
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const n = src.length;
  let i = 0;

  const top = () => stack[stack.length - 1];
  const pushString = (s) => {
    if (!s) return;
    const kids = top().children;
    if (typeof kids[kids.length - 1] === 'string') kids[kids.length - 1] += s;
    else kids.push(s);
  };

  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt === -1) { pushString(decodeEntities(src.slice(i))); break; }
    if (lt > i) pushString(decodeEntities(src.slice(i, lt)));

    if (src.startsWith('<!--', lt)) {
      const e = src.indexOf('-->', lt + 4);
      i = e === -1 ? n : e + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', lt)) {
      const e = src.indexOf(']]>', lt + 9);
      pushString(src.slice(lt + 9, e === -1 ? n : e));
      i = e === -1 ? n : e + 3;
      continue;
    }
    if (src.startsWith('<?', lt)) {
      const e = src.indexOf('?>', lt + 2);
      i = e === -1 ? n : e + 2;
      continue;
    }
    if (src.startsWith('<!', lt)) {
      // DOCTYPE or other declaration; may contain an internal subset [...]
      let j = lt + 2, depth = 0;
      while (j < n) {
        const c = src[j];
        if (c === '[') depth++;
        else if (c === ']') depth--;
        else if (c === '>' && depth <= 0) break;
        j++;
      }
      i = j + 1;
      continue;
    }
    if (src[lt + 1] === '/') {
      const e = src.indexOf('>', lt);
      const name = src.slice(lt + 2, e === -1 ? n : e).trim();
      for (let k = stack.length - 1; k > 0; k--) {
        if (stack[k].name === name) { stack.length = k; break; }
      }
      i = e === -1 ? n : e + 1;
      continue;
    }
    if (!NAME_START.test(src[lt + 1] || '')) {
      // A stray "<" in text (invalid XML, but it happens)
      pushString('<');
      i = lt + 1;
      continue;
    }

    // Opening tag
    let j = lt + 1;
    while (j < n && !/[\s/>]/.test(src[j])) j++;
    const node = { name: src.slice(lt + 1, j), attrs: {}, children: [] };
    let selfClosing = false;
    while (j < n) {
      while (j < n && /\s/.test(src[j])) j++;
      if (src[j] === '>') { j++; break; }
      if (src[j] === '/' && src[j + 1] === '>') { selfClosing = true; j += 2; break; }
      if (src[j] === '/') { j++; continue; }
      let k = j;
      while (k < n && !/[\s=/>]/.test(src[k])) k++;
      const attrName = src.slice(j, k);
      j = k;
      while (j < n && /\s/.test(src[j])) j++;
      let value = '';
      if (src[j] === '=') {
        j++;
        while (j < n && /\s/.test(src[j])) j++;
        const q = src[j];
        if (q === '"' || q === "'") {
          const e = src.indexOf(q, j + 1);
          value = src.slice(j + 1, e === -1 ? n : e);
          j = e === -1 ? n : e + 1;
        } else {
          let e = j;
          while (e < n && !/[\s>]/.test(src[e])) e++;
          value = src.slice(j, e);
          j = e;
        }
      }
      if (attrName) node.attrs[attrName] = decodeEntities(value);
      if (k === j && !attrName) j++; // safety: always make progress
    }
    top().children.push(node);
    // Cap nesting so hostile/broken feeds can't build a tree deep enough to overflow the stack
    if (!selfClosing && stack.length < 200) stack.push(node);
    i = j;
  }
  return root;
}

// ---- tree helpers ---------------------------------------------------------

export const isEl = (x) => x && typeof x === 'object';

export function child(node, ...names) {
  if (!node) return null;
  for (const c of node.children) if (isEl(c) && names.includes(c.name)) return c;
  return null;
}

export function children(node, ...names) {
  if (!node) return [];
  return node.children.filter((c) => isEl(c) && names.includes(c.name));
}

export function find(node, name) {
  if (!node) return null;
  for (const c of node.children) {
    if (!isEl(c)) continue;
    if (c.name === name) return c;
    const f = find(c, name);
    if (f) return f;
  }
  return null;
}

export function textOf(node) {
  if (!node) return '';
  let out = '';
  for (const c of node.children) out += typeof c === 'string' ? c : textOf(c);
  return out;
}

// Inner content as an HTML string. Usually the feed gives HTML as one
// string (CDATA or escaped); if a feed embedded raw tags instead, we
// re-serialise them so nothing is lost.
export function htmlOf(node) {
  if (!node) return '';
  let out = '';
  for (const c of node.children) {
    if (typeof c === 'string') { out += c; continue; }
    const attrs = Object.entries(c.attrs).map(([k, v]) => ` ${k}="${String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`).join('');
    out += `<${c.name}${attrs}>${htmlOf(c)}</${c.name}>`;
  }
  return out;
}

export const textChild = (node, ...names) => textOf(child(node, ...names)).trim();
