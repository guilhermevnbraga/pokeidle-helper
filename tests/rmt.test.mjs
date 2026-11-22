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

test('netItemCoins aplica 15% com arredondamento para cima em Coins', () => {
  assert.equal(PK_RMT.netItemCoins(100, 1).fee, 15);
  assert.equal(PK_RMT.netItemCoins(100, 1).net, 85);
  assert.equal(PK_RMT.netItemCoins(101, 1).fee, 16); // ceil(15.15) = 16
  assert.equal(PK_RMT.netItemCoins(101, 1).net, 85);
  const big = PK_RMT.netItemCoins(702499999, 2);
  assert.equal(big.gross, 1404999998);
  assert.equal(big.fee, Math.ceil(1404999998 * 0.15));
  assert.equal(big.net, big.gross - big.fee);
});

test('evaluateItemRoute + rankReverseRoutes ordena Gema->Ouro por MAIOR Coins líquidos/Gema e aplica undercut de 1 Coin', () => {
  const bike = PK_RMT.matchLiquidItem('Fragmento de Bicicleta');
  const shiny = PK_RMT.matchLiquidItem('Fragmento de Shiny Stone');
  const token = PK_RMT.matchLiquidItem('Bronze Boss Token');

  // Bike: compra 150G, vende por 702.499.999 -> líq. ~597,12M / 150G = ~3,98M/G
  const rBike = PK_RMT.evaluateItemRoute({
    item: bike,
    coinsOffer: { bestPrice: 702.5e6, unitsAtBest: 3, totalFreeUnits: 60 },
    gemasOffer: { bestPrice: 150, unitsAtBest: 7, totalFreeUnits: 70 },
    gems: 100,
  });
  // Shiny: compra 90G, vende por 424.999.999 -> líq. ~361,25M / 90G = ~4,01M/G
  const rShiny = PK_RMT.evaluateItemRoute({
    item: shiny,
    coinsOffer: { bestPrice: 425e6, unitsAtBest: 3, totalFreeUnits: 72 },
    gemasOffer: { bestPrice: 90, unitsAtBest: 16, totalFreeUnits: 67 },
    gems: 100,
  });
  // Token: compra 4G, vende por 28.999.999 -> líq. ~24,65M / 4G = ~6,16M/G (MELHOR em Gema->Ouro!)
  const rToken = PK_RMT.evaluateItemRoute({
    item: token,
    coinsOffer: { bestPrice: 29e6, unitsAtBest: 17, totalFreeUnits: 1300 },
    gemasOffer: { bestPrice: 4, unitsAtBest: 21, totalFreeUnits: 2100 },
    gems: 100,
  });
  const legacyPoke = { id: 'poke-p5', kind: 'pokemon', label: 'Poke P5', buyCoins: 101.1e6, askGems: 10 };

  // Notice: em Ouro->Gema, bike vence token; em Gema->Ouro, token vence shiny e bike!
  const rankedO2G = PK_RMT.rankRoutes([rToken, rShiny, rBike]);
  assert.deepEqual(rankedO2G.map(r => r.id), ['bike-frag', 'shiny-frag', 'bronze-token']);

  const rankedG2O = PK_RMT.rankReverseRoutes([rBike, legacyPoke, rShiny, rToken]);
  assert.deepEqual(rankedG2O.map(r => r.id), ['bronze-token', 'shiny-frag', 'bike-frag']);
  assert.equal(rBike.sellCoins, 702499999);
  assert.equal(rToken.sellCoins, 28999999);
  assert.equal(rToken.canAffordGems, true);
  assert.equal(rBike.canAffordGems, false);
  assert.ok(rToken.netCoinsPerGem > 6.1e6 && rToken.netCoinsPerGem < 6.2e6);
});

test('rankReverseRoutes e buildGemToGoldActionPlan são retrocompatíveis com rotas legadas em cache (sem netCoinsPerGem)', () => {
  const legacyCached = [
    { id: 'bike-frag', kind: 'item', label: 'Frag. Bicicleta', marketName: 'Fragmento de Bicicleta', buyCoins: 700e6, askGems: 150, coinsPerGem: 5.5e6 },
    { id: 'bronze-token', kind: 'item', label: 'Bronze Boss Token', marketName: 'Bronze Boss Token', buyCoins: 28e6, askGems: 4, coinsPerGem: 8.2e6 },
  ];
  const plan = PK_RMT.buildGemToGoldActionPlan({ routes: legacyCached, gems: 20, source: 'book' });
  assert.equal(plan.verdict, 'BUY_NOW');
  assert.equal(plan.primary.routeId, 'bronze-token');
  assert.equal(plan.primary.qty, 5);
  assert.equal(plan.primary.totalGems, 20);
  assert.match(plan.primary.sellText, /27\.999\.999 Coins\/un/);
});

