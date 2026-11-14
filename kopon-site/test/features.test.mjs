import { test } from 'node:test';
import assert from 'node:assert/strict';
import features from '../content/features.mjs';
import { featureRows, featureLinks, featurePath } from '../src/feature-templates.mjs';

test('features: every feature has what its page needs', () => {
  const slugs = new Set();
  for (const f of features) {
    assert.match(f.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.doesNotMatch(f.slug, /^\d{4}-\d{2}-\d{2}-/, 'must not look like a match preview address');
    assert.ok(!slugs.has(f.slug)); slugs.add(f.slug);
    assert.match(f.date, /^\d{4}-\d{2}-\d{2}$/);
    for (const k of ['title', 'description', 'lede']) assert.ok(f[k]);
    for (const [name, seasons] of Object.entries(f.players)) {
      assert.equal(seasons.length, f.seasons.length, name);
      for (const s of seasons) if (s) assert.equal(s.length, 6, name);
    }
    if (f.highlight) assert.ok(f.players[f.highlight]);
  }
});

test('features: Gravenberch table is ranked by the four-season rate', () => {
  const f = features.find((x) => x.slug === 'gravenberch-v-the-midfield');
  const groups = Object.fromEntries(featureRows(f).map((g) => [g.name, g.rows]));
  assert.deepEqual(groups.Minutes.map((r) => [r.player, r.total]), [['Mac Allister', 8619], ['Szoboszlai', 8399], ['Gravenberch', 7616], ['Jones', 4967]]);
  assert.deepEqual(groups.Tackles.map((r) => r.player), ['Mac Allister', 'Jones', 'Gravenberch', 'Szoboszlai']);
  assert.deepEqual(groups.Interceptions.map((r) => [r.player, r.rate.toFixed(2)]), [['Gravenberch', '1.43'], ['Mac Allister', '0.82'], ['Jones', '0.62'], ['Szoboszlai', '0.60']]);
  assert.deepEqual(groups.Clearances.map((r) => r.player), ['Gravenberch', 'Mac Allister', 'Szoboszlai', 'Jones']);
  assert.deepEqual(groups['Shots blocked'].map((r) => r.player), ['Szoboszlai', 'Mac Allister', 'Jones', 'Gravenberch']);
  assert.deepEqual(groups.Recoveries.map((r) => [r.player, r.rate.toFixed(2)]), [['Jones', '5.87'], ['Szoboszlai', '5.61'], ['Mac Allister', '5.26'], ['Gravenberch', '4.83']]);
  assert.deepEqual(groups['Tackles + interceptions'].map((r) => [r.player, r.total, r.rate.toFixed(2)]), [['Mac Allister', 343, '3.58'], ['Gravenberch', 284, '3.36'], ['Jones', 143, '2.59'], ['Szoboszlai', 191, '2.05']]);
  // a season cell: total and rate
  assert.deepEqual([groups.Tackles[2].cells[1].v, groups.Tackles[2].cells[1].rate.toFixed(2)], [70, '1.99']);
  assert.equal(groups.Tackles[1].cells[3].mark, '*');
});

test('features: links for the Stats page', () => {
  assert.equal(featureLinks([]), '');
  const html = featureLinks(features);
  for (const f of features) assert.ok(html.includes(`href="${featurePath(f)}"`));
});
