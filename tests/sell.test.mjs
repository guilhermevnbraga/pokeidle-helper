import test from 'node:test';
import assert from 'node:assert/strict';
import PK_SELL from '../sell.js';

test('netGold applies 15% ceil commission for items and pokemons', () => {
  const r1 = PK_SELL.netGold(50000, 10);
  assert.equal(r1.gross, 500000);
  assert.equal(r1.fee, 75000);
  assert.equal(r1.net, 425000);

  // Arredonda para cima
  const r2 = PK_SELL.netGold(2, 7);
  assert.equal(r2.gross, 14);
  assert.equal(r2.fee, 3); // ceil(2.1) = 3
  assert.equal(r2.net, 11);
});

test('netGems applies flat 15% for items and progressive 13%/10%/7.5% for pokemons', () => {
  // Item em Gemas: 15% plano com Math.ceil
  const itSmall = PK_SELL.netGems(4, 1, 'item');
  assert.equal(itSmall.fee, 1); // ceil(0.6) = 1 -> 25% efetivo
  assert.equal(itSmall.net, 3);
  assert.equal(itSmall.effPct, 25);

  const itLot = PK_SELL.netGems(4, 10, 'item');
  assert.equal(itLot.fee, 6); // ceil(6) = 6 -> 15%
  assert.equal(itLot.net, 34);

  // Pokémon em Gemas: faixa 1 (<= 500): 13%
  const pk500 = PK_SELL.netGems(500, 1, 'pokemon');
  assert.equal(pk500.fee, 65);
  assert.equal(pk500.net, 435);

  // Pokémon em Gemas: faixa 2 (501..5000): 500*13% + 500*10% = 65 + 50 = 115
  const pk1000 = PK_SELL.netGems(1000, 1, 'pokemon');
  assert.equal(pk1000.fee, 115);
  assert.equal(pk1000.net, 885);

  // Pokémon em Gemas: faixa 3 (> 5000): 500*13% + 4500*10% + 1000*7.5% = 65 + 450 + 75 = 590
  const pk6000 = PK_SELL.netGems(6000, 1, 'pokemon');
  assert.equal(pk6000.fee, 590);
  assert.equal(pk6000.net, 5410);
});

test('parseItemHistoryRow and parsePokemonHistoryRow parse Coins and Gems rows accurately', () => {
  const itG = PK_SELL.parseItemHistoryRow({ itemText: '36× Bronze Boss Token', valueText: '180', isOrb: true });
  assert.equal(itG.currency, 'gem');
  assert.equal(itG.qty, 36);
  assert.equal(itG.unitPrice, 5);
  assert.equal(itG.name, 'Bronze Boss Token');

  const itC = PK_SELL.parseItemHistoryRow({ itemText: '10× Earth Stone', valueText: '500.000', isOrb: false });
  assert.equal(itC.currency, 'gold');
  assert.equal(itC.unitPrice, 50000);

  const pk = PK_SELL.parsePokemonHistoryRow({
    itemTitle: 'Brave Charizard Nv 100 · Ver ficha',
    itemText: 'Brave Charizard Nv 100P5IV 112Q 1,021N 4,174',
    valueText: '200.000.000',
    isOrb: false,
  });
  assert.equal(pk.species, 'Brave Charizard');
  assert.equal(pk.level, 100);
  assert.equal(pk.potency, 5);
  assert.equal(pk.iv, 112);
  assert.equal(pk.quality, 1.021);
  assert.equal(pk.nota, 4.174);
  assert.equal(pk.price, 200000000);
  assert.equal(pk.currency, 'gold');
});

