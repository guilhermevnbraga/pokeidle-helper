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

test('pickBestFreeOffer preserva níveis livres e metadados exatos do Pokémon mais barato', () => {
  const res = PK_RMT.pickBestFreeOffer([
    { price: 40e6, qty: 1, held: true, name: 'Ancient Pupitar', level: 'Nv 100', pot: 'P2', nota: 'N 3,511', seller: 'rafaelmdrs' },
    { price: 40e6, qty: 1, held: false, name: 'Psy Jynx', level: 'Nv 100', pot: 'P2', nota: 'N 3,554', seller: 'icebergue' },
    { price: 43e6, qty: 1, held: false, name: 'Furious Scizor', level: 'Nv 100', pot: 'P2', nota: 'N 3,548', seller: 'ThirLeozin' },
  ], 5e6);
  assert.equal(res.bestOffer.name, 'Psy Jynx');
  assert.equal(res.bestOffer.seller, 'icebergue');
  assert.equal(res.bestOffer.nota, 'N 3,554');
  assert.equal(res.topOffers.length, 2);
  assert.equal(res.levels.length, 2);
});

test('evaluatePokeRoute avalia categorias P5/Mega/Shiny e carrega qual Pokémon comprar', () => {
  const catP5 = PK_RMT.POKE_CATEGORIES.find(c => c.id === 'poke-p5');
  const coinsOffer = PK_RMT.pickBestFreeOffer([
    { price: 80e6, qty: 1, held: false, name: 'Enraged Typhlosion', level: 'Nv 100', pot: 'P5', nota: 'N 3,884', seller: 'Kzalt' },
  ], catP5.minSanityCoins);
  const gemasOffer = PK_RMT.pickBestFreeOffer([
    { price: 20, qty: 1, held: false, name: 'Enraged Typhlosion', nota: 'N 4,079', seller: 'ghxstdio2' },
  ], 2);

  const route = PK_RMT.evaluatePokeRoute({ category: catP5, coinsOffer, gemasOffer, gold: 100e6 });
  assert.equal(route.id, 'poke-p5');
  assert.equal(route.sellGems, 19);
  assert.equal(route.netGemsUnit, 16); // 19 - ceil(2.47=3) = 16
  assert.equal(route.bestPoke.name, 'Enraged Typhlosion');
  assert.equal(route.bestPoke.seller, 'Kzalt');
  assert.ok(route.coinsPerGem > 5e6 && route.coinsPerGem < 5.1e6);
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

test('buildActionPlan decide BUY_NOW com instruções de compra/venda quando melhor rota cabe no ouro', () => {
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

test('buildActionPlan decide SAVE_OR_BUY e indica qual Pokémon comprar se quiser converter já', () => {
  const mshiny = PK_RMT.matchLiquidItem('Fragmento de MEGA Shiny Stone');
  const shiny = PK_RMT.matchLiquidItem('Fragmento de Shiny Stone');
  const rMShiny = PK_RMT.evaluateItemRoute({
    item: mshiny,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 1660e6, qty: 3, held: false }], mshiny.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 367, qty: 3, held: false }], 2),
    gold: 53e6,
  });
  const rShiny = PK_RMT.evaluateItemRoute({
    item: shiny,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 425e6, qty: 5, held: false }], shiny.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 89, qty: 5, held: false }], 2),
    gold: 53e6,
  });
  const rSac = PK_RMT.evaluatePokeRoute({
    category: PK_RMT.POKE_CATEGORIES[0],
    coinsOffer: PK_RMT.pickBestFreeOffer([
      { price: 40e6, qty: 1, held: false, name: 'Psy Jynx', level: 'Nv 100', pot: 'P2', nota: 'N 3,554', seller: 'icebergue' },
    ], 5e6),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 8, qty: 1, held: false, name: 'Furious Scizor' }], 2),
    gold: 53e6,
  });

  const plan = PK_RMT.buildActionPlan({ routes: [rMShiny, rShiny, rSac], gold: 53e6, source: 'book' });
  assert.equal(plan.verdict, 'SAVE_OR_BUY');
  // Meta recomendada deve ser Frag. Shiny Stone (425M, dentro de 10% do topo de 1,66B!)
  assert.equal(plan.primary.routeId, 'shiny-frag');
  assert.equal(plan.bestOverall.routeId, 'mshiny-frag');
  // Fallback imediato deve dizer o Pokémon exato + vendedor
  assert.equal(plan.fallback.routeId, 'poke-sacrifice');
  assert.match(plan.fallback.buyText, /Psy Jynx \(Nv 100 · P2 · N 3,554\) de icebergue por 40,0M/);
  assert.match(plan.fallback.sellText, /Anuncie por 7 Gemas.*recebe 6G líq\./);
  assert.ok(plan.lossPct >= 15);
});

