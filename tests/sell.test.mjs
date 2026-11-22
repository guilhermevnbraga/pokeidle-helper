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

test('pokemonEligibility validates level >= 50 and nota >= 3.5 with Shiny/P5 exceptions', () => {
  assert.equal(PK_SELL.pokemonEligibility({ species: 'Hoppip', level: 20, potency: 4, nota: 0.908 }).eligible, false);
  assert.equal(PK_SELL.pokemonEligibility({ species: 'Charizard', level: 547, potency: 2, nota: 3.704 }).eligible, true);
  assert.equal(PK_SELL.pokemonEligibility({ species: 'Pikachu', level: 10, potency: 1, nota: 1.0, shiny: true }).eligible, true);
  assert.equal(PK_SELL.pokemonEligibility({ species: 'Gengar', level: 15, potency: 5, nota: 2.1 }).eligible, true);
});