test('analyzeItemSale picks Gold or Gems accurately based on RMT exchange rate', () => {
  const exchangeRate = { coinsPerGem: 3500000, source: 'radar-book', label: 'Bronze Boss Token' };

  // Cenário 1: Bronze Boss Token x10: Gold livre 14M (140M bruto -> 119M líq.), Gemas livre 6G (5G x10 = 50G -> 42G líq. ≈ 147M Coins) -> Gemas vence (+24%)
  const resGems = PK_SELL.analyzeItemSale({
    name: 'Bronze Boss Token',
    qty: 10,
    goldBook: {
      avg7d: 14500000,
      vol7d: 800,
      offers: [{ price: 14000000, qty: 20, held: false, own: false }],
    },
    gemBook: {
      avg7d: 5,
      vol7d: 500,
      offers: [{ price: 6, qty: 30, held: false, own: false }],
    },
    exchangeRate,
  });
  assert.equal(resGems.bestCurrency, 'gem');
  assert.equal(resGems.gem.unitPrice, 5);
  assert.equal(resGems.gem.net, 42); // 50 - ceil(7.5=8) = 42
  assert.ok(resGems.advantagePct >= 20);
  assert.match(resGems.headline, /GEMAS/i);

  // Cenário 2: Earth Stone x10: Gold 50k/un -> 425k líq.; Gemas 2G/un -> 17G líq. (≈ 59.5M) — mas se Gemas não tem demanda real e só Gold paga mais por gema:
  // Mega Stone Fragment x1: Gold 420M (357M líq.) vs Gemas 100G (85G líq. ≈ 297.5M Coins) -> Gold vence (+20%)
  const resGold = PK_SELL.analyzeItemSale({
    name: 'Mega Stone Fragment',
    qty: 1,
    goldBook: {
      avg7d: 430000000,
      vol7d: 50,
      offers: [{ price: 420000001, qty: 5, held: false, own: false }],
    },
    gemBook: {
      avg7d: 100,
      vol7d: 40,
      offers: [{ price: 101, qty: 5, held: false, own: false }],
    },
    exchangeRate,
  });
  assert.equal(resGold.bestCurrency, 'gold');
  assert.equal(resGold.gold.unitPrice, 420000000);
  assert.equal(resGold.gem.unitPrice, 100);
  assert.ok(resGold.advantagePct >= 15);
  assert.match(resGold.headline, /GOLD/i);
});

test('analyzeItemSale skips micro-bait offers and flags small-lot gem rounding tax', () => {
  const res = PK_SELL.analyzeItemSale({
    name: 'Bronze Boss Token',
    qty: 1,
    goldBook: {
      avg7d: 15000000,
      vol7d: 200,
      offers: [
        { price: 1000000, qty: 1, held: false, own: false }, // micro-isca
        { price: 15000000, qty: 30, held: false, own: false },
      ],
    },
    gemBook: {
      avg7d: 4,
      vol7d: 100,
      offers: [{ price: 4, qty: 20, held: false, own: false }],
    },
    exchangeRate: { coinsPerGem: 3500000, source: 'radar-book', label: 'RMT' },
  });
  assert.equal(res.gold.unitPrice, 14999999);
  assert.equal(res.gem.unitPrice, 4); // < 5G não dá undercut
  assert.ok(res.gem.warnings.some(w => /taxa efetiva 25%/i.test(w)));
});

test('analyzePokemonSale enforces Shiny gems-only rule and matches comparable pokemons', () => {
  const shinyPk = { species: 'Nincada', level: 100, potency: 1, nota: 4.5, shiny: true, mega: false };
  const resShiny = PK_SELL.analyzePokemonSale({
    pokemon: shinyPk,
    goldListings: [{ species: 'Nincada', level: 100, potency: 1, nota: 4.5, shiny: false, price: 30000000 }],
    gemListings: [
      { species: 'Nincada', level: 100, potency: 1, nota: 4.6, shiny: true, price: 300 },
      { species: 'Nincada', level: 100, potency: 2, nota: 4.4, shiny: true, price: 320 },
    ],
    gemSales: [
      { species: 'Nincada', level: 100, potency: 1, nota: 4.5, shiny: true, price: 290 },
    ],
    exchangeRate: { coinsPerGem: 4000000, source: 'radar-book', label: 'RMT' },
  });
  assert.equal(resShiny.bestCurrency, 'gem');
  assert.equal(resShiny.gold.available, false);
  assert.match(resShiny.gold.blockedReason, /Shiny/i);
  assert.equal(resShiny.gem.available, true);
  assert.equal(resShiny.gem.unitPrice, 299); // 1 abaixo do menor anúncio similar (300 <= 290*1.15)
  assert.equal(resShiny.gem.net, 260); // 299 - ceil(299*0.13=38.87=39) = 260
});