test('buildActionPlan decide SAVE_ONLY quando ouro não compra nenhuma rota', () => {
  const rSac = PK_RMT.evaluatePokeRoute({
    category: PK_RMT.POKE_CATEGORIES[0],
    coinsOffer: PK_RMT.pickBestFreeOffer([
      { price: 40e6, qty: 1, held: false, name: 'Psy Jynx', level: 'Nv 100', pot: 'P2', nota: 'N 3,554', seller: 'icebergue' },
    ], 5e6),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 8, qty: 1, held: false }], 2),
    gold: 10e6,
  });
  const plan = PK_RMT.buildActionPlan({ routes: [rSac], gold: 10e6, source: 'book' });
  assert.equal(plan.verdict, 'SAVE_ONLY');
  assert.ok(plan.primary.missingCoins > 30e6 && plan.primary.missingCoins < 30.2e6);
});

test('buildActionPlan escolhe melhor rota acessível pelo Coins/Gema REAL do ouro atual (evita armadilha de 25% de taxa)', () => {
  const token = PK_RMT.matchLiquidItem('Bronze Boss Token');
  const bike = PK_RMT.matchLiquidItem('Fragmento de Bicicleta');
  const rBike = PK_RMT.evaluateItemRoute({
    item: bike,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 702e6, qty: 3, held: false }], bike.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 159, qty: 3, held: false }], 2),
    gold: 53.4e6,
  });
  const rToken = PK_RMT.evaluateItemRoute({
    item: token,
    coinsOffer: PK_RMT.pickBestFreeOffer([{ price: 25.5e6, qty: 20, held: false }], token.minSanityCoins),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 4, qty: 50, held: false }], 2),
    gold: 53.4e6,
  });
  const rSac = PK_RMT.evaluatePokeRoute({
    category: PK_RMT.POKE_CATEGORIES[0],
    coinsOffer: PK_RMT.pickBestFreeOffer([
      { price: 45e6, qty: 1, held: false, name: 'Ancient Dragonite', level: 'Nv 100', pot: 'P2', nota: 'N 3,617', seller: 'Filipepdg1' },
    ], 5e6),
    gemasOffer: PK_RMT.pickBestFreeOffer([{ price: 8, qty: 1, held: false }], 2),
    gold: 53.4e6,
  });

  // No ranking teórico de lote 10x, rToken (7,50M/G) parece melhor que rSac (7,52M/G),
  // mas com 53,4M o jogador só compra 2x (51M -> 6G = 8,50M/G), perdendo para Ancient Dragonite (45,1M -> 6G = 7,52M/G)!
  const plan = PK_RMT.buildActionPlan({ routes: [rBike, rToken, rSac], gold: 53.4e6, source: 'book' });
  assert.equal(plan.verdict, 'SAVE_OR_BUY');
  assert.equal(plan.fallback.routeId, 'poke-sacrifice');
  assert.match(plan.fallback.buyText, /Ancient Dragonite/);
});