test('buildGemToGoldActionPlan decide BUY_NOW respeitando degraus do book de Gemas e teto +4%', () => {
  const bike = PK_RMT.matchLiquidItem('Fragmento de Bicicleta');
  const rBike = PK_RMT.evaluateItemRoute({
    item: bike,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 800e6, qty: 10, held: false }], bike.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([
      { price: 100, qty: 2, held: false, seller: 'alice' },
      { price: 103, qty: 2, held: false, seller: 'bob' },
      { price: 130, qty: 5, held: false, seller: 'cara' }, // acima do teto +4% (104)
    ], 2),
    gems: 500,
  });
  const plan = PK_RMT.buildGemToGoldActionPlan({ routes: [rBike], gems: 500, source: 'book' });
  assert.equal(plan.direction, 'gem-to-gold');
  assert.equal(plan.verdict, 'BUY_NOW');
  assert.equal(plan.primary.qty, 4); // 2 a 100G + 2 a 103G = 406G (não toca no nível de 130G)
  assert.equal(plan.primary.totalGems, 406);
  assert.deepEqual(plan.primary.sellers, ['alice', 'bob']);
  assert.match(plan.primary.where, /Gemas$/);
  assert.match(plan.primary.buyText, /4× Fragmento de Bicicleta até 103G\/un \(total 406G\)/);
  assert.match(plan.primary.sellText, /Anuncie 4× por 799\.999\.999 Coins\/un/);
  assert.match(PK_RMT.formatActionPlanText(plan), /1\. COMPRAR/);
});

test('buildGemToGoldActionPlan decide SAVE_OR_BUY quando rota mais cara em Gemas rende >8% mais ouro/gema', () => {
  const mshiny = PK_RMT.matchLiquidItem('Fragmento de MEGA Shiny Stone');
  const shiny = PK_RMT.matchLiquidItem('Fragmento de Shiny Stone');
  const token = PK_RMT.matchLiquidItem('Bronze Boss Token');

  // mshiny: 200G -> 1.4B Coins -> ~5,95M/G líq. (topo absoluto)
  const rMShiny = PK_RMT.evaluateItemRoute({
    item: mshiny,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 1400e6, qty: 5, held: false }], mshiny.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 200, qty: 5, held: false }], 2),
    gems: 40,
  });
  // shiny: 100G -> 680M Coins -> ~5,78M/G líq. (dentro de 10% do topo -> META RECOMENDADA)
  const rShiny = PK_RMT.evaluateItemRoute({
    item: shiny,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 680e6, qty: 5, held: false }], shiny.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 100, qty: 5, held: false }], 2),
    gems: 40,
  });
  // token: 4G -> 20M Coins -> ~4,25M/G líq. (acessível com 40G, mas ~29% menos ouro/gema)
  const rToken = PK_RMT.evaluateItemRoute({
    item: token,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 20e6, qty: 50, held: false }], token.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 4, qty: 50, held: false }], 2),
    gems: 40,
  });

  const plan = PK_RMT.buildGemToGoldActionPlan({ routes: [rMShiny, rShiny, rToken], gems: 40, source: 'book' });
  assert.equal(plan.verdict, 'SAVE_OR_BUY');
  assert.equal(plan.primary.routeId, 'shiny-frag');
  assert.equal(plan.primary.missingGems, 60);
  assert.equal(plan.bestOverall.routeId, 'mshiny-frag');
  assert.equal(plan.fallback.routeId, 'bronze-token');
  assert.equal(plan.fallback.qty, 10);
  assert.ok(plan.lossPct >= 25);
  assert.match(plan.headline, /MELHOR JUNTAR/);
  assert.match(PK_RMT.formatActionPlanText(plan), /AGORA \(-\d+% ouro\)/);
});

