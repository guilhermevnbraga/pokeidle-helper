import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PK_TYPES = require('../types.js');
const PK_HUNT = require('../hunt.js');

test('normalizeHuntName extrai nome limpo de HUD, Outland e title do marcador', () => {
  assert.equal(PK_HUNT.normalizeHuntName('Geodude · nível 1'), 'geodude');
  assert.equal(PK_HUNT.normalizeHuntName('Geodude · Outland 2 · nível 100'), 'geodude');
  assert.equal(PK_HUNT.normalizeHuntName('Mr. Mime — nível 40\nMr. Mime, Abra'), 'mr. mime');
  assert.equal(PK_HUNT.normalizeHuntName('  Pidgey  '), 'pidgey');
  assert.equal(PK_HUNT.normalizeHuntName(''), '');
});

test('isSameHunt exige estar em campo e prioriza slug sobre nome', () => {
  assert.equal(PK_HUNT.isSameHunt({ inHunt: true, curSlug: 'geodude', curName: 'geodude', targetSlug: 'geodude', targetName: 'geodude' }), true);
  assert.equal(PK_HUNT.isSameHunt({ inHunt: true, curSlug: 'geodude-kanto', curName: 'geodude', targetSlug: 'geodude-outland', targetName: 'geodude' }), false);
  // No Centro Pokémon, mesmo que o marcador anterior ainda tenha `.on`, não estamos na hunt
  assert.equal(PK_HUNT.isSameHunt({ inHunt: false, curSlug: 'geodude', curName: 'centro pokemon', targetSlug: 'geodude', targetName: 'geodude' }), false);
  // Fallback por nome quando curSlug não está disponível
  assert.equal(PK_HUNT.isSameHunt({ inHunt: true, curSlug: null, curName: 'Geodude · nível 1', targetSlug: 'geodude', targetName: 'Geodude' }), true);
  assert.equal(PK_HUNT.isSameHunt({ inHunt: true, curSlug: null, curName: 'Geodude · nível 1', targetSlug: 'onix', targetName: 'Onix' }), false);
});

test('pickBestHunt nunca manda trocar para o mapa em que o jogador já está (inclusive se nenhuma hunt for ok)', () => {
  // Caso 1: já está na melhor hunt e ela é ok
  const d1 = PK_HUNT.pickBestHunt({
    hunts: {
      caterpie: { xp: 1000, gold: 100, types: ['BUG'], nome: 'caterpie' },
      geodude: { xp: 800, gold: 100, types: ['ROCK', 'GROUND'], nome: 'geodude' },
    },
    myTypes: ['FIRE'],
    curSlug: 'caterpie',
    curName: 'caterpie',
    inHunt: true,
    minRatio: 0.5,
    huntGain: 1.1,
    matchupFn: PK_TYPES.matchup,
  });
  assert.equal(d1.action, 'stay');
  assert.equal(d1.reason, 'already-best');

  // Caso 2 (regressão do bug antigo): todas as hunts têm ratio < minRatio, mas a melhor do fallback já é a atual
  const d2 = PK_HUNT.pickBestHunt({
    hunts: {
      squirtle: { xp: 2000, gold: 100, types: ['WATER'], nome: 'squirtle' },
      geodude: { xp: 500, gold: 100, types: ['ROCK', 'GROUND'], nome: 'geodude' },
    },
    myTypes: ['FIRE'],
    curSlug: 'squirtle',
    curName: 'squirtle',
    inHunt: true,
    minRatio: 0.5,
    huntGain: 1.1,
    matchupFn: PK_TYPES.matchup,
  });
  assert.equal(d2.best.slug, 'squirtle');
  assert.equal(d2.action, 'stay');
  assert.equal(d2.reason, 'already-best');
});

