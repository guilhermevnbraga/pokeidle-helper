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
