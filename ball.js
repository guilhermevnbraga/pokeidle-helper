/* Lógica pura do Analisador Otimizado de Pokébola do pokeidle.io.
   Sem acesso ao DOM nem APIs: usado por content.js e testado diretamente em Node.
   Fórmulas alinhadas aos módulos oficiais do jogo (sell-value, recompensa-hunt, nota-pokemon, captura-degrau). */
const PK_BALL = (() => {
  // Bandas oficiais de qualidade na captura (shared/nota-pokemon.mjs)
  const QUALITY_BANDS = [
    { min: 0.8, max: 0.9, prob: 0.05 },
    { min: 0.9, max: 1.0, prob: 0.05 },
    { min: 1.0, max: 1.1, prob: 0.3403846 },
    { min: 1.1, max: 1.2, prob: 0.20 },
    { min: 1.2, max: 1.3, prob: 0.10 },
    { min: 1.3, max: 1.4, prob: 0.10 },
    { min: 1.4, max: 1.5, prob: 0.10 },
    { min: 1.5, max: 1.6, prob: 0.05 },
    { min: 1.7, max: 1.8, prob: 0.0067308 },
    { min: 1.8, max: 1.8, prob: 0.0028846 },
  ];

  // Média exata de qualidade: ~1.176923
  const AVG_QUALITY = QUALITY_BANDS.reduce((s, b) => s + b.prob * ((b.min + b.max) / 2), 0);

  // Probabilidades oficiais de Potência P1..P5 (Wiki: Potência I a V)
  const POTENCY_TIERS = [
    { p: 1, prob: 0.745, mult: 1.00 },
    { p: 2, prob: 0.200, mult: 1.05 },
    { p: 3, prob: 0.050, mult: 1.10 },
    { p: 4, prob: 0.005, mult: 1.25 },
    { p: 5, prob: 0.00005, mult: 2.00 },
  ];
  const P5_PROB = 0.00005; // 0,0050% (1 em 20.000)

  // Constantes oficiais de economia de hunt (shared/sell-value.mjs + shared/recompensa-hunt.mjs)
  const NIVEL_ANCORA = 150;
  const XP_ANCORA = 0.6 * NIVEL_ANCORA ** 2;
  const OURO_KILL_NIVEL_1 = 36;
  const OURO_KILL_ANCORA_NIVEL = 5000;
  const OURO_KILL_ANCORA = 6000;
  const EXPOENTE_OURO_KILL = Math.log(OURO_KILL_ANCORA / OURO_KILL_NIVEL_1) / Math.log(OURO_KILL_ANCORA_NIVEL);
  const NIVEL_TETO_OURO = 25000;
  const TETO_OURO_KILL = Math.round(OURO_KILL_NIVEL_1 * NIVEL_TETO_OURO ** EXPOENTE_OURO_KILL);
  const FRACAO_BONUS_LOOT = 0.15;
  const EXPOENTE_RENDA = 0.30;
  const NIVEL_TETO_VENDA_POKEMON = 100;

  // Constantes de captura e RMT
  const CAPTURE_CAP = 0.10; // teto oficial de captura comum (estado.captura.teto = 0.1)
  const RMT_MIN_LEVEL = 50;
  const RMT_MIN_NOTA = 3.5;
  const RMT_PENSION_COINS = 100000;

  // Catálogo padrão de bolas do Market NPC (caso a tabela da Pokedex omita preço)
  const DEFAULT_BALL_PRICES = {
    'poke ball': 5,
    'great ball': 20,
    'super ball': 50,
    'ultra ball': 130,
  };
  const DEFAULT_ALLOWED_BALLS = ['Poke Ball', 'Great Ball', 'Super Ball', 'Ultra Ball'];
  const DEFAULT_RESTOCK_MIN = 10;
  const DEFAULT_RESTOCK_BUY = 100;

  // Monta atualização de reposição de Pokébola (sempre 10 de mínimo e 100 de reposição, sobrescrevendo valores anteriores)
  function buildBallRestockConfig(recommended, allowedBalls = DEFAULT_ALLOWED_BALLS) {
    if (!recommended) return null;
    const list = Array.isArray(allowedBalls) ? allowedBalls : DEFAULT_ALLOWED_BALLS;
    let name = '';
    if (typeof recommended === 'string') {
      name = recommended.trim();
    } else if (typeof recommended === 'object') {
      if (recommended.id === 'none' || recommended.diamondOnly || recommended.purchasable === false) return null;
      name = String(recommended.name || '').trim();
    }
    if (!name) return null;
    const targetLower = name.toLowerCase();
    const canonical = list.find(b => String(b).toLowerCase() === targetLower);
    if (!canonical) return null;
    return {
      ball: canonical,
      ballMin: DEFAULT_RESTOCK_MIN,
      ballBuy: DEFAULT_RESTOCK_BUY,
    };
  }

  // Distribuição exata de soma de 6 IVs independentes em {1..32} (valores 6..192)
  const IV_TAIL_PROB = (() => {
    let dp = new Float64Array(193);
    dp[0] = 1;
    for (let k = 0; k < 6; k++) {
      const nxt = new Float64Array(193);
      for (let s = 0; s <= 192; s++) {
        if (!dp[s]) continue;
        const add = dp[s] / 32;
        for (let v = 1; v <= 32; v++) if (s + v <= 192) nxt[s + v] += add;
      }
      dp = nxt;
    }
    const tail = new Float64Array(194);
    for (let s = 192; s >= 6; s--) tail[s] = tail[s + 1] + dp[s];
    return tail;
  })();

  const STAT_EXPO = [0.95, 0.8, 0.8, 0.8, 0.8, 0.95];
  const REF_BASES = [80, 80, 80, 80, 80, 80];

  function somaStats(bases, ivSum, q, mult) {
    const med = Math.floor(ivSum / 6);
    const rest = ivSum - med * 6;
    let s = 0;
    for (let i = 0; i < 6; i++) {
      const iv = med + (i < rest ? 1 : 0);
      s += Math.round((bases[i] + 2 * iv) * (q ** STAT_EXPO[i]) * mult);
    }
    return s;
  }

  const REF_LOG_MIN = Math.log(somaStats(REF_BASES, 6, 0.8, 1));
  const REF_LOG_MAX = Math.log(somaStats(REF_BASES, 192, 1.8, 6));

  function refScore(soma) {
    const raw = (Math.log(Math.max(1, soma)) - REF_LOG_MIN) / (REF_LOG_MAX - REF_LOG_MIN);
    return Math.min(1, Math.max(0, raw));
  }

  // Probabilidade determinística exata de um Pokémon não-shiny e não-P5 atingir Nota >= minNota (padrão 3.5).
  // Usa busca binária sobre ivSum (monótono) + cauda exata de 6d32 -> roda em <0.5 ms.
  function calcStrongNoteProb(baseStats, minNota = RMT_MIN_NOTA) {
    const b = Array.isArray(baseStats) && baseStats.length === 6 && baseStats.every(x => Number(x) > 0)
      ? baseStats.map(Number)
      : REF_BASES;
    const sMin = refScore(somaStats(b, 6, 0.8, 1));
    const sMax = refScore(somaStats(b, 192, 1.8, 6));
    if (sMax <= sMin) return 0;

    const notaOf = (ivSum, q, mult) => 10 * (refScore(somaStats(b, ivSum, q, mult)) - sMin) / (sMax - sMin);
    const nonP5 = POTENCY_TIERS.filter(t => t.p < 5);

    let prob = 0;
    for (const pot of nonP5) {
      for (const band of QUALITY_BANDS) {
        const steps = band.max > band.min ? 5 : 1;
        const wQ = band.prob / steps;
        for (let i = 0; i < steps; i++) {
          const q = steps === 1 ? band.min : band.min + ((i + 0.5) * (band.max - band.min)) / steps;
          if (notaOf(192, q, pot.mult) < minNota - 1e-9) continue;
          if (notaOf(6, q, pot.mult) >= minNota - 1e-9) {
            prob += pot.prob * wQ;
            continue;
          }
          // Menor ivSum em [6..192] que atinge minNota
          let lo = 6, hi = 192;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (notaOf(mid, q, pot.mult) >= minNota - 1e-9) hi = mid;
            else lo = mid + 1;
          }
          prob += pot.prob * wQ * IV_TAIL_PROB[lo];
        }
      }
    }
    return Math.min(1, Math.max(0, prob));
  }

  // Fórmulas oficiais de recompensa por derrota (shared/sell-value.mjs + shared/recompensa-hunt.mjs)
  function xpPerKillForLevel(level) {
    const n = Math.max(1, Number(level) || 1);
    return n <= NIVEL_ANCORA
      ? Math.floor((6 * n * n) / 10) + 8
      : Math.round(XP_ANCORA * (n / NIVEL_ANCORA) ** 1.25);
  }

  function goldKillBaseForLevel(level) {
    const n = Math.max(1, Number(level) || 1);
    return Math.min(TETO_OURO_KILL, Math.max(1, Math.round(OURO_KILL_NIVEL_1 * (n ** EXPOENTE_OURO_KILL))));
  }

  function goldPerKillForLevel(level, bonusLootPct = 0) {
    const n = Math.max(1, Number(level) || 1);
    const raw = n <= NIVEL_TETO_OURO
      ? goldKillBaseForLevel(n)
      : TETO_OURO_KILL * ((n / NIVEL_TETO_OURO) ** EXPOENTE_RENDA);
    const target = Math.round(raw * (1 + FRACAO_BONUS_LOOT));
    const base = goldKillBaseForLevel(n);
    const lootBase = Math.max(0, target - base);
    const loot = Math.round(lootBase * (1 + Math.max(0, Number(bonusLootPct) || 0) / 100));
    return base + loot;
  }

  // Preço médio oficial de venda de um Pokémon comum no Market NPC
  function expectedNpcSellValue(baseNpcPrice, captureLevel = 1, avgQuality = AVG_QUALITY) {
    const base = Math.max(0, Number(baseNpcPrice) || 0);
    if (!base) return 0;
    const lvl = Math.min(Math.max(1, Number(captureLevel) || 1), NIVEL_TETO_VENDA_POKEMON);
    return base * (1 + lvl / 50) * avgQuality;
  }

  // Comissão progressiva oficial de venda de Pokémon em Gemas (13% <=500, 10% <=5000, 7.5% >5000)
  function netPokeGems(gross) {
    if (!Number.isFinite(gross) || gross <= 0) return 0;
    const f1 = Math.min(gross, 500) * 0.13;
    const f2 = Math.max(0, Math.min(gross, 5000) - 500) * 0.10;
    const f3 = Math.max(0, gross - 5000) * 0.075;
    return Math.max(0, gross - Math.ceil(f1 + f2 + f3));
  }

  // Parsers de texto da Pokedex / Hunt Analyser (independente de vírgula/ponto e PT/EN)
  function parsePercent(raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
    const m = String(raw || '').match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (!m) return 0;
    return parseFloat(m[1].replace(',', '.')) / 100;
  }

  function parseOneInN(raw) {
    const m = String(raw || '').match(/(?:1\s*(?:em|in|\/)\s*)([\d.,]+)/i);
    if (!m) return 0;
    const n = parseInt(m[1].replace(/[^\d]/g, ''), 10);
    return n > 0 ? 1 / n : 0;
  }

  function parseIntStrict(raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : 0;
    const s = String(raw || '').replace(/[^\d]/g, '');
    return s ? parseInt(s, 10) : 0;
  }

  // Extrai o primeiro número inteiro de textos como "100 (teto 100 · hunt 150)" ou "40" e limita ao teto oficial (100).
  function parseCaptureLevel(raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? Math.min(NIVEL_TETO_VENDA_POKEMON, Math.max(1, Math.round(raw))) : 0;
    const m = String(raw || '').match(/\d+(?:[.,]\d{3})*/);
    if (!m) return 0;
    const n = parseInt(m[0].replace(/[^\d]/g, ''), 10);
    return n > 0 ? Math.min(NIVEL_TETO_VENDA_POKEMON, n) : 0;
  }

  function parseMultiplier(raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 1;
    const m = String(raw || '').match(/[×x]?\s*(\d+(?:[.,]\d+)?)/i);
    return m ? parseFloat(m[1].replace(',', '.')) : 1;
  }

  // Parseia linhas extraídas da tabela de Captura da Pokedex (array de [nome, efic, chance, derrotas, preco])
  function parsePokedexBallRows(rows) {
    const out = [];
    for (const cells of (rows || [])) {
      if (!Array.isArray(cells) || cells.length < 3) continue;
      const name = String(cells[0] || '').trim();
      if (!name || /pok[eé]bola|pokeball|ball$/i.test(name) && /^(pok[eé]bola|ball)$/i.test(name)) continue;
      const catchRate = parseMultiplier(cells[1]);
      const catchChance = parsePercent(cells[2]);
      if (catchChance <= 0) continue;
      const avgKills = cells[3] ? parseIntStrict(cells[3]) : Math.ceil(1 / catchChance);
      const priceText = String(cells[4] ?? '').trim();
      const diamondOnly = /diamante|diamond|gem/i.test(priceText);
      const parsedPrice = diamondOnly ? null : parseIntStrict(priceText);
      const fallback = DEFAULT_BALL_PRICES[name.toLowerCase()];
      const priceGold = diamondOnly ? null : (parsedPrice > 0 ? parsedPrice : (fallback ?? null));
      out.push({
        name,
        catchRate,
        catchChance,
        avgKills,
        priceGold,
        diamondOnly: diamondOnly || priceGold == null,
      });
    }
    return out;
  }

  // Extrai preços de referência (pisos líquidos em Coins) a partir das rotas do Radar RMT (`rmtState.last.routes`).
  // Aceita também override específico da espécie (`speciesOverrides`).
  function extractRmtMarketData(rmtRoutes, speciesOverrides = null) {
    const routes = Array.isArray(rmtRoutes) ? rmtRoutes.filter(r => r && Number.isFinite(r.coinsPerGem) && r.coinsPerGem > 0) : [];
    const sorted = routes.slice().sort((a, b) => a.coinsPerGem - b.coinsPerGem);
    const coinsPerGem = sorted.length ? sorted[0].coinsPerGem : 0;

    const findCat = id => routes.find(r => r.id === id) || null;
    const sac = findCat('poke-sacrifice');
    const p5 = findCat('poke-p5');
    const shiny = findCat('poke-shiny');

    // Valor líquido de venda de um Pokémon no RMT:
    // - em Coins: preço de piso - pensão (100k)
    // - em Gemas: gemas líquidas após taxa progressiva * coinsPerGem - pensão (100k)
    const netCategoryValue = (route, override, { gemsOnly = false } = {}) => {
      let fromCoins = 0;
      let fromGems = 0;
      const ovCoins = override && Number(override.coins) > 0 ? Number(override.coins) : 0;
      const ovGems = override && Number(override.gems) > 0 ? Number(override.gems) : 0;

      if (!gemsOnly) {
        const rawC = ovCoins || (route ? (route.rawBuyCoins || route.buyCoins || 0) : 0);
        if (rawC > RMT_PENSION_COINS) fromCoins = rawC - RMT_PENSION_COINS;
      }
      const askG = ovGems || (route ? (route.sellGems || route.askGems || 0) : 0);
      if (askG >= 2 && coinsPerGem > 0) {
        const netG = netPokeGems(askG);
        fromGems = Math.max(0, netG * coinsPerGem - RMT_PENSION_COINS);
      }
      return Math.max(fromCoins, fromGems);
    };

    const ov = speciesOverrides || {};
    const strongCoins = netCategoryValue(sac, ov.strong, { gemsOnly: false });
    const p5Coins = netCategoryValue(p5, ov.p5, { gemsOnly: false });
    // Shiny só pode ser anunciado em Gemas no RMT (pokemonSoEmGemas = !!pk.shiny)
    // Mas se não tiver cotação coinsPerGem ainda, cai para o rawBuyCoins do card caso exista
    let shinyCoins = netCategoryValue(shiny, ov.shiny, { gemsOnly: true });
    if (!shinyCoins && (ov.shiny?.coins || shiny?.rawBuyCoins)) {
      shinyCoins = Math.max(0, (ov.shiny?.coins || shiny.rawBuyCoins) - RMT_PENSION_COINS);
    }

    return {
      hasRmtData: !!(strongCoins || p5Coins || shinyCoins),
      hasCoinsPerGem: coinsPerGem > 0,
      coinsPerGem,
      strongCoins,
      p5Coins,
      shinyCoins,
      sources: {
        strong: ov.strong?.coins || ov.strong?.gems ? 'espécie' : (sac ? 'piso RMT' : null),
        p5: ov.p5?.coins || ov.p5?.gems ? 'espécie' : (p5 ? 'piso RMT' : null),
        shiny: ov.shiny?.gems || ov.shiny?.coins ? 'espécie' : (shiny ? 'piso RMT' : null),
      },
    };
  }

  // Estima kills/hora reais da hunt a partir do Hunt Analyser (Ouro/h ou XP/h) + fórmula oficial
  function estimateKillsPerHour({ goldPerHour = 0, xpPerHour = 0, huntLevel = 1, bonusLootPct = 0 }) {
    const lvl = Math.max(1, Number(huntLevel) || 1);
    const goldPerKill = goldPerKillForLevel(lvl, bonusLootPct);
    const xpPerKill = xpPerKillForLevel(lvl);
    let killsPerHour = 0;
    if (goldPerHour > 0 && goldPerKill > 0) {
      killsPerHour = goldPerHour / goldPerKill;
    } else if (xpPerHour > 0 && xpPerKill > 0) {
      killsPerHour = xpPerHour / xpPerKill;
    } else {
      // Padrão oficial de 1 onda cheia de 16 mobs (hunt-analyser.mjs: 3.5s/kill + 2.6s onda)
      killsPerHour = (16 / ((16 * 3.5) + 2.6)) * 3600;
    }
    const effectiveGoldPerKill = goldPerHour > 0 && killsPerHour > 0
      ? goldPerHour / killsPerHour
      : goldPerKill;
    return {
      killsPerHour: Math.max(1, killsPerHour),
      goldPerKill: Math.max(0, effectiveGoldPerKill),
      goldPerHour: goldPerHour > 0 ? goldPerHour : effectiveGoldPerKill * killsPerHour,
    };
  }

  // Calcula o valor esperado (EV) de UM Pokémon capturado, separado em 4 componentes transparentes.
  function computeCaptureValue({
    baseNpcPrice = 0,
    captureLevel = 1,
    baseStats = null,
    shinyChance = 0,
    shinyLureActive = false,
    rmtMarket = null,
    countSub50Rmt = true,
  }) {
    const npcSell = expectedNpcSellValue(baseNpcPrice, captureLevel);
    const pShiny = Math.min(1, Math.max(0, (Number(shinyChance) || 0) * (shinyLureActive ? 2 : 1)));
    const pP5 = P5_PROB * (1 - pShiny);
    const rawStrong = calcStrongNoteProb(baseStats, RMT_MIN_NOTA);
    const pStrong = Math.max(0, Math.min(1 - pShiny - pP5, rawStrong * (1 - pShiny)));
    const pCommon = Math.max(0, 1 - pShiny - pP5 - pStrong);

    const rmt = rmtMarket || {};
    const needsLevelUpForRmt = (Number(captureLevel) || 1) < RMT_MIN_LEVEL;

    // Valor efetivo em cada desfecho (nunca menor que vender no NPC)
    const valCommon = npcSell;
    const strongRmtVal = countSub50Rmt ? (Number(rmt.strongCoins) || 0) : (needsLevelUpForRmt ? 0 : (Number(rmt.strongCoins) || 0));
    const valStrong = Math.max(npcSell, strongRmtVal);
    const valP5 = Math.max(npcSell, Number(rmt.p5Coins) || 0);
    const valShiny = Math.max(npcSell * 10, Number(rmt.shinyCoins) || 0);

    const evNpc = pCommon * valCommon;
    const evStrong = pStrong * valStrong;
    const evP5 = pP5 * valP5;
    const evShiny = pShiny * valShiny;
    const evTotal = evNpc + evStrong + evP5 + evShiny;

    // Probabilidade de um Pokémon capturado ser "raro" (Forte N>=3.5, P5 ou Shiny)
    const rareProbOnCatch = pStrong + pP5 + pShiny;

    return {
      npcSell,
      valStrong,
      valP5,
      valShiny,
      pCommon,
      pStrong,
      pP5,
      pShiny,
      rareProbOnCatch,
      evNpc,
      evStrong,
      evP5,
      evShiny,
      evTotal,
      needsLevelUpForRmt,
      hasRmtData: !!rmt.hasRmtData,
    };
  }

  // Avalia todas as opções de Pokébola (incluindo "Nenhuma" e informativas como Beast Ball)
  // e recomenda a melhor para cada objetivo: 'balanced' (dinheiro + raro/shiny), 'money' (máx lucro/h), 'rare' (máx raro/shiny).
  function analyzeHuntBalls({
    huntName = '',
    huntLevel = 1,
    captureLevel = null,
    goldPerHour = 0,
    xpPerHour = 0,
    bonusLootPct = 0,
    baseNpcPrice = 0,
    baseStats = null,
    shinyChance = 0,
    balls = [],
    rmtMarket = null,
    catchBoostActive = false,
    shinyLureActive = false,
    focus = 'balanced',
    countSub50Rmt = true,
  }) {
    const capLvl = captureLevel != null && captureLevel > 0 ? captureLevel : Math.min(100, Math.max(1, Number(huntLevel) || 1));
    const pace = estimateKillsPerHour({ goldPerHour, xpPerHour, huntLevel, bonusLootPct });
    const value = computeCaptureValue({
      baseNpcPrice,
      captureLevel: capLvl,
      baseStats,
      shinyChance,
      shinyLureActive,
      rmtMarket,
      countSub50Rmt,
    });

    const noneOption = {
      id: 'none',
      name: 'Nenhuma (só ouro)',
      catchRate: 0,
      catchChance: 0,
      priceGold: 0,
      purchasable: true,
      diamondOnly: false,
      evCapturePerKill: 0,
      ballProfitPerKill: 0,
      ballNetPerHour: 0,
      totalProfitPerHour: pace.goldPerHour,
      capturesPerHour: 0,
      raresPerHour: 0,
      shiniesPerHour: 0,
      hoursPerRare: Infinity,
      hoursPerShiny: Infinity,
      killsPerShiny: Infinity,
      costPerCapture: 0,
      roiPct: 0,
      selfSustaining: true,
      ballCostShareOfKillGold: 0,
    };

    const evaluatedBalls = (balls || []).map(b => {
      const rawChance = Math.max(0, Math.min(1, Number(b.catchChance) || 0));
      const isGuaranteed = (Number(b.catchRate) || 0) >= 255 || rawChance >= 1;
      const effChance = isGuaranteed
        ? 1
        : (catchBoostActive ? Math.min(CAPTURE_CAP, rawChance * 2) : rawChance);
      const price = b.diamondOnly || b.priceGold == null ? null : Math.max(0, Number(b.priceGold) || 0);
      const purchasable = !b.diamondOnly && price != null;

      const evCapturePerKill = effChance * value.evTotal;
      const ballProfitPerKill = purchasable ? (evCapturePerKill - price) : null;
      const ballNetPerHour = purchasable ? (ballProfitPerKill * pace.killsPerHour) : null;
      const totalProfitPerHour = purchasable ? (pace.goldPerHour + ballNetPerHour) : null;
      const capturesPerHour = effChance * pace.killsPerHour;
      const rarePerKill = effChance * value.rareProbOnCatch;
      const raresPerHour = rarePerKill * pace.killsPerHour;
      const shinyPerKill = effChance * value.pShiny;
      const shiniesPerHour = shinyPerKill * pace.killsPerHour;
      const costPerCapture = purchasable && effChance > 0 ? price / effChance : null;
      const roiPct = purchasable && price > 0 ? ((evCapturePerKill - price) / price) * 100 : null;

      return {
        id: String(b.name || '').toLowerCase().replace(/\s+/g, '-'),
        name: b.name,
        catchRate: Number(b.catchRate) || 1,
        baseCatchChance: rawChance,
        catchChance: effChance,
        priceGold: price,
        purchasable,
        diamondOnly: !purchasable,
        evCapturePerKill,
        ballProfitPerKill,
        ballNetPerHour,
        totalProfitPerHour,
        capturesPerHour,
        raresPerHour,
        shiniesPerHour,
        hoursPerRare: raresPerHour > 0 ? 1 / raresPerHour : Infinity,
        hoursPerShiny: shiniesPerHour > 0 ? 1 / shiniesPerHour : Infinity,
        killsPerShiny: shinyPerKill > 0 ? 1 / shinyPerKill : Infinity,
        costPerCapture,
        roiPct,
        selfSustaining: purchasable ? (pace.goldPerKill + evCapturePerKill >= price) : false,
        ballCostShareOfKillGold: purchasable && pace.goldPerKill > 0 ? price / pace.goldPerKill : Infinity,
      };
    });

    const goldOptions = [noneOption, ...evaluatedBalls.filter(b => b.purchasable)];
    const realGoldBalls = evaluatedBalls.filter(b => b.purchasable);

    // 1) Foco DINHEIRO: maior lucro total/hora (inclui "Nenhuma" se toda bola der prejuízo)
    const bestMoney = goldOptions.slice().sort((a, b) =>
      (b.totalProfitPerHour - a.totalProfitPerHour) || (b.catchChance - a.catchChance)
    )[0];

    // 2) Foco RARO/SHINY: maior taxa de captura entre bolas compráveis em ouro que mantêm a hunt sustentável (>= 0 total/h);
    // se nenhuma for sustentável, pega a mais forte avisando que consome saldo externo.
    const sustainableBalls = realGoldBalls.filter(b => b.totalProfitPerHour >= 0);
    const bestRare = (sustainableBalls.length ? sustainableBalls : realGoldBalls).slice().sort((a, b) =>
      (b.catchChance - a.catchChance) || (b.totalProfitPerHour - a.totalProfitPerHour)
    )[0] || noneOption;

    // 3) Foco EQUILIBRADO (Dinheiro + Raro/Shiny):
    // - Regra A: se existem bolas com captura lucrativa por si só (ballProfitPerKill >= 0), escolhe a de MAIOR taxa de captura
    //   dentre as que dão lucro líquido >= 0 na captura (nunca queima dinheiro e maximiza chance de raro/shiny!).
    // - Regra B: se nenhuma bola se paga sozinha apenas com EV de captura, permite investir até 20% do ouro/h de abates
    //   (ou perda líquida da bola <= 15% do ouro dos abates) para escolher a bola de maior captura mantendo >= 85% do lucro da hunt.
    // - Regra C: se até a bola mais barata consumir >15% do lucro dos abates, cai para a mais barata se totalProfitPerHour > 0,
    //   ou "Nenhuma" se toda bola deixar a hunt no prejuízo.
    let bestBalanced = bestMoney;
    let balancedReason = '';
    const selfProfitBalls = realGoldBalls.filter(b => b.ballProfitPerKill >= 0);
    if (selfProfitBalls.length) {
      bestBalanced = selfProfitBalls.slice().sort((a, b) =>
        (b.catchChance - a.catchChance) || (b.totalProfitPerHour - a.totalProfitPerHour)
      )[0];
      balancedReason = bestBalanced.id === bestMoney.id
        ? 'máximo lucro/h e máxima taxa de raro/shiny pagável'
        : 'captura ainda dá lucro líquido e maximiza chances de Forte/Shiny';
    } else if (realGoldBalls.length) {
      const maxNetDrag = pace.goldPerHour * 0.15;
      const withinBudget = realGoldBalls.filter(b =>
        b.totalProfitPerHour > 0 && (-b.ballNetPerHour) <= maxNetDrag
      );
      if (withinBudget.length) {
        bestBalanced = withinBudget.slice().sort((a, b) =>
          (b.catchChance - a.catchChance) || (b.totalProfitPerHour - a.totalProfitPerHour)
        )[0];
        const dragPct = pace.goldPerHour > 0 ? Math.round(((-bestBalanced.ballNetPerHour) / pace.goldPerHour) * 100) : 0;
        balancedReason = `usa ~${dragPct}% do ouro dos abates p/ multiplicar chances de raro/shiny`;
      } else {
        const cheapestPositive = realGoldBalls
          .filter(b => b.totalProfitPerHour > 0)
          .sort((a, b) => (a.priceGold - b.priceGold) || (b.catchChance - a.catchChance))[0];
        if (cheapestPositive) {
          bestBalanced = cheapestPositive;
          balancedReason = 'EV da captura < custo das bolas; menor custo p/ continuar buscando raro/shiny';
        } else {
          bestBalanced = noneOption;
          balancedReason = 'nenhuma bola é sustentável nesta hunt (prejuízo total/h)';
        }
      }
    }

    const byFocus = {
      balanced: bestBalanced,
      money: bestMoney,
      rare: bestRare,
    };
    const chosen = byFocus[focus] || bestBalanced;

    // Avisos objetivos para o jogador
    const warnings = [];
    if (!value.hasRmtData) {
      warnings.push('Sem preços RMT de Pokémon em cache (usando só NPC)');
    }
    if (value.needsLevelUpForRmt && value.pStrong > 0 && value.hasRmtData) {
      warnings.push(`Captura Nv ${capLvl} (< 50): RMT de N≥3,5 exige upar até Nv 50 (P5/Shiny não exigem)`);
    }
    if (value.pShiny <= 0) {
      warnings.push('Esta espécie não possui forma Shiny (ou chance 0)');
    }
    if (chosen.purchasable && chosen.id !== 'none' && chosen.ballProfitPerKill < 0 && chosen.totalProfitPerHour >= 0) {
      warnings.push('Captura paga pelo ouro dos abates (EV captura < preço da bola)');
    }
    if (chosen.purchasable && chosen.id !== 'none' && chosen.totalProfitPerHour < 0) {
      warnings.push('Atenção: o custo desta bola supera o ouro total da hunt!');
    }

    // Cálculo de break-even (EV mínimo por Pokémon para cada bola compensar financeiramente vs anterior)
    const beastBall = evaluatedBalls.find(b => b.diamondOnly) || null;

    return {
      huntName,
      huntLevel: Math.max(1, Number(huntLevel) || 1),
      captureLevel: capLvl,
      focus: byFocus[focus] ? focus : 'balanced',
      boosts: { catchBoostActive: !!catchBoostActive, shinyLureActive: !!shinyLureActive },
      pace,
      value,
      options: [noneOption, ...evaluatedBalls],
      recommended: chosen,
      byFocus,
      balancedReason,
      beastBall,
      warnings,
    };
  }

  function formatCoins(n) {
    if (!Number.isFinite(n)) return '—';
    const sign = n < 0 ? '-' : '';
    const v = Math.abs(n);
    if (v >= 1e9) return sign + (v / 1e9).toFixed(2).replace('.', ',') + 'B';
    if (v >= 1e6) return sign + (v / 1e6).toFixed(2).replace('.', ',') + 'M';
    if (v >= 1e3) return sign + (v / 1e3).toFixed(1).replace('.', ',') + 'K';
    return sign + String(Math.round(v));
  }

  function formatHours(h) {
    if (!Number.isFinite(h) || h <= 0) return '—';
    if (h < 1) return Math.max(1, Math.round(h * 60)) + 'm';
    if (h < 48) return h.toFixed(1).replace('.', ',') + 'h';
    const days = h / 24;
    if (days < 365) return days.toFixed(1).replace('.', ',') + 'd';
    return Math.round(days) + 'd';
  }

  function formatPct(p) {
    if (!Number.isFinite(p) || p <= 0) return '0%';
    const v = p * 100;
    if (v >= 10) return v.toFixed(1).replace('.', ',') + '%';
    if (v >= 0.1) return v.toFixed(2).replace('.', ',') + '%';
    return v.toFixed(4).replace('.', ',') + '%';
  }

  return {
    QUALITY_BANDS,
    AVG_QUALITY,
    POTENCY_TIERS,
    P5_PROB,
    CAPTURE_CAP,
    RMT_MIN_LEVEL,
    RMT_MIN_NOTA,
    RMT_PENSION_COINS,
    DEFAULT_RESTOCK_MIN,
    DEFAULT_RESTOCK_BUY,
    buildBallRestockConfig,
    calcStrongNoteProb,
    xpPerKillForLevel,
    goldKillBaseForLevel,
    goldPerKillForLevel,
    expectedNpcSellValue,
    netPokeGems,
    parsePercent,
    parseOneInN,
    parseIntStrict,
    parseCaptureLevel,
    parseMultiplier,
    parsePokedexBallRows,
    extractRmtMarketData,
    estimateKillsPerHour,
    computeCaptureValue,
    analyzeHuntBalls,
    formatCoins,
    formatHours,
    formatPct,
  };
})();
if (typeof module !== 'undefined') module.exports = PK_BALL;
