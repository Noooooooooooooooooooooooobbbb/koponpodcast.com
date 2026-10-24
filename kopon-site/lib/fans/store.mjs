// Where fans' line-ups and ratings are kept.
// On Netlify: Netlify Blobs (built in; nothing to sign up for).
// On a computer (local preview and tests): a folder of JSON files, set with KOPON_STORE_DIR.
// Both offer the same few calls: get, set, list({ prefix }), delete.
import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export function fileStore(root, name) {
  const base = join(root, name);
  const file = (key) => join(base, ...key.split('/').map((p) => encodeURIComponent(p))) + '.json';
  return {
    async get(key, opts = {}) {
      try { const t = await readFile(file(key), 'utf8'); return opts.type === 'json' ? JSON.parse(t) : t; } catch { return null; }
    },
    async set(key, value) {
      const f = file(key);
      await mkdir(dirname(f), { recursive: true });
      await writeFile(f, typeof value === 'string' ? value : JSON.stringify(value));
    },
    async setJSON(key, value) { return this.set(key, JSON.stringify(value)); },
    async delete(key) { await rm(file(key), { force: true }); },
    async list({ prefix = '' } = {}) {
      const blobs = [];
      const walk = async (dir, parts) => {
        let entries = [];
        try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of entries) {
          const nm = decodeURIComponent(e.name.replace(/\.json$/, ''));
          if (e.isDirectory()) await walk(join(dir, e.name), [...parts, decodeURIComponent(e.name)]);
          else if (e.name.endsWith('.json')) { const key = [...parts, nm].join('/'); if (key.startsWith(prefix)) blobs.push({ key, etag: '' }); }
        }
      };
      await walk(base, []);
      return { blobs };
    },
  };
}

export async function openStore(name, env = {}) {
  const dir = env.KOPON_STORE_DIR || process.env.KOPON_STORE_DIR;
  if (dir) return fileStore(dir, name);
  const { getStore } = await import('@netlify/blobs');
  return getStore({ name, consistency: 'strong' });
}