test('analyzePokemonSale compares Gold vs Gems for non-shiny pokemon without mixing P5 and non-P5', () => {
  const pk = { species: 'Charizard', level: 547, potency: 2, nota: 3.704, shiny: false, mega: false };
  const res = PK_SELL.analyzePokemonSale({
    pokemon: pk,
    goldListings: [
      { species: 'Charizard', level: 100, potency: 2, nota: 3.70, shiny: false, price: 32000000 }, // Nv 100 ignorado p/ Nv 547
      { species: 'Charizard', level: 500, potency: 5, nota: 4.2, shiny: false, price: 900000000 }, // P5 ignorado
      { species: 'Charizard', level: 520, potency: 2, nota: 3.72, shiny: false, price: 180000000 },
    ],
    goldSales: [
      { species: 'Charizard', level: 100, potency: 2, nota: 3.70, shiny: false, price: 30000000 }, // Nv 100 ignorado
      { species: 'Charizard', level: 550, potency: 2, nota: 3.70, shiny: false, price: 175000000 },
    ],
    gemListings: [
      { species: 'Charizard', level: 100, potency: 2, nota: 3.70, shiny: false, price: 6 }, // Nv 100 ignorado
      { species: 'Charizard', level: 500, potency: 2, nota: 3.75, shiny: false, price: 80 },
    ],
    gemSales: [
      { species: 'Charizard', level: 600, potency: 2, nota: 3.75, shiny: false, price: 75 },
    ],
    exchangeRate: { coinsPerGem: 4000000, source: 'radar-book', label: 'RMT' },
  });
  // Gold: ~179.1M bruto -> ~152.2M líq.
  // Gemas: 79G bruto -> 79 - ceil(10.27=11) = 68G líq. ≈ 272M Coins -> Gemas muito melhor!
  assert.equal(res.bestCurrency, 'gem');
  assert.equal(res.gold.comparableListings, 1); // Nv 100 e P5 não contaminaram
  assert.equal(res.gem.comparableListings, 1); // Nv 100 (6G) não puxou preço p/ baixo
  assert.equal(res.gem.unitPrice, 79);
  assert.equal(res.gem.net, 68);
  assert.ok(res.advantagePct >= 70);
});

test('compareSaleOptions detects technical tie within 3% and falls back gracefully without exchange rate', () => {
  const goldEval = { currency: 'gold', available: true, unitPrice: 100000000, gross: 100000000, fee: 15000000, net: 85000000, confidence: 'high', provenCount: 5, warnings: [] };
  const gemEval = { currency: 'gem', available: true, unitPrice: 25, gross: 25, fee: 4, net: 21, confidence: 'medium', provenCount: 1, warnings: [] };
  // 21G * 4.05M = 85.05M vs 85M -> < 0.1% diff => tie
  const tie = PK_SELL.compareSaleOptions({
    kind: 'item',
    name: 'Teste',
    qty: 1,
    goldEval,
    gemEval,
    exchangeRate: { coinsPerGem: 4050000, source: 'radar-book', label: 'RMT' },
  });
  assert.equal(tie.bestCurrency, 'tie');
  assert.match(tie.headline, /EMPATE/i);
  assert.match(tie.headline, /Gold/i);

  const noRate = PK_SELL.compareSaleOptions({
    kind: 'item',
    name: 'Teste',
    qty: 1,
    goldEval,
    gemEval,
    exchangeRate: null,
  });
  assert.equal(noRate.bestCurrency, 'tie');
  assert.ok(noRate.warnings.some(w => /Radar RMT/i.test(w)));
});

