import test from 'node:test';
import assert from 'node:assert/strict';
import PK_STONES from '../stones.js';

test('isStoneItem: aceita as 17 pedras de evolução e rejeita fragmentos, tokens, casas e tickets', () => {
  assert.equal(PK_STONES.isStoneItem({ id: '23', name: 'Cocoon Stone', hasTypeChip: true }), true);
  assert.equal(PK_STONES.isStoneItem({ id: '76', name: 'Leaf Stone', hasTypeChip: false }), true);
  assert.equal(PK_STONES.isStoneItem({ id: '209', name: 'Sun Stone' }), true);
  // Jamais vende fragmentos, mesmo contendo "Stone" no nome
  assert.equal(PK_STONES.isStoneItem({ id: '70012', name: 'Fragmento de Shiny Stone', hasTypeChip: false }), false);
  assert.equal(PK_STONES.isStoneItem({ id: '70014', name: 'Fragmento de MEGA Stone', hasTypeChip: true }), false);
  assert.equal(PK_STONES.isStoneItem({ id: '70015', name: 'Shiny Stone Fragment', hasTypeChip: false }), false);
  assert.equal(PK_STONES.isStoneItem({ id: '70000', name: 'Bronze Boss Token', hasTypeChip: false }), false);
  assert.equal(PK_STONES.isStoneItem({ id: '70013', name: 'Fragmento de Bicicleta', hasTypeChip: false }), false);
  assert.equal(PK_STONES.isStoneItem({ id: '70040', name: 'Casa Comum', hasTypeChip: false }), false);
  // Catálogo dinâmico da aba Pedras inclui pedra futura
  const dyn = new Set(['2', '999']);
  assert.equal(PK_STONES.isStoneItem({ id: '999', name: 'Fairy Stone', hasTypeChip: true, stoneIds: dyn }), true);
  assert.equal(PK_STONES.isStoneItem({ id: '70000', name: 'Bronze Boss Token', hasTypeChip: false, stoneIds: dyn }), false);
});

test('parseAvg7d: extrai média e volume em PT e EN', () => {
  assert.deepEqual(
    PK_STONES.parseAvg7d('Preço médio vendido nos últimos 7 dias: 107.786 /un. · 197.716 un. vendidas'),
    { avg7d: 107786, vol7d: 197716 },
  );
  assert.deepEqual(
    PK_STONES.parseAvg7d('Preço médio vendido nos últimos 7 dias: 20.561/un. · 4.944.791 un. vendidas'),
    { avg7d: 20561, vol7d: 4944791 },
  );
  assert.deepEqual(
    PK_STONES.parseAvg7d('Average sold price last 7 days: 89,565/ea · 899,500 units sold'),
    { avg7d: 89565, vol7d: 899500 },
  );
  assert.deepEqual(PK_STONES.parseAvg7d(''), { avg7d: null, vol7d: null });
});

test('parseHistoryRow: calcula preço unitário em Coins e descarta Gemas', () => {
  const leaf = PK_STONES.parseHistoryRow({ itemText: '219× Leaf Stone', valueText: '16.994.400', isOrb: false });
  assert.deepEqual(leaf, {
    name: 'Leaf Stone',
    normName: 'leaf stone',
    qty: 219,
    totalCoins: 16994400,
    unitPrice: 77600,
  });
  const rock = PK_STONES.parseHistoryRow({ itemText: '4× Rock Stone', valueText: '472.000', isOrb: false });
  assert.equal(rock.unitPrice, 118000);
  // Gemas sempre ignoradas
  assert.equal(PK_STONES.parseHistoryRow({ itemText: '1× Ancient Stone', valueText: '30', isOrb: true }), null);
});

test('summarizeProvenSales: filtra transfers P2P isolados e preserva altas reais', () => {
  const res = PK_STONES.summarizeProvenSales([
    { qty: 63, totalCoins: 4449312, unitPrice: 70624 },
    { qty: 4, totalCoins: 472000, unitPrice: 118000 }, // alta real (~1.67x média 70.627)
    { qty: 1, totalCoins: 5000000, unitPrice: 5000000 }, // transfer P2P óbvio!
    { qty: 1, totalCoins: 150000, unitPrice: 150000 }, // 1x > 1.85x média -> descartado
  ], { avg7d: 70627 });
  assert.equal(res.validCount, 2);
  assert.equal(res.maxProven, 118000);
  assert.equal(res.discarded, 2);
});

