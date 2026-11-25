import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const T = require('../timing.js');

const H = 36e5;
// rota sintética: coinsPerGem = buyCoins / sellGems (sem taxa, só para o contrato)
const route = (o = {}) => ({
  id: 'x', label: 'Item X', buyCoins: 100, sellGems: 10, buyGems: 10, coinsPerGem: 10, netCoinsPerGem: 9,
  coinsAvg7d: 100, gemsAvg7d: 10, ...o,
});

test('preço igual à média 7d é NEUTRAL; caro vs média 7d é WAIT; barato é NOW (Ouro→Gema)', () => {
  const eq = T.assessRoute(route(), null, 'gold-to-gem');
  assert.equal(eq.verdict, 'NEUTRAL');
  const caro = T.assessRoute(route({ buyCoins: 130, coinsPerGem: 13 }), null, 'gold-to-gem');
  assert.equal(caro.verdict, 'WAIT');
  assert.ok(caro.fairPct < -20);
  const barato = T.assessRoute(route({ buyCoins: 80, coinsPerGem: 8 }), null, 'gold-to-gem');
  assert.equal(barato.verdict, 'NOW');
  assert.ok(barato.fairPct > 20);
});

test('Gema→Ouro: mais Coins por Gema que o normal é NOW; menos é WAIT', () => {
  const bom = T.assessRoute(route({ netCoinsPerGem: 9, buyGems: 8, gemsAvg7d: 10, buyCoins: 100 }), null, 'gem-to-gold');
  assert.equal(bom.verdict, 'NOW');
  const ruim = T.assessRoute(route({ buyGems: 13 }), null, 'gem-to-gold');
  assert.equal(ruim.verdict, 'WAIT');
});

test('sem média 7d e sem histórico: UNKNOWN (não inventa recomendação)', () => {
  const a = T.assessRoute(route({ coinsAvg7d: null, gemsAvg7d: null }), null, 'gold-to-gem');
  assert.equal(a.verdict, 'UNKNOWN');
  assert.equal(a.scorePct, null);
});

test('histórico confiável: preço acima da faixa histórica vira WAIT mesmo com média 7d neutra', () => {
  const t0 = Date.UTC(2026, 0, 1, 12);
  let h = null;
  for (let i = 0; i < 20; i++) h = T.recordSnapshot(h, [route({ coinsPerGem: 9 + (i % 3) * 0.1, buyCoins: 90 })], t0 + i * H);
  const now = t0 + 21 * H;
  const a = T.assessRoute(route({ coinsPerGem: 10, coinsAvg7d: 100, buyCoins: 100 }), h, 'gold-to-gem', { now });
  assert.equal(a.reliable, true);
  assert.equal(a.verdict, 'WAIT');
  assert.ok(a.medianUpsidePct > 5);
  assert.ok(a.percentile <= 20);
});

test('histórico curto não é usado como referência confiável', () => {
  const t0 = Date.UTC(2026, 0, 1, 12);
  let h = null;
  for (let i = 0; i < 3; i++) h = T.recordSnapshot(h, [route({ coinsPerGem: 5 })], t0 + i * H);
  const a = T.assessRoute(route(), h, 'gold-to-gem', { now: t0 + 4 * H });
  assert.equal(a.reliable, false);
  assert.equal(a.histPct, null);
  assert.equal(a.verdict, 'NEUTRAL'); // só média 7d
});

test('recordSnapshot: dedupe < 15min, teto por item e poda de 30 dias', () => {
  const t0 = Date.UTC(2026, 0, 1);
  let h = T.recordSnapshot(null, [route()], t0);
  h = T.recordSnapshot(h, [route({ coinsPerGem: 11 })], t0 + 5 * 60e3);
  assert.equal(h.items.x.length, 1);
  assert.equal(h.items.x[0].c, 11);
  h = T.recordSnapshot(h, [route()], t0 + 40 * 864e5);
  assert.equal(h.items.x.length, 1); // o antigo foi podado
  for (let i = 0; i < 600; i++) h = T.recordSnapshot(h, [route()], t0 + 41 * 864e5 + i * 20 * 60e3);
  assert.ok(h.items.x.length <= 500);
});

test('adviseTiming: todas caras => ESPERE; uma barata => recomenda ela, não o topo do ranking', () => {
  const caras = [route({ id: 'a', label: 'A', buyCoins: 130, coinsPerGem: 13 }), route({ id: 'b', label: 'B', buyCoins: 125, coinsPerGem: 12.5 })];
  const w = T.adviseTiming(caras, null, 'gold-to-gem');
  assert.equal(w.verdict, 'WAIT');
  assert.match(w.headline, /ESPERE/);

  const mix = [route({ id: 'a', label: 'A', buyCoins: 130, coinsPerGem: 13 }), route({ id: 'b', label: 'B', buyCoins: 85, coinsPerGem: 8.5 })];
  const n = T.adviseTiming(mix, null, 'gold-to-gem');
  assert.equal(n.verdict, 'NOW');
  assert.equal(n.best.id, 'b');
  assert.deepEqual(n.waitIds, ['a']);
});