test('compareSaleOptions: book suspeito (muito abaixo da média 7d) nunca vence a comparação de moedas', () => {
  const goldEval = { currency: 'gold', available: true, unitPrice: 75009, gross: 10350000, fee: 1550000, net: 8800000, confidence: 'high', provenCount: 1, warnings: [], suspect: false };
  const gemEval = { currency: 'gem', available: true, unitPrice: 2, gross: 276, fee: 42, net: 234, confidence: 'high', provenCount: 0, warnings: ['book muito abaixo da média 7d (2 vs 58)'], suspect: true };
  const r = PK_SELL.compareSaleOptions({ kind: 'item', name: 'Darkness Stone', qty: 138, goldEval, gemEval, exchangeRate: { coinsPerGem: 5700000 } });
  assert.equal(r.bestCurrency, 'gold');
  assert.match(r.headline, /suspeito/i);
  assert.equal(r.advantagePct, 0);
  const r2 = PK_SELL.compareSaleOptions({ kind: 'item', name: 'X', qty: 1, goldEval: { ...goldEval, suspect: true }, gemEval: { ...gemEval, suspect: false }, exchangeRate: { coinsPerGem: 5700000 } });
  assert.equal(r2.bestCurrency, 'gem');
});

test('pokemonEligibility validates level >= 50 and nota >= 3.5 with Shiny/P5 exceptions', () => {
  assert.equal(PK_SELL.pokemonEligibility({ species: 'Hoppip', level: 20, potency: 4, nota: 0.908 }).eligible, false);
  assert.equal(PK_SELL.pokemonEligibility({ species: 'Charizard', level: 547, potency: 2, nota: 3.704 }).eligible, true);
  assert.equal(PK_SELL.pokemonEligibility({ species: 'Pikachu', level: 10, potency: 1, nota: 1.0, shiny: true }).eligible, true);
  assert.equal(PK_SELL.pokemonEligibility({ species: 'Gengar', level: 15, potency: 5, nota: 2.1 }).eligible, true);
});

test('cleanSpeciesName strips shiny marks and +N badges in any order', () => {
  assert.equal(PK_SELL.cleanSpeciesName('✨ Shiny Shedinja'), 'Shedinja');
  assert.equal(PK_SELL.cleanSpeciesName('Shiny Shedinja'), 'Shedinja');
  assert.equal(PK_SELL.cleanSpeciesName('Shedinja ✨'), 'Shedinja');
  assert.equal(PK_SELL.cleanSpeciesName('Shedinja +5'), 'Shedinja');
  assert.equal(PK_SELL.cleanSpeciesName('Mega Charizard X'), 'Mega Charizard X');
});

test('shiny target matches shiny comps once species is cleaned', () => {
  const target = { species: PK_SELL.cleanSpeciesName('✨ Shiny Shedinja'), shiny: true, potency: 1, nota: 4.89, level: 100 };
  const comp = { species: 'Shedinja', shiny: true, potency: 1, nota: 4.635, level: 100, price: 299 };
  assert.ok(PK_SELL.scoreComparablePokemon(target, comp) > 0);
});

// ---------- Modelo de preço máximo viável ----------
const NOW = new Date(2026, 10, 25, 20, 0).getTime();
const dAgo = d => NOW - d * 86400000;
const shedTarget = { species: 'Shedinja', shiny: true, potency: 1, nota: 4.89, level: 100, mega: false };
const mkSale = (price, nota, daysAgo, extra = {}) => ({ species: 'Shedinja', shiny: true, potency: 1, nota, level: 100, price, ts: dAgo(daysAgo), ...extra });
const mkList = (price, nota, extra = {}) => ({ species: 'Shedinja', shiny: true, potency: 1, nota, level: 100, price, ...extra });

test('parseHistDate reads dd/mm/yyyy, hh:mm from the game history', () => {
  const t = PK_SELL.parseHistDate('25/11/2026, 18:02');
  const d = new Date(t);
  assert.equal(d.getDate(), 25);
  assert.equal(d.getMonth(), 10);
  assert.equal(d.getHours(), 18);
  assert.equal(PK_SELL.parseHistDate('sem data'), null);
});