test('chooseStonePrice: 5 casos reais do mercado ao vivo (ignora retidos, vence livre, limita ao máximo comprovado)', () => {
  // 1. Cocoon Stone: retidos a 9.603/9.900, livre a 20.552, média 20.561 -> deve anunciar 20.551 (não 9.900!)
  const cocoon = PK_STONES.chooseStonePrice({
    id: '23', name: 'Cocoon Stone', qty: 89, avg7d: 20561, vol7d: 4944791,
    offers: [
      { price: 9603, qty: 1, held: true },
      { price: 9900, qty: 1114, held: true },
      { price: 20551, qty: 39, held: true },
      { price: 20552, qty: 5, held: false },
      { price: 21515, qty: 126, held: false },
    ],
    recentSales: [{ qty: 1000, totalCoins: 10000000, unitPrice: 10000 }],
  });
  assert.equal(cocoon.action, 'sell');
  assert.equal(cocoon.price, 20551);
  assert.equal(cocoon.gross, 89 * 20551);
  assert.equal(cocoon.fee, Math.ceil(89 * 20551 * 0.15));

  // 2. Earth Stone: retido troll 10.000, livre 55.078, média 54.998, venda recente 59.997 -> 55.077
  const earth = PK_STONES.chooseStonePrice({
    id: '40', name: 'Earth Stone', qty: 20, avg7d: 54998,
    offers: [
      { price: 10000, qty: 22, held: true },
      { price: 54998, qty: 138, held: true },
      { price: 55078, qty: 16, held: false },
    ],
    recentSales: [{ qty: 1, totalCoins: 59997, unitPrice: 59997 }],
  });
  assert.equal(earth.action, 'sell');
  assert.equal(earth.price, 55077);

  // 3. Leaf Stone: livre 80.932 abaixo da média 89.565 -> 80.931 (1º da fila real)
  const leaf = PK_STONES.chooseStonePrice({
    id: '76', name: 'Leaf Stone', qty: 2, avg7d: 89565,
    offers: [
      { price: 77599, qty: 4, held: true },
      { price: 80932, qty: 6, held: false },
      { price: 80933, qty: 338, held: false },
    ],
    recentSales: [{ qty: 1, totalCoins: 80933, unitPrice: 80933 }],
  });
  assert.equal(leaf.action, 'sell');
  assert.equal(leaf.price, 80931);
  // Comissão oficial confirmada no DOM: 2 × 80.931 = 161.862 -> taxa 24.280 -> líquido 137.582
  assert.equal(leaf.gross, 161862);
  assert.equal(leaf.fee, 24280);
  assert.equal(leaf.net, 137582);

  // 4. Metal Stone: retidos 32.930/33.948, livre 35.245, média 35.521 -> 35.244
  const metal = PK_STONES.chooseStonePrice({
    id: '87', name: 'Metal Stone', qty: 91, avg7d: 35521,
    offers: [
      { price: 32930, qty: 1076, held: true },
      { price: 35245, qty: 323, held: false },
      { price: 35354, qty: 2277, held: false },
    ],
    recentSales: [{ qty: 1701, totalCoins: 57745548, unitPrice: 33948 }],
  });
  assert.equal(metal.action, 'sell');
  assert.equal(metal.price, 35244);

  // 5. Rock Stone: book livre inflado em 132.659, média 70.627, vendas recentes comprovadas a 118.000 -> limita a 118.000
  const rock = PK_STONES.chooseStonePrice({
    id: '109', name: 'Rock Stone', qty: 15, avg7d: 70627,
    offers: [
      { price: 20000, qty: 17, held: true },
      { price: 132659, qty: 535, held: false },
    ],
    recentSales: [
      { qty: 63, totalCoins: 4449312, unitPrice: 70624 },
      { qty: 4, totalCoins: 472000, unitPrice: 118000 },
    ],
  });
  assert.equal(rock.action, 'sell');
  assert.equal(rock.price, 118000);
  assert.equal(rock.provenCeiling, 118000);
});

test('chooseStonePrice: pula micro-isca livre e protege contra dump maciço não confirmado', () => {
  // Micro-isca livre de 1 un. por 10k antes de parede normal a 80k -> ignora a isca e mira 79.999
  const bait = PK_STONES.chooseStonePrice({
    id: '53', name: 'Fire Stone', qty: 10, avg7d: 95000,
    offers: [
      { price: 10000, qty: 1, held: false },
      { price: 80000, qty: 200, held: false },
    ],
  });
  assert.equal(bait.action, 'sell');
  assert.equal(bait.price, 79999);

  // Micro-isca real de 1 un. a 17.999 (~87% do nível seguinte 20.552) -> ignora e mira 20.551
  const baitReal = PK_STONES.chooseStonePrice({
    id: '23', name: 'Cocoon Stone', qty: 89, avg7d: 20559,
    offers: [
      { price: 17999, qty: 1, held: false },
      { price: 20552, qty: 120, held: false },
    ],
  });
  assert.equal(baitReal.action, 'sell');
  assert.equal(baitReal.price, 20551);

  // Parede gigante (500 un.) livre a 20k quando média é 95k e sem vendas recentes confirmando -> pula por segurança
  const dump = PK_STONES.chooseStonePrice({
    id: '53', name: 'Fire Stone', qty: 10, avg7d: 95000,
    offers: [
      { price: 20000, qty: 500, held: false },
    ],
    recentSales: [],
  });
  assert.equal(dump.action, 'skip');
  assert.match(dump.source, /anti-dump/);

  // Se o mercado realmente caiu (vendas recentes confirmando 30k), vende normalmente
  const realCrash = PK_STONES.chooseStonePrice({
    id: '53', name: 'Fire Stone', qty: 10, avg7d: 95000,
    offers: [
      { price: 30000, qty: 500, held: false },
    ],
    recentSales: [{ qty: 200, totalCoins: 6000000, unitPrice: 30000 }],
  });
  assert.equal(realCrash.action, 'sell');
  assert.equal(realCrash.price, 29999);
});

test('chooseStonePrice: quando todo o book está retido, usa teto comprovado e respeita mínimo 2 Coins', () => {
  const allHeld = PK_STONES.chooseStonePrice({
    id: '133', name: 'Thunder Stone', qty: 5, avg7d: 130000,
    offers: [
      { price: 90000, qty: 10, held: true },
      { price: 120000, qty: 50, held: true },
    ],
    recentSales: [],
  });
  assert.equal(allHeld.action, 'sell');
  assert.equal(allHeld.price, 130000);

  const minFloor = PK_STONES.chooseStonePrice({
    id: '23', name: 'Cocoon Stone', qty: 3, avg7d: 2,
    offers: [{ price: 2, qty: 100, held: false }],
  });
  assert.equal(minFloor.action, 'sell');
  assert.equal(minFloor.price, 2);
});
