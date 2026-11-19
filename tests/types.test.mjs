import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PK_TYPES = require('../types.js');

test('mult calcula efetividade simples, dupla e imunidade (Gen 6+)', () => {
  assert.equal(PK_TYPES.mult('FIRE', ['GRASS']), 2);
  assert.equal(PK_TYPES.mult('FIRE', ['GRASS', 'BUG']), 4);
  assert.equal(PK_TYPES.mult('WATER', ['GRASS', 'DRAGON']), 0.25);
  assert.equal(PK_TYPES.mult('GROUND', ['FLYING']), 0);
  assert.equal(PK_TYPES.mult('NORMAL', ['GHOST']), 0);
  assert.equal(PK_TYPES.mult('FAIRY', ['DRAGON']), 2);
});

test('amp aplica amplificação 1.5x da Wiki do PokeIdle', () => {
  assert.equal(PK_TYPES.amp(0), 0);
  assert.equal(PK_TYPES.amp(0.25), 0.167);
  assert.equal(PK_TYPES.amp(0.5), 0.333);
  assert.equal(PK_TYPES.amp(1), 1);
  assert.equal(PK_TYPES.amp(2), 2.5);
  assert.equal(PK_TYPES.amp(4), 5.5);
});

test('matchup avalia vantagem ofensiva/defensiva nos dois sentidos', () => {
  const fav = PK_TYPES.matchup(['WATER'], ['FIRE']);
  assert.equal(fav.known, true);
  assert.equal(fav.off, 2);
  assert.equal(fav.def, 0.5);
  assert.ok(fav.ratio > 7, `esperava ratio > 7, veio ${fav.ratio}`);

  const bad = PK_TYPES.matchup(['FIRE'], ['WATER']);
  assert.equal(bad.off, 0.5);
  assert.equal(bad.def, 2);
  assert.ok(bad.ratio < 0.2, `esperava ratio < 0.2, veio ${bad.ratio}`);

  const unknown = PK_TYPES.matchup([], ['WATER']);
  assert.deepEqual(unknown, { off: 1, def: 1, ratio: 1, known: false });
});