test('buildGemToGoldActionPlan decide SAVE_ONLY com 0 Gemas e mostra melhor rota do mercado + 1ª entrada', () => {
  const shiny = PK_RMT.matchLiquidItem('Fragmento de Shiny Stone');
  const token = PK_RMT.matchLiquidItem('Bronze Boss Token');
  const rShiny = PK_RMT.evaluateItemRoute({
    item: shiny,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 600e6, qty: 5, held: false }], shiny.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 80, qty: 5, held: false }], 2),
    gems: 0,
  });
  const rToken = PK_RMT.evaluateItemRoute({
    item: token,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 20e6, qty: 50, held: false }], token.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 4, qty: 50, held: false }], 2),
    gems: 0,
  });
  const plan = PK_RMT.buildGemToGoldActionPlan({ routes: [rShiny, rToken], gems: 0, source: 'book' });
  assert.equal(plan.verdict, 'SAVE_ONLY');
  assert.equal(plan.primary.routeId, 'shiny-frag');
  assert.equal(plan.primary.missingGems, 80);
  assert.equal(plan.fallback.routeId, 'bronze-token');
  assert.equal(plan.fallback.missingGems, 4);
  const txt = PK_RMT.formatActionPlanText(plan);
  assert.ok(txt.indexOf('META ÓTIMA') < txt.indexOf('1ª ENTRADA'));
});

test('parseAvg7d lê média 7d e volume em PT e EN preservando 0 vendas', () => {
  assert.deepEqual(PK_RMT.parseAvg7d('Média 7d: 702.500.000/un · 18 un. vendidas'), { avg7d: 702500000, vol7d: 18 });
  assert.deepEqual(PK_RMT.parseAvg7d('7d avg: 145/ea · 0 units sold'), { avg7d: 145, vol7d: 0 });
  assert.deepEqual(PK_RMT.parseAvg7d(''), { avg7d: null, vol7d: null });
});

test('buildTradingPlan detecta arbitragem cruzada lucrativa confirmada pela média 7d (PROFITABLE)', () => {
  const bike = PK_RMT.matchLiquidItem('Fragmento de Bicicleta');
  const mega = PK_RMT.matchLiquidItem('Fragmento de MEGA Stone');

  // Bicicleta: compra 680M -> vende 148G (125G líq.) => 5,44M/G
  const rBike = PK_RMT.evaluateItemRoute({
    item: bike,
    coinsOffer: Object.assign(PK_RMT.pickBestFreeOffer([{ price: 680e6, qty: 20, held: false }], bike.minSanityCoins), { avg7d: 690e6, vol7d: 25 }),
    gemasOffer: Object.assign(PK_RMT.pickBestFreeOffer([{ price: 149, qty: 20, held: false }], 2), { avg7d: 148, vol7d: 30 }),
    gold: 1e9,
    gems: 0,
  });
  // MEGA Stone: compra 115G -> vende 819.999.999 (697M líq.) => 6,06M/G (+11,4% ciclo!), média 7d = 810M (ainda +10%!)
  const rMega = PK_RMT.evaluateItemRoute({
    item: mega,
    coinsOffer: Object.assign(PK_RMT.pickBestFreeOffer([{ price: 820e6, qty: 20, held: false }], mega.minSanityCoins), { avg7d: 810e6, vol7d: 15 }),
    gemasOffer: Object.assign(PK_RMT.pickBestFreeOffer([{ price: 115, qty: 20, held: false }], 2), { avg7d: 115, vol7d: 20 }),
    gold: 1e9,
    gems: 0,
  });

  const trade = PK_RMT.buildTradingPlan({ routes: [rBike, rMega], gold: 1e9, gems: 0, source: 'book' });
  assert.equal(trade.verdict, 'PROFITABLE');
  assert.equal(trade.best.kind, 'cross');
  assert.equal(trade.best.confidence, 'high');
  assert.equal(trade.best.affordable, true);
  assert.ok(trade.best.roiPct > 10);
  assert.ok(trade.best.roiAtAvg7dPct > 8);
  assert.match(trade.headline, /VALE TRADING/);
  assert.match(PK_RMT.formatActionPlanText(trade), /LUCRO:/);
});

