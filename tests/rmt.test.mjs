import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PK_RMT = require('../rmt.js');

test('netItemGems aplica 15% com arredondamento para cima confirmado na UI', () => {
  // Valores validados diretamente na tela "+ Anunciar" do pokeidle.io
  assert.equal(PK_RMT.netItemGems(2, 1).net, 1);
  assert.equal(PK_RMT.netItemGems(3, 1).net, 2);
  assert.equal(PK_RMT.netItemGems(4, 1).net, 3);
  assert.equal(PK_RMT.netItemGems(7, 1).net, 5);
  assert.equal(PK_RMT.netItemGems(8, 1).net, 6);
  assert.equal(PK_RMT.netItemGems(10, 1).net, 8);
  assert.equal(PK_RMT.netItemGems(40, 1).net, 34);
  assert.equal(PK_RMT.netItemGems(87, 1).net, 73);
  assert.equal(PK_RMT.netItemGems(150, 1).net, 127);
  assert.equal(PK_RMT.netItemGems(190, 1).net, 161);
  // Lote de 10x a 4 Gemas = 40 bruto -> taxa 6 -> 34 liquido (3.4/un)
  assert.equal(PK_RMT.netItemGems(4, 10).netPerUnit, 3.4);
});

test('netPokeGems aplica alíquota progressiva da Wiki (13% / 10% / 7,5%)', () => {
  // Exemplo literal da Wiki: 10.000 Gemas -> 500*13% (65) + 4500*10% (450) + 5000*7.5% (375) = 890 -> 9.110
  assert.equal(PK_RMT.netPokeGems(10000).fee, 890);
  assert.equal(PK_RMT.netPokeGems(10000).net, 9110);
  // Faixa baixa com ceil: 7G -> ceil(0.91)=1 -> 6G; 8G -> ceil(1.04)=2 -> 6G
  assert.equal(PK_RMT.netPokeGems(7).net, 6);
  assert.equal(PK_RMT.netPokeGems(8).net, 6);
  assert.equal(PK_RMT.netPokeGems(500).net, 435);
});

test('parseCompactNum lê inteiros PT-BR e sufixos K/M/B/T dos cards', () => {
  assert.equal(PK_RMT.parseCompactNum('702.500.000'), 702500000);
  assert.equal(PK_RMT.parseCompactNum('44M'), 44000000);
  assert.equal(PK_RMT.parseCompactNum('2,5M'), 2500000);
  assert.equal(PK_RMT.parseCompactNum('700K'), 700000);
  assert.equal(PK_RMT.parseCompactNum('7B'), 7000000000);
  assert.equal(PK_RMT.parseCompactNum('9.010T'), 9010e12);
  assert.equal(PK_RMT.parseCompactNum('—'), null);
});

test('matchLiquidItem aceita PT/EN da whitelist e rejeita Stones (falso mercado)', () => {
  assert.equal(PK_RMT.matchLiquidItem('Fragmento de Bicicleta')?.id, 'bike-frag');
  assert.equal(PK_RMT.matchLiquidItem('Bicycle Fragment')?.id, 'bike-frag');
  assert.equal(PK_RMT.matchLiquidItem('Fragmento de Shiny Stone')?.id, 'shiny-frag');
  assert.equal(PK_RMT.matchLiquidItem('Bronze Boss Token')?.id, 'bronze-token');
  // Pedras de evolução NÃO entram na whitelist
  assert.equal(PK_RMT.matchLiquidItem('Cocoon Stone'), null);
  assert.equal(PK_RMT.matchLiquidItem('Rock Stone'), null);
  assert.equal(PK_RMT.matchLiquidItem('Leaf Stone'), null);
  assert.equal(PK_RMT.matchLiquidItem('Water Stone'), null);
});

test('pickBestFreeOffer descarta anúncios Retido e preços trolls', () => {
  const res = PK_RMT.pickBestFreeOffer([
    { price: 2, qty: 1, held: true },
    { price: 2, qty: 1, held: false }, // troll abaixo de minSanity
    { price: 700e6, qty: 2, held: true }, // retido
    { price: 702.5e6, qty: 3, held: false },
    { price: 703e6, qty: 2, held: false },
  ], 100e6);
  assert.equal(res.bestPrice, 702.5e6);
  assert.equal(res.unitsAtBest, 3);
  assert.equal(res.totalFreeUnits, 5);
  assert.equal(res.skippedHeld, 2);
  assert.equal(res.skippedTroll, 1);
});