test('parsePokemonHistoryRow keeps the sale timestamp and strips shiny from species', () => {
  const r = PK_SELL.parsePokemonHistoryRow({
    itemText: '✨Shiny Shedinja Nv 100P2IV 123Q 0,868N 4,566', valueText: '269', isOrb: true, dateText: '25/11/2026, 18:02',
  });
  assert.equal(r.species, 'Shedinja');
  assert.equal(r.shiny, true);
  assert.equal(r.currency, 'gem');
  assert.ok(Number.isFinite(r.ts));
});

test('max viable price: tiers are ordered and never exceed the twice-proven cap', () => {
  const sales = [
    mkSale(269, 4.57, 0.1), mkSale(200, 4.57, 0.5), mkSale(648, 6.38, 1), mkSale(800, 6.38, 2),
    mkSale(500, 5.2, 4), mkSale(350, 4.8, 6), mkSale(420, 5.0, 9), mkSale(300, 4.6, 14),
  ];
  const listings = [mkList(299, 4.6), mkList(450, 5.2), mkList(550, 5.9), mkList(573, 4.8), mkList(600, 4.9)];
  const ev = PK_SELL.evaluatePokemonCurrency({ pokemon: shedTarget, currency: 'gem', listings, sales, salesExhausted: true, now: NOW });
  const t = ev.tiers;
  assert.ok(t.quick.price <= t.market.price && t.market.price <= t.max.price);
  assert.ok(t.max.price <= t.provenCap.price || t.max.price === t.quick.price);
  assert.equal(ev.unitPrice, t.max.price);
  assert.ok(ev.comparables.length > 0 && ev.comparables.length <= 8);
});

test('max viable price: fewer than 3 comparable sales falls back to the conservative quick price', () => {
  const ev = PK_SELL.evaluatePokemonCurrency({
    pokemon: shedTarget, currency: 'gem',
    listings: [mkList(299, 4.6), mkList(450, 5.2)],
    sales: [mkSale(280, 4.7, 1), mkSale(900, 5.0, 2)],
    salesExhausted: true, now: NOW,
  });
  assert.equal(ev.unitPrice, ev.quickPrice);
  assert.ok(ev.warnings.some(w => /menos de 3 vendas/.test(w)));
});

test('better attributes never lower the suggested price (monotonic in nota)', () => {
  const sales = [
    mkSale(200, 4.2, 1), mkSale(260, 4.5, 2), mkSale(320, 4.9, 3), mkSale(400, 5.4, 4),
    mkSale(480, 5.8, 5), mkSale(560, 6.2, 6), mkSale(300, 4.7, 7), mkSale(450, 5.6, 8),
  ];
  const listings = [mkList(350, 4.9), mkList(480, 5.5), mkList(620, 6.0)];
  const price = nota => PK_SELL.evaluatePokemonCurrency({
    pokemon: { ...shedTarget, nota }, currency: 'gem', listings, sales, salesExhausted: true, now: NOW,
  }).unitPrice;
  assert.ok(price(6.0) >= price(5.0));
  assert.ok(price(5.0) >= price(4.2));
});

test('queue of cheaper comparable listings holds the price below the proven cap in a slow market', () => {
  // Mercado lento (4 vendas em 30d) e 8 anúncios mais baratos à frente: não dá para pedir o teto.
  const sales = [mkSale(900, 4.9, 3), mkSale(880, 4.9, 10), mkSale(500, 4.9, 20), mkSale(450, 4.9, 25)];
  const listings = Array.from({ length: 8 }, (_, i) => mkList(300 + i * 10, 4.9));
  const ev = PK_SELL.evaluatePokemonCurrency({ pokemon: shedTarget, currency: 'gem', listings, sales, salesExhausted: true, now: NOW });
  assert.ok(ev.tiers.max.price < 880);
});