test('adviseTiming sem referência nenhuma retorna UNKNOWN', () => {
  const r = T.adviseTiming([route({ coinsAvg7d: null, gemsAvg7d: null })], null, 'gold-to-gem');
  assert.equal(r.verdict, 'UNKNOWN');
});

test('melhor janela do dia aparece com >= 24h de histórico', () => {
  // preço bom (Coins/Gema 8) entre 02-08h locais, ruim (12) no resto
  const base = new Date(2026, 0, 1, 0, 0).getTime();
  let h = null;
  for (let i = 0; i < 72; i++) {
    const t = base + i * H, hr = new Date(t).getHours();
    h = T.recordSnapshot(h, [route({ coinsPerGem: hr >= 6 && hr < 12 ? 8 : 12 })], t);
  }
  const now = new Date(2026, 0, 4, 15, 0).getTime(); // bloco 12-18h (ruim)
  const a = T.assessRoute(route({ coinsPerGem: 12 }), h, 'gold-to-gem', { now });
  assert.ok(a.bestWindow);
  assert.equal(a.bestWindow.from, 6);
  assert.ok(a.bestWindow.gainPct > 30);
});

// ---- Trading ----
const mk = (id, o = {}) => route({ id, label: id.toUpperCase(), ...o });
const crossOp = (buyId, sellId) => ({ kind: 'cross', id: `cross:${buyId}->${sellId}`, buyId, sellId, title: `${buyId} → ${sellId}`, confidence: 'high', roiPct: 10, risks: [] });
const tplan = ops => ({ direction: 'trading', verdict: 'PROFITABLE', headline: 'VALE TRADING', summary: '', opportunities: ops, best: ops[0] });

test('assessTrade cross: spread acima do normal (7d) é NOW; abaixo é WAIT', () => {
  // normal: A cpg 10, B ncpg 9 => spread -10% (valores sintéticos); só a razão importa
  const A = mk('a'), B = mk('b');
  const normal = T.assessTrade(crossOp('a', 'b'), [A, B], null);
  assert.equal(normal.verdict, 'NEUTRAL');
  const wide = T.assessTrade(crossOp('a', 'b'), [mk('a', { buyCoins: 85, coinsPerGem: 8.5 }), B], null);
  assert.equal(wide.verdict, 'NOW');
  const narrow = T.assessTrade(crossOp('a', 'b'), [mk('a', { buyCoins: 125, coinsPerGem: 12.5 }), B], null);
  assert.equal(narrow.verdict, 'WAIT');
});

test('assessTrade cross usa histórico pareado por scan', () => {
  const t0 = Date.UTC(2026, 0, 1, 12);
  let h = null;
  for (let i = 0; i < 20; i++) h = T.recordSnapshot(h, [mk('a', { coinsPerGem: 8, buyCoins: 80, coinsAvg7d: null }), mk('b', { netCoinsPerGem: 9, coinsAvg7d: null })], t0 + i * H);
  const op = T.assessTrade(crossOp('a', 'b'), [mk('a', { coinsPerGem: 10, coinsAvg7d: null }), mk('b', { netCoinsPerGem: 9, coinsAvg7d: null })], h, { currentAt: t0 + 30 * H });
  assert.equal(op.reliable, true);
  assert.equal(op.verdict, 'WAIT');
});

test('assessTrade flip: comprar acima do preço normal é WAIT; abaixo é NOW', () => {
  const op = { kind: 'flip-coins', buyId: 'a', sellId: 'a' };
  assert.equal(T.assessTrade(op, [mk('a', { buyCoins: 130 })], null).verdict, 'WAIT');
  assert.equal(T.assessTrade(op, [mk('a', { buyCoins: 80 })], null).verdict, 'NOW');
  const g = { kind: 'flip-gems', buyId: 'a', sellId: 'a' };
  assert.equal(T.assessTrade(g, [mk('a', { askGems: 14 })], null).verdict, 'WAIT');
});

test('annotateTrading: tudo abaixo do normal vira WAIT; NOW sobe na ordem; sem referência não muda', () => {
  const routes = [mk('a', { buyCoins: 125, coinsPerGem: 12.5 }), mk('b'), mk('c', { buyCoins: 85, coinsPerGem: 8.5 })];
  const all = T.annotateTrading(tplan([crossOp('a', 'b')]), routes, null);
  assert.equal(all.verdict, 'WAIT');
  assert.match(all.headline, /ESPERE/);

  const mixed = T.annotateTrading(tplan([crossOp('a', 'b'), crossOp('c', 'b')]), routes, null);
  assert.equal(mixed.verdict, 'PROFITABLE');
  assert.equal(mixed.best.buyId, 'c');
  assert.match(mixed.headline, /BOM MOMENTO/);

  const semRef = [mk('a', { coinsAvg7d: null, gemsAvg7d: null }), mk('b', { coinsAvg7d: null, gemsAvg7d: null })];
  const same = T.annotateTrading(tplan([crossOp('a', 'b')]), semRef, null);
  assert.equal(same.verdict, 'PROFITABLE');
  assert.equal(same.best.timing.verdict, 'UNKNOWN');
  assert.equal(T.annotateTrading(null, routes, null), null);
});
