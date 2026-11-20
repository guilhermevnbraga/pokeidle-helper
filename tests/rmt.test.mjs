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

test('parseCompactNum lê inteiros PT-BR e sufixos K/M/B/T dos cards', () => {
  assert.equal(PK_RMT.parseCompactNum('702.500.000'), 702500000);
  assert.equal(PK_RMT.parseCompactNum('44M'), 44000000);
  assert.equal(PK_RMT.parseCompactNum('2,5M'), 2500000);
  assert.equal(PK_RMT.parseCompactNum('700K'), 700000);
  assert.equal(PK_RMT.parseCompactNum('7B'), 7000000000);
  assert.equal(PK_RMT.parseCompactNum('9.010T'), 9010e12);
  assert.equal(PK_RMT.parseCompactNum('—'), null);
});

test('matchLiquidItem aceita PT/EN da whitelist fungível e rejeita Stones (falso mercado)', () => {
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
    { price: 702.5e6, qty: 3, held: false, seller: 'alice' },
    { price: 703e6, qty: 2, held: false, seller: 'bob' },
  ], 100e6);
  assert.equal(res.bestPrice, 702.5e6);
  assert.equal(res.bestOffer.seller, 'alice');
  assert.equal(res.unitsAtBest, 3);
  assert.equal(res.totalFreeUnits, 5);
  assert.equal(res.levels.length, 2);
  assert.equal(res.skippedHeld, 2);
  assert.equal(res.skippedTroll, 1);
});

test('evaluateItemRoute + rankRoutes ordena apenas itens fungíveis e descarta rotas legadas de Pokémon', () => {
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
  const legacyPoke = { id: 'poke-p5', kind: 'pokemon', label: 'Poke P5', buyCoins: 101.1e6, coinsPerGem: 5.055e6 };

  const ranked = PK_RMT.rankRoutes([rToken, legacyPoke, rShiny, rBike]);
  assert.deepEqual(ranked.map(r => r.id), ['bike-frag', 'shiny-frag', 'bronze-token']);
  assert.equal(rBike.canAfford, false);
  assert.equal(rToken.canAfford, true);
  assert.ok(rBike.coinsFor1000Gems > 5.5e9 && rBike.coinsFor1000Gems < 5.65e9);
  assert.ok(rToken.warnings.some(w => w.includes('25% taxa')));
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

test('planBuyFromLevels respeita degraus de book e teto de preço com ouro disponível', () => {
  const levels = [
    { price: 700e6, qty: 2, seller: 'alice' },
    { price: 710e6, qty: 3, seller: 'bob' },
    { price: 900e6, qty: 5, seller: 'cara' }, // acima do teto
  ];
  const plan = PK_RMT.planBuyFromLevels(levels, 2.2e9, 728e6);
  assert.equal(plan.qty, 3); // 2 a 700M (1.4B) + 1 a 710M (2.11B)
  assert.equal(plan.totalCoins, 2110e6);
  assert.equal(plan.maxPricePaid, 710e6);
  assert.deepEqual(plan.sellers, ['alice', 'bob']);
});

test('buildActionPlan decide BUY_NOW com instruções de compra/venda quando melhor item cabe no ouro', () => {
  const bike = PK_RMT.matchLiquidItem('Fragmento de Bicicleta');
  const rBike = PK_RMT.evaluateItemRoute({
    item: bike,
    coinsOffer: PK_RMT.pickBestFreeOffer([
      { price: 700e6, qty: 2, held: false, seller: 'alice' },
      { price: 705e6, qty: 2, held: false, seller: 'bob' },
    ], bike.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 155, qty: 5, held: false }], 2),
    gold: 2.2e9,
  });
  const plan = PK_RMT.buildActionPlan({ routes: [rBike], gold: 2.2e9, source: 'book' });
  assert.equal(plan.verdict, 'BUY_NOW');
  assert.equal(plan.primary.qty, 3);
  assert.match(plan.primary.buyText, /3× Fragmento de Bicicleta/);
  assert.match(plan.primary.sellText, /Anuncie 3× por 154 Gemas\/un/);
  assert.match(PK_RMT.formatActionPlanText(plan), /1\. COMPRAR/);
});