test('fitAttributeSlopes stays at zero with too few points and never returns negative slopes', () => {
  const few = PK_SELL.fitAttributeSlopes([{ price: 100, nota: 4, level: 100, w: 1 }], shedTarget);
  assert.equal(few.bN, 0);
  const inverted = Array.from({ length: 8 }, (_, i) => ({ price: 600 - i * 50, nota: 4 + i * 0.3, level: 100, w: 1 }));
  const s = PK_SELL.fitAttributeSlopes(inverted, shedTarget);
  assert.ok(s.bN >= 0 && s.bL >= 0);
});

test('timing flags WAIT when the last 7d sold well below the 30d median', () => {
  const sales = [
    mkSale(150, 4.9, 1), mkSale(160, 4.9, 3), mkSale(400, 4.9, 10), mkSale(420, 4.9, 15),
    mkSale(410, 4.9, 20), mkSale(430, 4.9, 25),
  ];
  const ev = PK_SELL.evaluatePokemonCurrency({ pokemon: shedTarget, currency: 'gem', listings: [mkList(500, 4.9)], sales, salesExhausted: true, now: NOW });
  assert.equal(ev.timing.verdict, 'WAIT');
});

test('two outlier sales do not set the price when only a tiny share of sales reaches that level', () => {
  const sales = [
    ...Array.from({ length: 20 }, (_, i) => mkSale(380 + (i % 5) * 20, 4.9, 1 + i)),
    mkSale(900, 4.9, 2), mkSale(880, 4.9, 3),
  ];
  const listings = [mkList(430, 4.9), mkList(450, 4.9), mkList(470, 4.9)];
  const ev = PK_SELL.evaluatePokemonCurrency({ pokemon: shedTarget, currency: 'gem', listings, sales, salesExhausted: true, now: NOW });
  assert.ok(ev.tiers.max.price < 700, `max ${ev.tiers.max.price}`);
});

test('a price level reached by a large share of sales is recommended above the median', () => {
  const sales = [
    ...Array.from({ length: 10 }, (_, i) => mkSale(300, 4.9, 1 + i)),
    ...Array.from({ length: 10 }, (_, i) => mkSale(600, 4.9, 1 + i * 2)),
  ];
  const ev = PK_SELL.evaluatePokemonCurrency({ pokemon: shedTarget, currency: 'gem', listings: [], sales, salesExhausted: true, now: NOW });
  assert.ok(ev.tiers.max.price >= 590, `max ${ev.tiers.max.price}`);
});

test('potency enters the attribute model: higher potency comps never lower the target price and slopes stay bounded', () => {
  const pts = Array.from({ length: 12 }, (_, i) => ({ price: 200 + (i % 4) * 120, nota: 4.9, level: 100, potency: 1 + (i % 4), w: 1 }));
  const s = PK_SELL.fitAttributeSlopes(pts, { ...shedTarget, potency: 2 });
  assert.ok(s.bP > 0 && s.bP <= 0.5);
  assert.ok(s.bN >= 0 && s.bN <= 1.0 && s.bL >= 0);
  const noP = PK_SELL.fitAttributeSlopes(pts, { ...shedTarget, potency: 5 });
  assert.equal(noP.bP, 0);
});

test('recommended price must be reached by at least 15% of comparable sales, not just two lucky ones', () => {
  // 25 vendas: 2 a 600, o resto 250-330. Duas vendas (8%) não sustentam 600.
  const sales = [
    mkSale(600, 4.9, 0.5), mkSale(590, 4.9, 1),
    ...Array.from({ length: 23 }, (_, i) => mkSale(250 + (i % 5) * 20, 4.9, 0.2 + i * 0.3)),
  ];
  const ev = PK_SELL.evaluatePokemonCurrency({ pokemon: shedTarget, currency: 'gem', listings: [], sales, salesExhausted: true, now: NOW });
  assert.ok(ev.tiers.max.price < 400, `max ${ev.tiers.max.price}`);
});
