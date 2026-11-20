import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PK_BALL = require('../ball.js');

const SAMPLE_DIGLETT_ROWS = [
  ['Pokebola', 'Eficiência', 'Chance', 'Derrotas (média)', 'Preço'],
  ['Poke Ball', '×1', '0,30%', '334', '5'],
  ['Great Ball', '×2', '0,59%', '171', '20'],
  ['Super Ball', '×3', '0,88%', '114', '50'],
  ['Ultra Ball', '×4', '1,17%', '86', '130'],
  ['Beast Ball', '×8', '2,35%', '43', 'só com diamante'],
];

test('parsers de Pokedex extraem taxas, preços, 1-em-N e marcam Beast Ball como diamondOnly', () => {
  assert.ok(Math.abs(PK_BALL.parsePercent('0,59%') - 0.0059) < 1e-9);
  assert.ok(Math.abs(PK_BALL.parsePercent('1.17%') - 0.0117) < 1e-9);
  assert.ok(Math.abs(PK_BALL.parseOneInN('1 em 24.000') - (1 / 24000)) < 1e-12);
  assert.ok(Math.abs(PK_BALL.parseOneInN('1 in 12,000') - (1 / 12000)) < 1e-12);

  const balls = PK_BALL.parsePokedexBallRows(SAMPLE_DIGLETT_ROWS);
  assert.equal(balls.length, 5);
  assert.equal(balls[0].name, 'Poke Ball');
  assert.equal(balls[0].catchRate, 1);
  assert.equal(balls[0].priceGold, 5);
  assert.equal(balls[0].diamondOnly, false);

  assert.equal(balls[3].name, 'Ultra Ball');
  assert.equal(balls[3].priceGold, 130);
  assert.ok(Math.abs(balls[3].catchChance - 0.0117) < 1e-9);

  assert.equal(balls[4].name, 'Beast Ball');
  assert.equal(balls[4].diamondOnly, true);
  assert.equal(balls[4].priceGold, null);

  // Regressão: placa "Nível ao capturar" em Outland traz texto composto ("100 (teto · hunt 150)")
  assert.equal(PK_BALL.parseCaptureLevel('100 / 150'), 100);
  assert.equal(PK_BALL.parseCaptureLevel('40 (hunt 150)'), 40);
  assert.equal(PK_BALL.parseCaptureLevel('10'), 10);
  assert.equal(PK_BALL.parseCaptureLevel(150), 100);
});

test('fórmulas oficiais de recompensa por abate e venda NPC batem com sell-value.mjs e recompensa-hunt.mjs', () => {
  // Diglett Nv 10: XP por derrota = floor(6*100/10)+8 = 68
  assert.equal(PK_BALL.xpPerKillForLevel(10), 68);
  // Nv 1: base 36, alvo = round(36*1.15) = 41
  assert.equal(PK_BALL.goldKillBaseForLevel(1), 36);
  assert.equal(PK_BALL.goldPerKillForLevel(1, 0), 41);
  // Nv 5000: base âncora = 6000
  assert.equal(PK_BALL.goldKillBaseForLevel(5000), 6000);

  // Venda NPC: base * (1 + min(lvl, 100)/50) * AVG_QUALITY (~1.1769)
  assert.ok(PK_BALL.AVG_QUALITY > 1.17 && PK_BALL.AVG_QUALITY < 1.185);
  const v10 = PK_BALL.expectedNpcSellValue(200, 10);
  assert.ok(Math.abs(v10 - 200 * 1.2 * PK_BALL.AVG_QUALITY) < 1e-6);
  // Nível acima de 100 é limitado ao teto 100 (×3)
  assert.equal(PK_BALL.expectedNpcSellValue(1000, 500), PK_BALL.expectedNpcSellValue(1000, 100));
});

test('calcStrongNoteProb é determinístico, rápido e cresce com stats-base da espécie', () => {
  const pDiglett = PK_BALL.calcStrongNoteProb([10, 55, 25, 35, 45, 95]);
  const pRef = PK_BALL.calcStrongNoteProb([80, 80, 80, 80, 80, 80]);
  const pDragonite = PK_BALL.calcStrongNoteProb([91, 134, 95, 100, 100, 80]);

  assert.ok(pDiglett >= 0 && pDiglett < pRef);
  assert.ok(pRef > 0.002 && pRef < 0.004); // ~0,30%
  assert.ok(pDragonite > pRef && pDragonite < 0.006); // ~0,37%
  // Fallback sem baseStats usa referência [80..80]
  assert.equal(PK_BALL.calcStrongNoteProb(null), pRef);
});

