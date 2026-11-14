import { test } from 'node:test';
import assert from 'node:assert/strict';
import features from '../content/features.mjs';
import { featureRows, featureLinks, featurePath, featureTables } from '../src/feature-templates.mjs';

test('features: every feature has what its page needs', () => {
  const slugs = new Set();
  for (const f of features) {
    assert.match(f.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.doesNotMatch(f.slug, /^\d{4}-\d{2}-\d{2}-/, 'must not look like a match preview address');
    assert.ok(!slugs.has(f.slug)); slugs.add(f.slug);
    assert.match(f.date, /^\d{4}-\d{2}-\d{2}$/);
    for (const k of ['title', 'description', 'lede']) assert.ok(f[k]);
    for (const t of featureTables(f)) {
      const width = Math.max(...(t.metrics || [[0, [4]]]).flatMap(([, idx]) => idx || [0])) + 2;
      for (const [name, seasons] of Object.entries(t.players)) {
        assert.equal(seasons.length, f.seasons.length, name);
        for (const s of seasons) if (s) assert.equal(s.length, width, name);
      }
      if (f.highlight) assert.ok(t.players[f.highlight]);
    }
  }
});

test('features: Gravenberch table is ranked by the four-season rate', () => {
  const f = features.find((x) => x.slug === 'gravenberch-v-the-midfield');
  const groups = Object.fromEntries(featureRows(f).map((g) => [g.name, g.rows]));
  assert.deepEqual(groups.Minutes.map((r) => [r.player, r.total]), [['Mac Allister', 8619], ['Szoboszlai', 8399], ['Gravenberch', 7616], ['Jones', 4967]]);
  assert.deepEqual(groups.Tackles.map((r) => r.player), ['Mac Allister', 'Jones', 'Gravenberch', 'Szoboszlai']);
  assert.deepEqual(groups.Interceptions.map((r) => [r.player, r.rate.toFixed(2)]), [['Gravenberch', '1.43'], ['Mac Allister', '0.82'], ['Jones', '0.62'], ['Szoboszlai', '0.60']]);
  assert.deepEqual(groups.Clearances.map((r) => r.player), ['Gravenberch', 'Mac Allister', 'Szoboszlai', 'Jones']);
  assert.equal(groups['Shots blocked'], undefined, 'own shots blocked is not a defensive stat');
  assert.deepEqual(groups.Recoveries.map((r) => [r.player, r.rate.toFixed(2)]), [['Jones', '5.87'], ['Szoboszlai', '5.61'], ['Mac Allister', '5.26'], ['Gravenberch', '4.83']]);
  assert.deepEqual(groups['Tackles + interceptions'].map((r) => [r.player, r.total, r.rate.toFixed(2)]), [['Mac Allister', 343, '3.58'], ['Gravenberch', 284, '3.36'], ['Jones', 143, '2.59'], ['Szoboszlai', 191, '2.05']]);
  // a season cell: total and rate
  assert.deepEqual([groups.Tackles[2].cells[1].v, groups.Tackles[2].cells[1].rate.toFixed(2)], [70, '1.99']);
  assert.equal(groups.Tackles[1].cells[3].mark, '*');
});

test('features: links for the Stats page', () => {
  assert.equal(featureLinks([]), '');
  const html = featureLinks(features);
  for (const f of features) { assert.ok(html.includes(`href="${featurePath(f)}"`)); assert.ok(f.teaser && html.includes(f.teaser.slice(0, 40)), 'each article has a teaser on the Stats page'); }
});

test('features: six midfielders, both tables ranked', () => {
  const f = features.find((x) => x.slug === 'six-midfielders-compared');
  const [def, att] = featureTables(f).map((t) => Object.fromEntries(featureRows(t).map((g) => [g.name, g.rows])));
  assert.deepEqual(def.Tackles.map((r) => [r.player, r.rate.toFixed(2)]), [['Camara', '2.81'], ['Avom', '2.64'], ['Scott', '2.13'], ['Gravenberch', '1.93'], ['Koné', '1.85'], ['Szoboszlai', '1.45']]);
  assert.deepEqual(def.Recoveries.map((r) => r.player), ['Camara', 'Scott', 'Szoboszlai', 'Avom', 'Koné', 'Gravenberch']);
  assert.deepEqual(def.Minutes.map((r) => r.total), [8399, 7616, 7062, 7056, 5062, 2794]);
  assert.equal(def.Tackles.find((r) => r.player === 'Avom').cells[0], null, 'no data shows as a gap');
  assert.deepEqual(att['Goals + assists'].map((r) => [r.player, r.total, r.rate.toFixed(2)]), [['Szoboszlai', 32, '0.34'], ['Camara', 22, '0.28'], ['Gravenberch', 14, '0.17'], ['Koné', 11, '0.14'], ['Scott', 7, '0.12'], ['Avom', 3, '0.10']]);
  assert.deepEqual(att['Chances created'].map((r) => r.player), ['Szoboszlai', 'Camara', 'Avom', 'Scott', 'Koné', 'Gravenberch']);
  assert.deepEqual(att['Dribbles completed'].map((r) => [r.player, r.rate.toFixed(2)])[0], ['Koné', '1.24']);
  assert.deepEqual(att['Touches in opposition box'].map((r) => [r.player, r.rate.toFixed(2)])[5], ['Camara', '0.66']);
  assert.equal(att['xG + xA'][0].total.toFixed(2), '36.80');
  assert.deepEqual(att.Minutes.map((r) => r.total), def.Minutes.map((r) => r.total), 'both tables use the same minutes');
});