test('pickBestHunt respeita limiar huntGain, troca quando há ganho e entra na hunt ao partir do Centro Pokémon', () => {
  const hunts = {
    pidgey: { xp: 1000, gold: 100, types: ['NORMAL', 'FLYING'], nome: 'pidgey' },
    rattata: { xp: 1050, gold: 100, types: ['NORMAL'], nome: 'rattata' },
    caterpie: { xp: 1500, gold: 100, types: ['BUG'], nome: 'caterpie' },
  };

  // Sem ganho >10%: fica em pidgey vs rattata
  const stayGain = PK_HUNT.pickBestHunt({
    hunts: { pidgey: hunts.pidgey, rattata: hunts.rattata },
    myTypes: ['NORMAL'],
    curSlug: 'pidgey',
    curName: 'pidgey',
    inHunt: true,
    minRatio: 0.5,
    huntGain: 1.1,
    matchupFn: PK_TYPES.matchup,
  });
  assert.equal(stayGain.action, 'stay');
  assert.equal(stayGain.reason, 'gain-below-threshold');

  // Com ganho >10%: troca para caterpie
  const sw = PK_HUNT.pickBestHunt({
    hunts,
    myTypes: ['FIRE'],
    curSlug: 'pidgey',
    curName: 'pidgey',
    inHunt: true,
    minRatio: 0.5,
    huntGain: 1.1,
    matchupFn: PK_TYPES.matchup,
  });
  assert.equal(sw.action, 'switch');
  assert.equal(sw.reason, 'better-hunt');
  assert.equal(sw.best.slug, 'caterpie');

  // No Centro Pokémon (inHunt: false): entra na melhor hunt mesmo que fosse a anterior
  const fromCp = PK_HUNT.pickBestHunt({
    hunts,
    myTypes: ['FIRE'],
    curSlug: 'caterpie',
    curName: 'centro pokemon',
    inHunt: false,
    minRatio: 0.5,
    huntGain: 1.1,
    matchupFn: PK_TYPES.matchup,
  });
  assert.equal(fromCp.action, 'switch');
  assert.equal(fromCp.reason, 'enter-hunt');
  assert.equal(fromCp.best.slug, 'caterpie');
});

test('parseCenterCountdownSec e isCenterButtonReady respeitam trava de 3s em combate', () => {
  assert.equal(PK_HUNT.parseCenterCountdownSec('2.7s'), 2.7);
  assert.equal(PK_HUNT.parseCenterCountdownSec('3s'), 3);
  assert.equal(PK_HUNT.parseCenterCountdownSec('0,0s'), 0);
  assert.equal(PK_HUNT.parseCenterCountdownSec(''), 0);

  assert.equal(PK_HUNT.isCenterButtonReady({ exists: true, hidden: false, disabled: false, countdownText: '' }), true);
  assert.equal(PK_HUNT.isCenterButtonReady({ exists: true, hidden: false, disabled: true, countdownText: '2.1s' }), false);
  assert.equal(PK_HUNT.isCenterButtonReady({ exists: true, hidden: false, disabled: false, countdownText: '0.4s' }), false);
  assert.equal(PK_HUNT.isCenterButtonReady({ exists: true, hidden: true, disabled: false, countdownText: '' }), false);
  assert.equal(PK_HUNT.isCenterButtonReady({ exists: false, hidden: false, disabled: false, countdownText: '' }), false);
});

test('parseWaitToast reconhece toasts de combate e de cooldown em PT e EN', () => {
  assert.deepEqual(
    PK_HUNT.parseWaitToast('Em combate — espere 2,4s sem tomar nem dar dano'),
    { kind: 'combat', sec: 2.4 }
  );
  assert.deepEqual(
    PK_HUNT.parseWaitToast('In combat — wait 3.0s without taking or dealing damage'),
    { kind: 'combat', sec: 3 }
  );
  assert.deepEqual(
    PK_HUNT.parseWaitToast('Espere 5s para trocar de hunt novamente'),
    { kind: 'cooldown', sec: 5 }
  );
  assert.deepEqual(
    PK_HUNT.parseWaitToast('Wait 4s before switching hunts'),
    { kind: 'cooldown', sec: 4 }
  );
  assert.equal(PK_HUNT.parseWaitToast('Equipe curada!'), null);
});

// ---------- Gerenciador de Hunt v3: simulação real de combate e economia ----------
const CHARIZARD_420 = {
  name: 'Charizard',
  level: 420,
  types: ['FIRE', 'FLYING'],
  hpMax: 10920,
  atk: 886,
  def: 848,
  spAtk: 1047,
  spDef: 893,
  baseSpd: 100,
  ivSpd: 27,
  attacks: [
    { name: 'Fire Spin', type: 'FIRE', cat: 'SPECIAL', power: 30, cd: 14 },
    { name: 'Ember', type: 'FIRE', cat: 'SPECIAL', power: 40, cd: 16 },
    { name: 'Flame Burst', type: 'FIRE', cat: 'SPECIAL', power: 55, cd: 19 },
    { name: 'Incinerate', type: 'FIRE', cat: 'SPECIAL', power: 60, cd: 21 },
    { name: 'Air Slash', type: 'FLYING', cat: 'SPECIAL', power: 75, cd: 24 },
    { name: 'Fire Pledge', type: 'FIRE', cat: 'SPECIAL', power: 80, cd: 25 },
    { name: 'Flamethrower', type: 'FIRE', cat: 'SPECIAL', power: 90, cd: 28 },
    { name: 'Armor Cannon', type: 'FIRE', cat: 'SPECIAL', power: 120, cd: 31 },
    { name: 'Hurricane', type: 'FLYING', cat: 'SPECIAL', power: 120, cd: 31 },
    { name: 'Eruption', type: 'FIRE', cat: 'SPECIAL', power: 150, cd: 33 },
    { name: 'Mind Blown', type: 'FIRE', cat: 'SPECIAL', power: 150, cd: 33 },
    { name: 'Ignition Point', type: 'FIRE', cat: 'SPECIAL', power: 600, cd: 60 },
    { name: 'Massive Hurricane', type: 'FLYING', cat: 'SPECIAL', power: 600, cd: 60 },
  ],
};