test('buildActionPlan decide SAVE_OR_BUY usando apenas itens fungíveis e ignora rota legada de Pokémon', () => {
  const mshiny = PK_RMT.matchLiquidItem('Fragmento de MEGA Shiny Stone');
  const shiny = PK_RMT.matchLiquidItem('Fragmento de Shiny Stone');
  const token = PK_RMT.matchLiquidItem('Bronze Boss Token');
  const rMShiny = PK_RMT.evaluateItemRoute({
    item: mshiny,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 1660e6, qty: 3, held: false }], mshiny.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 367, qty: 3, held: false }], 2),
    gold: 100e6,
  });
  const rShiny = PK_RMT.evaluateItemRoute({
    item: shiny,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 425e6, qty: 5, held: false }], shiny.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 89, qty: 5, held: false }], 2),
    gold: 100e6,
  });
  const rToken = PK_RMT.evaluateItemRoute({
    item: token,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 28.5e6, qty: 20, held: false }], token.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 5, qty: 50, held: false }], 2),
    gold: 100e6,
  });
  // Rota legada de Pokémon não pode furar fila nem aparecer no plano
  const legacyPoke = { id: 'poke-p5', kind: 'pokemon', label: 'Poke P5', buyCoins: 90e6, coinsPerGem: 4.5e6 };

  const plan = PK_RMT.buildActionPlan({ routes: [rMShiny, rShiny, rToken, legacyPoke], gold: 100e6, source: 'book' });
  assert.equal(plan.verdict, 'SAVE_OR_BUY');
  assert.equal(plan.primary.routeId, 'shiny-frag');
  assert.equal(plan.bestOverall.routeId, 'mshiny-frag');
  assert.equal(plan.fallback.routeId, 'bronze-token');
  assert.equal(plan.ranked.some(r => r.kind === 'pokemon'), false);
  assert.ok(plan.lossPct >= 15);
});

test('buildActionPlan decide SAVE_ONLY e lista META ÓTIMA antes de 1ª ENTRADA', () => {
  const shiny = PK_RMT.matchLiquidItem('Fragmento de Shiny Stone');
  const token = PK_RMT.matchLiquidItem('Bronze Boss Token');
  const rShiny = PK_RMT.evaluateItemRoute({
    item: shiny,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 425e6, qty: 5, held: false }], shiny.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 89, qty: 5, held: false }], 2),
    gold: 1e6,
  });
  const rToken = PK_RMT.evaluateItemRoute({
    item: token,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 28.5e6, qty: 20, held: false }], token.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 5, qty: 50, held: false }], 2),
    gold: 1e6,
  });
  const plan = PK_RMT.buildActionPlan({ routes: [rShiny, rToken], gold: 1e6, source: 'book' });
  assert.equal(plan.verdict, 'SAVE_ONLY');
  assert.equal(plan.primary.routeId, 'shiny-frag');
  assert.equal(plan.fallback.routeId, 'bronze-token');
  const txt = PK_RMT.formatActionPlanText(plan);
  assert.ok(txt.indexOf('META ÓTIMA') < txt.indexOf('1ª ENTRADA'));
});

test('buildActionPlan escolhe melhor item acessível pelo Coins/Gema REAL do ouro atual (evita armadilha de 25% de taxa)', () => {
  const token = PK_RMT.matchLiquidItem('Bronze Boss Token');
  const shiny = PK_RMT.matchLiquidItem('Fragmento de Shiny Stone');
  const bike = PK_RMT.matchLiquidItem('Fragmento de Bicicleta');
  const rBike = PK_RMT.evaluateItemRoute({
    item: bike,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 702e6, qty: 3, held: false }], bike.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 159, qty: 3, held: false }], 2),
    gold: 90e6,
  });
  // Em lote 10x, token = 25.5M / 3.4 = 7.50M/G; mas com 90M compra só 3x (76.5M -> 10G = 7.65M/G)
  const rToken = PK_RMT.evaluateItemRoute({
    item: token,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 25.5e6, qty: 20, held: false }], token.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 4, qty: 50, held: false }], 2),
    gold: 90e6,
  });
  // Item unitário a 88M -> 14G brutos -> 11G líq. = 8.00M/G (pior); a 83M -> 14G brutos -> 11G líq. = 7.545M/G (melhor que 3x token = 7.65M/G!)
  const rShiny = PK_RMT.evaluateItemRoute({
    item: shiny,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 83e6, qty: 2, held: false }], shiny.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 15, qty: 5, held: false }], 2),
    gold: 90e6,
  });

  const plan = PK_RMT.buildActionPlan({ routes: [rBike, rToken, rShiny], gold: 90e6, source: 'book' });
  assert.equal(plan.verdict, 'SAVE_OR_BUY');
  assert.equal(plan.fallback.routeId, 'shiny-frag');
});