test('buildTradingPlan rebaixa para RISKY quando book de venda está inflado acima da média 7d (anti-armadilha)', () => {
  const bike = PK_RMT.matchLiquidItem('Fragmento de Bicicleta');
  const mega = PK_RMT.matchLiquidItem('Fragmento de MEGA Stone');

  const rBike = PK_RMT.evaluateItemRoute({
    item: bike,
    coinsOffer: Object.assign(PK_RMT.pickBestFreeOffer([{ price: 693.5e6, qty: 20, held: false }], bike.minSanityCoins), { avg7d: 700e6, vol7d: 25 }),
    gemasOffer: Object.assign(PK_RMT.pickBestFreeOffer([{ price: 145, qty: 20, held: false }], 2), { avg7d: 144, vol7d: 25 }),
    gold: 1e9,
  });
  // Book Coins de MEGA Stone inflado a 810M, mas média 7d real é 620M (daria prejuízo de -19%!)
  const rMega = PK_RMT.evaluateItemRoute({
    item: mega,
    coinsOffer: Object.assign(PK_RMT.pickBestFreeOffer([{ price: 810e6, qty: 2, held: false }], mega.minSanityCoins), { avg7d: 620e6, vol7d: 10 }),
    gemasOffer: Object.assign(PK_RMT.pickBestFreeOffer([{ price: 115, qty: 20, held: false }], 2), { avg7d: 115, vol7d: 15 }),
    gold: 1e9,
  });

  const trade = PK_RMT.buildTradingPlan({ routes: [rBike, rMega], gold: 1e9, gems: 0, source: 'book' });
  assert.equal(trade.verdict, 'RISKY');
  assert.equal(trade.best.confidence, 'low');
  assert.ok(trade.best.roiAtAvg7dPct < 0);
  assert.ok(trade.best.risks.some(w => /acima da média 7d/.test(w)));
});

test('buildTradingPlan detecta flip/snipe lucrativo no mesmo book de Coins quando nível 1 está muito abaixo do nível 2', () => {
  const bike = PK_RMT.matchLiquidItem('Fragmento de Bicicleta');
  const rBike = PK_RMT.evaluateItemRoute({
    item: bike,
    coinsOffer: Object.assign(PK_RMT.pickBestFreeOffer([
      { price: 500e6, qty: 2, held: false, seller: 'snipe' },
      { price: 700e6, qty: 10, held: false, seller: 'norm1' },
    ], bike.minSanityCoins), { avg7d: 695e6, vol7d: 22 }),
    gemasOffer: Object.assign(PK_RMT.pickBestFreeOffer([{ price: 150, qty: 15, held: false }], 2), { avg7d: 150, vol7d: 20 }),
    gold: 1.2e9,
  });

  const trade = PK_RMT.buildTradingPlan({ routes: [rBike], gold: 1.2e9, gems: 0, source: 'book' });
  assert.equal(trade.verdict, 'PROFITABLE');
  assert.equal(trade.best.kind, 'flip-coins');
  assert.equal(trade.best.confidence, 'high');
  assert.ok(trade.best.roiPct > 18); // 2x 500M = 1B -> revende 699.999.999 -> líq 1.19B (+19%)
  assert.match(trade.headline, /VALE FLIP/);
});

test('buildTradingPlan retorna NO_TRADE quando nenhuma rota cobre as comissões de 15%', () => {
  const bike = PK_RMT.matchLiquidItem('Fragmento de Bicicleta');
  const shiny = PK_RMT.matchLiquidItem('Fragmento de Shiny Stone');

  // Ambos perto de 5,0M/G bruto: após 15%+15% qualquer ciclo perde ~28%
  const rBike = PK_RMT.evaluateItemRoute({
    item: bike,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 750e6, qty: 10, held: false }], bike.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 150, qty: 10, held: false }], 2),
  });
  const rShiny = PK_RMT.evaluateItemRoute({
    item: shiny,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 450e6, qty: 10, held: false }], shiny.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 90, qty: 10, held: false }], 2),
  });

  const trade = PK_RMT.buildTradingPlan({ routes: [rBike, rShiny], gold: 1e9, gems: 500, source: 'book' });
  assert.equal(trade.verdict, 'NO_TRADE');
  assert.equal(trade.best, null);
  assert.ok(trade.bestSpread && trade.bestSpread.roiPct < 0);
  assert.match(trade.headline, /NÃO VALE TRADING AGORA/);
});