const REAL_HUNTS_420 = {
  furious_scizor: {
    nome: 'furious scizor', regiao: 'outland', level: 150, types: ['BUG', 'STEEL'],
    xp: 15290272, gold: 837931, baseStats: [70, 130, 100, 55, 80, 65],
    baseNpcPrice: 60000, captureLevel: 100, canShiny: false, stoneProbSum: 0.01,
    balls: [{ name: 'Great Ball', catchChance: 0.0047 }],
  },
  sunkern: {
    nome: 'sunkern', regiao: 'johto', level: 200, types: ['GRASS'],
    xp: 21800000, gold: 980000, baseStats: [30, 30, 30, 30, 30, 30],
    baseNpcPrice: 14261, captureLevel: 100, canShiny: true, stoneProbSum: 0.002,
    balls: [{ name: 'Great Ball', catchChance: 0.0059 }],
  },
  pineco: {
    nome: 'pineco', regiao: 'johto', level: 230, types: ['BUG'],
    xp: 26074282, gold: 1084900, baseStats: [50, 65, 90, 35, 35, 15],
    baseNpcPrice: 15000, captureLevel: 100, canShiny: true, stoneProbSum: 0.002,
    balls: [{ name: 'Great Ball', catchChance: 0.0059 }],
  },
  spinarak: {
    nome: 'spinarak', regiao: 'johto', level: 230, types: ['BUG', 'POISON'],
    xp: 26074282, gold: 1084900, baseStats: [40, 60, 40, 40, 40, 30],
    baseNpcPrice: 14000, captureLevel: 100, canShiny: true, stoneProbSum: 0.004,
    balls: [{ name: 'Great Ball', catchChance: 0.0059 }],
  },
  yanma: {
    nome: 'yanma', regiao: 'johto', level: 350, types: ['BUG', 'FLYING'],
    xp: 44068763, gold: 1395572, baseStats: [65, 65, 45, 75, 45, 95],
    baseNpcPrice: 28000, captureLevel: 100, canShiny: true, stoneProbSum: 0.004,
    balls: [{ name: 'Great Ball', catchChance: 0.0047 }],
  },
  hitmontop: {
    nome: 'hitmontop', regiao: 'johto', level: 380, types: ['FIGHTING'],
    xp: 48839898, gold: 1466134, baseStats: [50, 95, 95, 35, 110, 70],
    baseNpcPrice: 32750, captureLevel: 100, canShiny: true, stoneProbSum: 0.0035,
    balls: [{ name: 'Great Ball', catchChance: 0.0047 }],
  },
};

test('simulateHunt reproduz física real: Furious Scizor 150 e Pineco 230 superam Hitmontop 380 em XP/h, lucro e abates/h', () => {
  const potion = PK_HUNT.resolvePotion({ activeChips: [{ title: 'Golden Potion', on: true, stock: 50 }], hpMax: CHARIZARD_420.hpMax });
  const ball = PK_HUNT.resolveBall({ activeChips: [{ title: 'Great Ball', on: true, stock: 5000 }], capturing: true });

  const scizor = PK_HUNT.simulateHunt({ player: CHARIZARD_420, hunt: REAL_HUNTS_420.furious_scizor, potion, ball, capturing: true });
  const pineco = PK_HUNT.simulateHunt({ player: CHARIZARD_420, hunt: REAL_HUNTS_420.pineco, potion, ball, capturing: true });
  const hitmon = PK_HUNT.simulateHunt({ player: CHARIZARD_420, hunt: REAL_HUNTS_420.hitmontop, potion, ball, capturing: true });

  // Hitmontop 380 é lento (~100-200 kills/h), dá pouco XP/h real e queima poções
  assert.ok(hitmon.kph < 220, `esperava Hitmontop lento, veio ${hitmon.kph}/h`);
  assert.ok(hitmon.xpH < 10_000_000, `esperava Hitmontop <10M XP/h, veio ${hitmon.xpH}`);
  assert.ok(hitmon.potionsH > 25, `esperava gasto alto de poção em Hitmontop, veio ${hitmon.potionsH}/h`);

  // Furious Scizor 150 mata muito rápido (>900/h), ~15-20M XP/h, lucro líquido próximo de 1M/h e quase 0 poções
  assert.ok(scizor.kph > 900, `esperava Scizor >900 kills/h, veio ${scizor.kph}/h`);
  assert.ok(scizor.xpH > 15_000_000, `esperava Scizor >15M XP/h, veio ${scizor.xpH}`);
  assert.ok(scizor.netGoldH > 850_000, `esperava Scizor >850k lucro/h, veio ${scizor.netGoldH}`);
  assert.ok(scizor.potionsH < 5, `esperava quase zero poções no Scizor, veio ${scizor.potionsH}/h`);

  // Pineco 230 dá mais XP/h que Scizor e muito mais que Hitmontop
  assert.ok(pineco.xpH > scizor.xpH, `esperava Pineco (${pineco.xpH}) > Scizor (${scizor.xpH}) em XP/h`);
  assert.ok(pineco.xpH > hitmon.xpH * 2, 'Pineco deve dar mais que o dobro de XP/h real do Hitmontop');
});

