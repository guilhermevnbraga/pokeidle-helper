/* Tabela de tipos (padrão Gen 6+) e fator de "vantagem na hunt" descrito na Wiki do jogo. */
const PK_TYPES = (() => {
  const T = ['NORMAL', 'FIRE', 'WATER', 'GRASS', 'ELECTRIC', 'ICE', 'FIGHTING', 'POISON', 'GROUND', 'FLYING', 'PSYCHIC', 'BUG', 'ROCK', 'GHOST', 'DRAGON', 'DARK', 'STEEL', 'FAIRY'];
  // atacante -> { defensor: mult } (omitido = 1)
  const C = {
    NORMAL: { ROCK: .5, GHOST: 0, STEEL: .5 },
    FIRE: { FIRE: .5, WATER: .5, GRASS: 2, ICE: 2, BUG: 2, ROCK: .5, DRAGON: .5, STEEL: 2 },
    WATER: { FIRE: 2, WATER: .5, GRASS: .5, GROUND: 2, ROCK: 2, DRAGON: .5 },
    GRASS: { FIRE: .5, WATER: 2, GRASS: .5, POISON: .5, GROUND: 2, FLYING: .5, BUG: .5, ROCK: 2, DRAGON: .5, STEEL: .5 },
    ELECTRIC: { WATER: 2, GRASS: .5, ELECTRIC: .5, GROUND: 0, FLYING: 2, DRAGON: .5 },
    ICE: { FIRE: .5, WATER: .5, GRASS: 2, ICE: .5, GROUND: 2, FLYING: 2, DRAGON: 2, STEEL: .5 },
    FIGHTING: { NORMAL: 2, ICE: 2, POISON: .5, FLYING: .5, PSYCHIC: .5, BUG: .5, ROCK: 2, GHOST: 0, DARK: 2, STEEL: 2, FAIRY: .5 },
    POISON: { GRASS: 2, POISON: .5, GROUND: .5, ROCK: .5, GHOST: .5, STEEL: 0, FAIRY: 2 },
    GROUND: { FIRE: 2, GRASS: .5, ELECTRIC: 2, POISON: 2, FLYING: 0, BUG: .5, ROCK: 2, STEEL: 2 },
    FLYING: { GRASS: 2, ELECTRIC: .5, FIGHTING: 2, BUG: 2, ROCK: .5, STEEL: .5 },
    PSYCHIC: { FIGHTING: 2, POISON: 2, PSYCHIC: .5, DARK: 0, STEEL: .5 },
    BUG: { FIRE: .5, GRASS: 2, FIGHTING: .5, POISON: .5, FLYING: .5, PSYCHIC: 2, GHOST: .5, DARK: 2, STEEL: .5, FAIRY: .5 },
    ROCK: { FIRE: 2, ICE: 2, FIGHTING: .5, GROUND: .5, FLYING: 2, BUG: 2, STEEL: .5 },
    GHOST: { NORMAL: 0, PSYCHIC: 2, GHOST: 2, DARK: .5 },
    DRAGON: { DRAGON: 2, STEEL: .5, FAIRY: 0 },
    DARK: { FIGHTING: .5, PSYCHIC: 2, GHOST: 2, DARK: .5, FAIRY: .5 },
    STEEL: { FIRE: .5, WATER: .5, ELECTRIC: .5, ICE: 2, ROCK: 2, STEEL: .5, FAIRY: 2 },
    FAIRY: { FIRE: .5, FIGHTING: 2, POISON: .5, DRAGON: 2, DARK: 2, STEEL: .5 },
  };
  // multiplicador de um golpe `atk` contra um defensor de tipos `defTypes`
  const mult = (atk, defTypes) => defTypes.reduce((m, d) => m * ((C[atk] || {})[d] ?? 1), 1);
  // valores já amplificados da hunt (Wiki: "Na hunt a vantagem é 1.5× mais forte")
  const AMP = [[0, 0], [0.25, 0.167], [0.5, 0.333], [1, 1], [2, 2.5], [4, 5.5]];
  const amp = m => {
    if (m <= 0) return 0;
    const exact = AMP.find(([k]) => k === m); if (exact) return exact[1];
    if (m < 0.25) return 0.1;       // ×0,125 etc.: pior que ×0,167
    if (m > 4) return 5.5 * (m / 4); // ×8...
    return AMP.reduce((b, p) => (Math.abs(p[0] - m) < Math.abs(b[0] - m) ? p : b))[1];
  };
  /* Ofensiva: o melhor tipo do meu pokemon (STAB) contra os tipos do monstro.
     Defensiva: o melhor tipo do monstro contra os meus tipos. ratio>1 = hunt favorável. */
  function matchup(myTypes, monsterTypes) {
    if (!myTypes.length || !monsterTypes.length) return { off: 1, def: 1, ratio: 1, known: false };
    const off = Math.max(...myTypes.map(t => mult(t, monsterTypes)));
    const def = Math.max(...monsterTypes.map(t => mult(t, myTypes)));
    const ratio = amp(off) / Math.max(amp(def), 0.167);
    return { off, def, ratio, known: true };
  }
  return { mult, amp, matchup };
})();
if (typeof module !== 'undefined') module.exports = PK_TYPES;