test('evaluateItemRoute + rankRoutes ordena pela menor taxa Coins/Gema líquida e marca saldo/avisos', () => {
  const bike = PK_RMT.matchLiquidItem('Fragmento de Bicicleta');
  const shiny = PK_RMT.matchLiquidItem('Fragmento de Shiny Stone');
  const token = PK_RMT.matchLiquidItem('Bronze Boss Token');

  const rBike = PK_RMT.evaluateItemRoute({
    item: bike,
    coinsOffer: { bestPrice: 702.5e6, unitsAtBest: 3, totalFreeUnits: 60, skippedTroll: 1 },
    gemasOffer: { bestPrice: 150, unitsAtBest: 7, totalFreeUnits: 70 },
    gold: 52e6,
  });
  const rShiny = PK_RMT.evaluateItemRoute({
    item: shiny,
    coinsOffer: { bestPrice: 425e6, unitsAtBest: 3, totalFreeUnits: 72, skippedTroll: 0 },
    gemasOffer: { bestPrice: 90, unitsAtBest: 16, totalFreeUnits: 67 },
    gold: 52e6,
  });
  const rToken = PK_RMT.evaluateItemRoute({
    item: token,
    coinsOffer: { bestPrice: 29e6, unitsAtBest: 17, totalFreeUnits: 1300, skippedTroll: 0 },
    gemasOffer: { bestPrice: 4, unitsAtBest: 21, totalFreeUnits: 2100 },
    gold: 52e6,
  });
  const rSac = PK_RMT.evaluateSacrificeRoute({
    coinsOffer: { bestPrice: 44e6, unitsAtBest: 3, totalFreeUnits: 10, skippedHeld: 1 },
    gemasOffer: { bestPrice: 8, unitsAtBest: 5, totalFreeUnits: 10 },
    gold: 52e6,
  });

  const ranked = PK_RMT.rankRoutes([rToken, rSac, rShiny, rBike]);
  assert.deepEqual(ranked.map(r => r.id), ['bike-frag', 'shiny-frag', 'poke-sacrifice', 'bronze-token']);
  assert.equal(rBike.canAfford, false);
  assert.equal(rToken.canAfford, true);
  assert.equal(rSac.canAfford, true);
  assert.ok(rBike.coinsFor1000Gems > 5.5e9 && rBike.coinsFor1000Gems < 5.65e9);
  assert.ok(rToken.warnings.some(w => w.includes('25% taxa')));
});

test('evaluateSacrificeRoute rejeita leitura cruzada de moeda (askGems > 500)', () => {
  const bad = PK_RMT.evaluateSacrificeRoute({
    coinsOffer: { bestPrice: 40e6, unitsAtBest: 3, totalFreeUnits: 10 },
    gemasOffer: { bestPrice: 40e6, unitsAtBest: 3, totalFreeUnits: 10 },
    gold: 52e6,
  });
  assert.equal(bad, null);
});

test('Bronze Boss Token faz undercut conservador em ask >= 5G mas preserva piso <= 4G', () => {
  const token = PK_RMT.matchLiquidItem('Bronze Boss Token');
  const at5 = PK_RMT.evaluateItemRoute({
    item: token,
    coinsOffer: { bestPrice: 20e6, unitsAtBest: 10, totalFreeUnits: 500 },
    gemasOffer: { bestPrice: 5, unitsAtBest: 2000, totalFreeUnits: 2000 },
    gold: 52e6,
  });
  const at4 = PK_RMT.evaluateItemRoute({
    item: token,
    coinsOffer: { bestPrice: 20e6, unitsAtBest: 10, totalFreeUnits: 500 },
    gemasOffer: { bestPrice: 4, unitsAtBest: 20, totalFreeUnits: 2000 },
    gold: 52e6,
  });
  assert.equal(at5.sellGems, 4);
  assert.equal(at4.sellGems, 4);
});