test('extractRmtMarketData converte pisos do Radar RMT em Coins líquidos (comissão progressiva + pensão 100k)', () => {
  const rmtRoutes = [
    { id: 'bike-frag', kind: 'item', coinsPerGem: 10e6 }, // 10M Coins/Gema
    { id: 'poke-sacrifice', kind: 'pokemon', coinsPerGem: 12e6, rawBuyCoins: 20e6, sellGems: 2 },
    { id: 'poke-p5', kind: 'pokemon', coinsPerGem: 15e6, rawBuyCoins: 150e6, sellGems: 20 },
    { id: 'poke-shiny', kind: 'pokemon', coinsPerGem: 15e6, rawBuyCoins: 500e6, sellGems: 100 },
  ];
  const m = PK_BALL.extractRmtMarketData(rmtRoutes);
  assert.equal(m.hasRmtData, true);
  assert.equal(m.coinsPerGem, 10e6);
  // Sacrifício: Coins = 20M - 100k = 19.9M vs Gemas (2G -> 1G líq = 10M - 100k = 9.9M) -> 19.9M
  assert.equal(m.strongCoins, 19.9e6);
  // P5: Gemas (20G -> ceil(2.6)=3G taxa -> 17G * 10M - 100k = 169.9M) > Coins (149.9M)
  assert.equal(m.p5Coins, 169.9e6);
  // Shiny (só Gemas): 100G -> ceil(13)=13G taxa -> 87G * 10M - 100k = 869.9M
  assert.equal(m.shinyCoins, 869.9e6);

  // Regressão: cache RMT só com itens ou só poke-mega não conta como hasRmtData para pisos de captura
  const onlyItem = PK_BALL.extractRmtMarketData([{ id: 'bike-frag', kind: 'item', coinsPerGem: 10e6 }]);
  assert.equal(onlyItem.hasRmtData, false);
  assert.equal(onlyItem.hasCoinsPerGem, true);
});

test('hunt lucrativa / mid-late game com RMT recomenda Ultra Ball em todos os focos (nunca Beast Ball)', () => {
  const balls = PK_BALL.parsePokedexBallRows([
    ['Poke Ball', '×1', '0,30%', '334', '5'],
    ['Great Ball', '×2', '0,59%', '171', '20'],
    ['Super Ball', '×3', '0,88%', '114', '50'],
    ['Ultra Ball', '×4', '1,17%', '86', '130'],
    ['Beast Ball', '×8', '2,35%', '43', 'só com diamante'],
  ]);
  // Hunt Nv 150 (NPC base 12k, RMT ativo): EV por captura é altíssimo (> 100k!) -> Δp*EV >> 80 (custo marginal Ultra)
  const rmtMarket = {
    hasRmtData: true,
    coinsPerGem: 10e6,
    strongCoins: 15e6,
    p5Coins: 150e6,
    shinyCoins: 600e6,
  };
  const res = PK_BALL.analyzeHuntBalls({
    huntName: 'Dragonite',
    huntLevel: 150,
    captureLevel: 100,
    goldPerHour: 1_500_000,
    baseNpcPrice: 12_000,
    baseStats: [91, 134, 95, 100, 100, 80],
    shinyChance: 1 / 24000,
    balls,
    rmtMarket,
    focus: 'balanced',
  });

  assert.equal(res.byFocus.money.name, 'Ultra Ball');
  assert.equal(res.byFocus.balanced.name, 'Ultra Ball');
  assert.equal(res.byFocus.rare.name, 'Ultra Ball');
  assert.equal(res.recommended.name, 'Ultra Ball');
  assert.ok(res.recommended.ballProfitPerKill > 0);
  assert.ok(res.recommended.totalProfitPerHour > res.pace.goldPerHour);
  // Beast Ball existe apenas como informativa (diamondOnly)
  assert.equal(res.beastBall?.name, 'Beast Ball');
  assert.equal(res.beastBall?.diamondOnly, true);
});

test('hunt intermediária separa corretamente foco Dinheiro (lucro marginal) vs Equilibrado (maior bola lucrativa)', () => {
  const balls = PK_BALL.parsePokedexBallRows(SAMPLE_DIGLETT_ROWS);
  // Cenário construído: EV_poke ≈ 7.000 Coins (sem RMT, só NPC ~5k + shiny 0)
  // Poke: 0.003 * 7000 - 5 = +16 | Great: 0.0059 * 7000 - 20 = +21.3 | Super: 0.0088 * 7000 - 50 = +11.6 | Ultra: 0.0117 * 7000 - 130 = -48.1
  // Logo: Dinheiro = Great Ball (+21.3/kill), Equilibrado = Super Ball (ainda dá +11.6/kill de lucro líquido e tem +49% mais capturas!), Raro = Ultra Ball (hunt ainda lucra no total/h).
  const res = PK_BALL.analyzeHuntBalls({
    huntName: 'TesteMid',
    huntLevel: 80,
    captureLevel: 80,
    goldPerHour: 600_000,
    baseNpcPrice: 2300, // 2300 * 2.6 * 1.1769 ≈ 7038
    baseStats: [80, 80, 80, 80, 80, 80],
    shinyChance: 0,
    balls,
    rmtMarket: null,
    focus: 'balanced',
  });

  assert.equal(res.byFocus.money.name, 'Great Ball');
  assert.equal(res.byFocus.balanced.name, 'Super Ball');
  assert.equal(res.byFocus.rare.name, 'Ultra Ball');
  assert.ok(res.byFocus.balanced.ballProfitPerKill > 0);
  assert.ok(res.byFocus.balanced.catchChance > res.byFocus.money.catchChance);
  assert.ok(res.warnings.some(w => /Sem preços RMT/i.test(w)));
  assert.ok(res.warnings.some(w => /não possui forma Shiny/i.test(w)));
});

