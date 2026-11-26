// Modelo de meta do PokeIdle: até que nível upar em hunt normal vs. focar na Outland.
// Todos os parâmetros foram lidos do jogo em 2026-11-26 (ver docs/META_ANALYSIS.md).
// Uso: node scripts/meta-model.mjs [nivelInicial] [dias]

const TIERS = [[150,1],[500,1.1],[750,1.15],[1000,1.25],[1250,1.3],[1500,1.5],[1800,1.65],[2000,1.85],[2250,2],[2500,2.15],[3000,2.3],[3250,2.45],[3500,2.6],[4000,2.75],[5000,3],[6000,3.25],[7000,3.5],[8000,3.75],[10000,4],[11000,4.25],[12000,4.5],[14000,5],[15000,5.25],[17000,6],[19000,6.5],[21000,7],[24000,7.5],[28000,8],[32000,8.5],[36000,9],[38000,9.5],[40000,10],[41000,10.5],[43000,11],[45000,12],[48000,13],[52000,14],[58000,16],[60000,17],[65000,20]];
const multAt = (L) => { let m = 0; for (const [n, x] of TIERS) if (L >= n) m = x; return m; };

export const P = {
  kph: 888,                 // abates/h (helper, Nincada Nv500)
  feeItem: 0.15,            // comissão item em Gema
  // preços em Gemas (melhor oferta, pkbot-rmt-hist 2026-11-26)
  tokenG: 6, keyG: 163, bikeG: 129, shinyFragG: 83,
  shinyKillsPerCapture: 2.04e6, // Ultra Ball (Pokedex); Beast 1,02M; Lure/Capture Boost dividem por 2 cada
  shinyNetEV: 3000,         // Gemas líquidas por Shiny capturado (mediana 3.500 / média 6.158, já sem comissão)
  coinsPerGem: 6.3e6,       // Ouro -> Gema (RMT)
  ballCostPerHour: 130 * 888,
  xph150: 15.29e6, xphExp: 1.25,   // XP/h de uma hunt de nível h: xph150*(h/150)^1.25 (Hunt Analyser)
  gold150: 0.827e6, goldExp: 0.6,
  huntFrac: 0.81,           // melhor hunt viável ≈ 81% do nível do treinador (Nv 700 em T860)
};

export const xpTotal = (L) => Math.round(50 / 3 * (L ** 3 - 6 * L ** 2 + 17 * L - 12));
const xpPerHour = (h) => P.xph150 * (h / 150) ** P.xphExp;
const goldPerHour = (h) => P.gold150 * (h / 150) ** P.goldExp;

export function outlandGemsPerHour(L, lootBoost = 1) {
  const m = multAt(L) * lootBoost;
  const perKill = m * (P.tokenG / 1e4 + (P.keyG + P.bikeG + P.shinyFragG) / 2.5e5);
  return P.kph * perKill * (1 - P.feeItem);
}
export function normalGemsPerHour(L, shinyMult = 1) {
  const h = Math.max(150, L * P.huntFrac);
  const shiny = (P.kph / (P.shinyKillsPerCapture / shinyMult)) * P.shinyNetEV;
  const gold = Math.max(0, goldPerHour(h) - P.ballCostPerHour) / P.coinsPerGem;
  return shiny + gold;
}
const normalXpH = (L) => xpPerHour(Math.max(150, L * P.huntFrac));
const outlandXpH = () => P.xph150;

// Simula: sobe em hunt normal até Lstar, depois Outland para sempre (continua subindo devagar).
export function simulate(L0, days, Lstar, opts = {}) {
  let L = L0, t = 0, gems = 0, xpInto = 0;
  const H = days * 24, dt = 1;
  while (t < H) {
    const leveling = L < Lstar;
    const xph = leveling ? normalXpH(L) : outlandXpH();
    gems += (leveling ? normalGemsPerHour(L, opts.shinyMult || 1) : outlandGemsPerHour(L, opts.loot || 1)) * dt;
    xpInto += xph * dt;
    let need = xpTotal(L + 1) - xpTotal(L);
    while (xpInto >= need) { xpInto -= need; L++; need = xpTotal(L + 1) - xpTotal(L); }
    t += dt;
  }
  return { gems: Math.round(gems), L };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('meta-model.mjs')) {
  const L0 = Number(process.argv[2]) || 860;
  console.log(`Nível inicial ${L0}; gemas/h Outland vs hunt normal (grátis, Ultra Ball):`);
  for (const L of [150, 500, 750, 1000, 1500, 2000, 2500, 3000, 5000, 10000, 20000, 40000, 65000]) {
    console.log(`  T${L}: tier x${multAt(L)}  Outland ${outlandGemsPerHour(L).toFixed(2)} g/h | normal ${normalGemsPerHour(L).toFixed(2)} g/h | XP normal/Outland ${(normalXpH(L) / outlandXpH()).toFixed(1)}x`);
  }
  const days = process.argv[3] ? [Number(process.argv[3])] : [30, 90, 180, 365, 730];
  for (const d of days) {
    const cands = [L0, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 7000, 10000, 15000, 20000].filter((x) => x >= L0);
    const res = cands.map((Ls) => ({ Ls, ...simulate(L0, d, Ls) }));
    const best = res.reduce((a, b) => (b.gems > a.gems ? b : a));
    console.log(`\n${d} dias (24/7): ` + res.map((r) => `${r.Ls === L0 ? 'Outland já' : 'até T' + r.Ls}=${r.gems}`).join(' · '));
    console.log(`  melhor: subir até T${best.Ls} -> ${best.gems} gemas (~US$ ${(best.gems * 0.009).toFixed(0)}), termina em T${best.L}`);
  }
}