test('pickBestHunt v3 escolhe corretamente em cada foco e tira o jogador de Hitmontop 380', () => {
  const potion = PK_HUNT.resolvePotion({ activeChips: [{ title: 'Golden Potion', on: true, stock: 50 }], hpMax: CHARIZARD_420.hpMax });
  const ball = PK_HUNT.resolveBall({ activeChips: [{ title: 'Great Ball', on: true, stock: 5000 }], capturing: true });
  const baseArgs = {
    hunts: REAL_HUNTS_420,
    player: CHARIZARD_420,
    potion,
    ball,
    capturing: true,
    curSlug: 'hitmontop',
    curName: 'Hitmontop · nível 380',
    inHunt: true,
    huntGain: 1.1,
  };

  // Equilibrado: Furious Scizor vence (ótimo XP + lucro líder + abates/h + Outland) e tira de Hitmontop
  const eq = PK_HUNT.pickBestHunt({ ...baseArgs, focus: 'balanced' });
  assert.equal(eq.action, 'switch');
  assert.equal(eq.best.slug, 'furious_scizor');
  assert.ok(eq.best.score > eq.current.score * 3);

  // XP: Sunkern/Spinarak/Pineco vence (máximo XP/h real), nunca Hitmontop
  const xp = PK_HUNT.pickBestHunt({ ...baseArgs, focus: 'xp' });
  assert.equal(xp.action, 'switch');
  assert.ok(['sunkern', 'spinarak', 'pineco'].includes(xp.best.slug), `esperava sunkern/spinarak/pineco em XP, veio ${xp.best.slug}`);
  assert.notEqual(xp.best.slug, 'hitmontop');

  // Lucro/Outland: Furious Scizor vence de lavada (venda NPC ~212k/captura + gold abate + Outland)
  const lucro = PK_HUNT.pickBestHunt({ ...baseArgs, focus: 'lucro' });
  assert.equal(lucro.action, 'switch');
  assert.equal(lucro.best.slug, 'furious_scizor');
  assert.ok(lucro.best.sim.npcCaptureH > 800_000, `esperava retorno NPC >800k/h no Scizor, veio ${lucro.best.sim.npcCaptureH}`);

  // Shiny/Caça: exclui Outland (furious_scizor não tem Shiny) e escolhe hunt rápida fora da Outland
  const shiny = PK_HUNT.pickBestHunt({ ...baseArgs, focus: 'shiny' });
  assert.equal(shiny.action, 'switch');
  assert.notEqual(shiny.best.slug, 'furious_scizor');
  assert.equal(shiny.best.sim.canShiny, true);
  assert.ok(['sunkern', 'spinarak', 'pineco'].includes(shiny.best.slug));
});