test('hunt inicial sem RMT (ex. Diglett Nv 10) reconhece prejuízo na captura no foco Dinheiro e protege lucro no Equilibrado', () => {
  const balls = PK_BALL.parsePokedexBallRows(SAMPLE_DIGLETT_ROWS);
  const res = PK_BALL.analyzeHuntBalls({
    huntName: 'Diglett',
    huntLevel: 10,
    captureLevel: 10,
    goldPerHour: 165_626,
    baseNpcPrice: 200,
    baseStats: [10, 55, 25, 35, 45, 95],
    shinyChance: 1 / 24000,
    balls,
    rmtMarket: null,
    focus: 'money',
  });

  // Sem RMT, EV_poke ≈ 282 Coins -> 0.30% * 282 = 0.85 < 5 Coins da Poke Ball -> foco dinheiro = Nenhuma!
  assert.equal(res.byFocus.money.id, 'none');
  assert.equal(res.recommended.id, 'none');
  // No equilibrado, Poke Ball gasta ~5 de ~117/kill (~4% do ouro/h) -> cabe nos 15% e mantém >95% do lucro!
  assert.ok(['Poke Ball', 'Great Ball'].includes(res.byFocus.balanced.name));
  assert.ok(res.byFocus.balanced.totalProfitPerHour > res.pace.goldPerHour * 0.85);
});

test('boosts de Captura (×2 com teto 10%) e Shiny Secret Lure (×2) alteram chances e EV corretamente', () => {
  const balls = [
    { name: 'Ultra Ball', catchRate: 4, catchChance: 0.06, priceGold: 130, diamondOnly: false },
  ];
  const base = PK_BALL.analyzeHuntBalls({
    huntName: 'BoostTest',
    huntLevel: 100,
    captureLevel: 100,
    goldPerHour: 1_000_000,
    baseNpcPrice: 5000,
    shinyChance: 1 / 24000,
    balls,
    rmtMarket: { hasRmtData: true, coinsPerGem: 10e6, shinyCoins: 600e6 },
  });
  const boosted = PK_BALL.analyzeHuntBalls({
    huntName: 'BoostTest',
    huntLevel: 100,
    captureLevel: 100,
    goldPerHour: 1_000_000,
    baseNpcPrice: 5000,
    shinyChance: 1 / 24000,
    balls,
    rmtMarket: { hasRmtData: true, coinsPerGem: 10e6, shinyCoins: 600e6 },
    catchBoostActive: true,
    shinyLureActive: true,
  });

  // 0.06 * 2 = 0.12 -> limitado ao teto oficial de 0.10 (10%)!
  assert.equal(boosted.options[1].catchChance, PK_BALL.CAPTURE_CAP);
  assert.equal(boosted.value.pShiny, 2 / 24000);
  assert.ok(boosted.value.evShiny > base.value.evShiny * 1.9);
  assert.ok(boosted.options[1].shiniesPerHour > base.options[1].shiniesPerHour * 3);
});

test('buildBallRestockConfig sempre aplica mínimo 10 e reposição 100 p/ bola comprável e ignora Nenhuma/diamante', () => {
  assert.equal(PK_BALL.DEFAULT_RESTOCK_MIN, 10);
  assert.equal(PK_BALL.DEFAULT_RESTOCK_BUY, 100);

  // Objeto recomendado válido
  assert.deepEqual(
    PK_BALL.buildBallRestockConfig({ id: 'great-ball', name: 'Great Ball', purchasable: true, diamondOnly: false }),
    { ball: 'Great Ball', ballMin: 10, ballBuy: 100 }
  );

  // String case-insensitive normalizada para nome canônico
  assert.deepEqual(
    PK_BALL.buildBallRestockConfig('super ball'),
    { ball: 'Super Ball', ballMin: 10, ballBuy: 100 }
  );

  // Rejeita "Nenhuma (só ouro)", Beast Ball (diamondOnly) e valores inválidos
  assert.equal(PK_BALL.buildBallRestockConfig({ id: 'none', name: 'Nenhuma (só ouro)', purchasable: true }), null);
  assert.equal(PK_BALL.buildBallRestockConfig({ id: 'beast-ball', name: 'Beast Ball', purchasable: false, diamondOnly: true }), null);
  assert.equal(PK_BALL.buildBallRestockConfig('Master Ball'), null);
  assert.equal(PK_BALL.buildBallRestockConfig(null), null);
});