test('pickBestHunt v3 funciona para conta iniciante Nv 20 (sem Outland)', () => {
  const squirtle20 = {
    name: 'Squirtle',
    level: 20,
    types: ['WATER'],
    hpMax: 420,
    atk: 32, def: 38, spAtk: 35, spDef: 38,
    baseSpd: 43, ivSpd: 27,
  };
  const huntsKanto = {
    charmander: { nome: 'charmander', regiao: 'kanto', level: 20, types: ['FIRE'], baseStats: [39, 52, 43, 60, 50, 65] },
    bulbasaur: { nome: 'bulbasaur', regiao: 'kanto', level: 20, types: ['GRASS', 'POISON'], baseStats: [45, 49, 49, 65, 65, 45] },
    geodude: { nome: 'geodude', regiao: 'kanto', level: 10, types: ['ROCK', 'GROUND'], baseStats: [40, 80, 100, 30, 30, 20] },
  };
  const dec = PK_HUNT.pickBestHunt({
    hunts: huntsKanto,
    player: squirtle20,
    focus: 'balanced',
    inHunt: false,
  });
  assert.equal(dec.action, 'switch');
  assert.ok(['charmander', 'geodude'].includes(dec.best.slug), `esperava charmander ou geodude, veio ${dec.best.slug}`);
  assert.notEqual(dec.best.slug, 'bulbasaur');
});

test('selectCandidatesForDetail inclui hunt atual e limita quantidade máxima', () => {
  const slugs = PK_HUNT.selectCandidatesForDetail({
    hunts: REAL_HUNTS_420,
    player: CHARIZARD_420,
    focus: 'balanced',
    curSlug: 'hitmontop',
    maxCandidates: 4,
  });
  assert.ok(slugs.includes('hitmontop'));
  assert.ok(slugs.includes('furious_scizor'));
  assert.ok(slugs.length <= 4);
});

test('parsers puros de DOM e utilitários (ativo, ficha, golpes, pedras, poção, Outland tier)', () => {
  assert.equal(PK_HUNT.parseIntStrict('Nv 1.250'), 1250);
  const card = PK_HUNT.parseActiveCard({
    text: 'Charizard Nv 420\nFIRE\nFLYING\npoder 1.647\n7812 / 10920\n4.943.259 / 8.757.200 xp',
    types: ['FIRE', 'FLYING'],
  });
  assert.deepEqual(card, { name: 'Charizard', level: 420, hpMax: 10920, types: ['FIRE', 'FLYING'] });

  const sheet = PK_HUNT.parseActiveSheet([
    'HP 910 IV 27', 'ATK 886 IV 27', 'DEF 848 IV 27', 'SP.ATK 1.047 IV 27', 'SP.DEF 893 IV 27', 'SPD 1.061 IV 27',
    'HP 78 · +1', 'ATK 84 · +1', 'DEF 78 · +1', 'SP.ATK 109 · +1', 'SP.DEF 85 · +1', 'SPD 100 fixo',
  ], 'HP DE COMBATE\n10.920');
  assert.equal(sheet.hpMax, 10920);
  assert.equal(sheet.spAtk, 1047);
  assert.equal(sheet.ivSpd, 27);
  assert.equal(sheet.baseSpd, 100);
  assert.deepEqual(sheet.baseStats, [78, 84, 78, 109, 85, 100]);

  const atks = PK_HUNT.parsePokedexAttacks([
    ['Golpe', 'Tipo', 'Categoria', 'Dano base', 'Cooldown'],
    ['Flamethrower', 'FIRE', 'Especial', '90', '28s'],
    ['Slash', 'NORMAL', 'Físico', '70', '23s'],
  ]);
  assert.equal(atks.length, 2);
  assert.deepEqual(atks[0], { name: 'Flamethrower', type: 'FIRE', cat: 'SPECIAL', power: 90, cd: 28 });
  assert.deepEqual(atks[1], { name: 'Slash', type: 'NORMAL', cat: 'PHYSICAL', power: 70, cd: 23 });

  const stones = PK_HUNT.parsePokedexStones([
    ['Item', 'Chance', 'Quantidade'],
    ['Fire Stone', '0,50%', '1'],
    ['Feather Stone', '0,50%', '1'],
    ['Fragmento de Shiny Stone', '0,0004%', '1'],
  ]);
  assert.equal(stones.stoneCount, 2);
  assert.ok(Math.abs(stones.stoneProbSum - 0.01) < 1e-6);

  const pot = PK_HUNT.resolvePotion({
    activeChips: [
      { title: 'Small Potion — acabou', on: true, stock: 0 },
      { title: 'Golden Potion', on: true, stock: 67 },
    ],
    hpMax: 10920,
  });
  assert.equal(pot.name, 'Golden Potion');
  assert.equal(pot.heal, 5460);
  assert.equal(pot.price, 2500);

  assert.equal(PK_HUNT.bestOutlandTierForLevel(421).numero, 1);
  assert.equal(PK_HUNT.bestOutlandTierForLevel(500).numero, 2);
  assert.equal(PK_HUNT.bestOutlandTierForLevel(500).mult, 1.1);
  assert.equal(PK_HUNT.bestOutlandTierForLevel(65000).numero, 40);
});
