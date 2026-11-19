/* Lógica pura do Gerenciador de Hunt v3 (simulação real de combate/economia da Wiki, focos e parsers DOM).
   Sem acesso ao DOM nem APIs: usado por content.js e testado diretamente em Node. */
const PK_HUNT = (() => {
  const _types = typeof PK_TYPES !== 'undefined'
    ? PK_TYPES
    : (typeof require === 'function' ? require('./types.js') : null);

  // Constantes oficiais de economia e combate (shared/sell-value.mjs, shared/recompensa-hunt.mjs, hunt-analyser.mjs, Wiki)
  const ANALYSER_KPH = 982.935; // 16 mobs / ((16 * 3.5 + 2.6) / 3600) — taxa fixa usada pelo Hunt Analyser do jogo
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
  const AVG_QUALITY = 1.176923;

  // Constantes de ritmo de combate na hunt (Wiki: Combate — calibrado com sessões reais)
  const WALK_SEC = 2.6;        // tempo médio andando até o próximo selvagem + travar alvo (~260ms/tile)
  const WAVE_SEC = 2.6;        // pausa entre ondas (MS_ONDA = 2600)
  const WAVE_SIZE = 16;        // MAX_MOBS = 16
  const MOB_ATK_INTERVAL = 1.4; // intervalo mínimo entre golpes do selvagem (s)
  const MOB_DMG_MULT = 1.8;    // multiplicador de dano do selvagem na hunt
  const MOB_HP_MULT = 5;       // multiplicador de HP de combate do selvagem na hunt
  const MOB_STAT_FACTOR = 1.15; // fator médio de qualidade/potência do selvagem
  const MOB_AVG_IV = 16;
  const MOB_AVG_POWER = 65;    // poder médio ponderado dos golpes do selvagem
  const SIM_DURATION_SEC = 300; // 5 min simulados em passos discretos (~<0.3 ms por hunt)
  const DEFAULT_BASE_STATS = [70, 75, 75, 75, 75, 70];

  // Catálogo oficial de poções (Market NPC)
  const POTION_CATALOG = [
    { id: 'small potion', name: 'Small Potion', healFlat: 60, healPct: 0, price: 50 },
    { id: 'great potion', name: 'Great Potion', healFlat: 150, healPct: 0, price: 150 },
    { id: 'ultra potion', name: 'Ultra Potion', healFlat: 400, healPct: 0, price: 400 },
    { id: 'hyper potion', name: 'Hyper Potion', healFlat: 1000, healPct: 0, price: 800 },
    { id: 'ultimate potion', name: 'Ultimate Potion', healFlat: 3000, healPct: 0, price: 1500 },
    { id: 'golden potion', name: 'Golden Potion', healFlat: 0, healPct: 0.50, price: 2500 },
  ];

  // Preços NPC das Pokébolas
  const BALL_PRICES = {
    'poke ball': 5,
    'great ball': 20,
    'super ball': 50,
    'ultra ball': 130,
  };

  // Escada oficial das 40 Outlands (shared/outland-tiers.mjs)
  const OUTLAND_TIERS = [
    [150, 1], [500, 1.1], [750, 1.15], [1000, 1.25], [1250, 1.3],
    [1500, 1.5], [1800, 1.65], [2000, 1.85], [2250, 2], [2500, 2.15],
    [3000, 2.3], [3250, 2.45], [3500, 2.6], [4000, 2.75], [5000, 3],
    [6000, 3.25], [7000, 3.5], [8000, 3.75], [10000, 4], [11000, 4.25],
    [12000, 4.5], [14000, 5], [15000, 5.25], [17000, 6], [19000, 6.5],
    [21000, 7], [24000, 7.5], [28000, 8], [32000, 8.5], [36000, 9],
    [38000, 9.5], [40000, 10], [41000, 10.5], [43000, 11], [45000, 12],
    [48000, 13], [52000, 14], [58000, 16], [60000, 17], [65000, 20],
  ].map(([nivel, mult], i) => ({ tier: 101 + i, numero: i + 1, rotulo: `Outland ${i + 1}`, nivel, mult }));

  const FOCUS_LABELS = {
    balanced: 'Equilibrado',
    xp: 'XP',
    lucro: 'Lucro/Outland',
    shiny: 'Shiny/Caça',
  };

  function bestOutlandTierForLevel(trainerLevel) {
    const lv = Math.max(0, Number(trainerLevel) || 0);
    let best = OUTLAND_TIERS[0];
    for (const t of OUTLAND_TIERS) {
      if (lv >= t.nivel) best = t;
    }
    return best;
  }

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

  function expectedNpcSellValue(baseNpcPrice, captureLevel = 1) {
    const base = Math.max(0, Number(baseNpcPrice) || 0);
    if (!base) return 0;
    const lvl = Math.min(Math.max(1, Number(captureLevel) || 1), NIVEL_TETO_VENDA_POKEMON);
    return base * (1 + lvl / 50) * AVG_QUALITY;
  }

  // Normaliza o nome exibido em #hud-hunt / #eco-onde ("Geodude · nível 1", "Geodude · Outland 2 · nível 100")
  // ou no atributo title do marcador ("Geodude — nível 1\n...").
  function normalizeHuntName(raw) {
    if (!raw) return '';
    return String(raw)
      .split(/\r?\n/)[0]
      .split(/\s*[·—]\s*/)[0]
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Só considera que já estamos na hunt alvo se estivermos em campo (inHunt === true).
  function isSameHunt({ inHunt, curSlug, curName, targetSlug, targetName }) {
    if (!inHunt) return false;
    if (curSlug && targetSlug) return curSlug === targetSlug;
    const a = normalizeHuntName(curName);
    const b = normalizeHuntName(targetName);
    return !!(a && b && a === b);
  }

  // ---------- Parsers puros de DOM ----------
  function parseIntStrict(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
    const s = String(raw || '').replace(/[^\d]/g, '');
    return s ? parseInt(s, 10) : 0;
  }

  function parseFloatPt(raw) {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    const m = String(raw || '').match(/(\d+(?:[.,]\d+)?)/);
    return m ? parseFloat(m[1].replace(',', '.')) : 0;
  }

  // Parseia texto do #ativo-card ("Charizard Nv 420\nFIRE\nFLYING\n... 7812 / 10920")
  function parseActiveCard({ text = '', types = [] }) {
    const s = String(text || '');
    const nameM = s.match(/^\s*([^\n]+?)\s+(?:Nv|Lv\.?)\s*([\d.]+)/im);
    const level = nameM ? parseIntStrict(nameM[2]) : parseIntStrict((s.match(/(?:Nv|Lv\.?)\s*([\d.]+)/i) || [])[1]);
    const name = nameM ? nameM[1].trim() : '';
    const hpM = s.match(/([\d.]+)\s*\/\s*([\d.]+)(?!\s*xp)/i);
    const hpMax = hpM ? parseIntStrict(hpM[2]) : 0;
    const cleanTypes = (types || []).map(t => String(t).trim().toUpperCase()).filter(Boolean);
    return { name, level, hpMax, types: cleanTypes };
  }

  // Parseia linhas `.fi-stat` da ficha do ativo (6 stats atuais com IV + 6 stats-base da espécie)
  function parseActiveSheet(statLines = [], fullText = '') {
    const cur = { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 };
    const ivs = { hp: 16, atk: 16, def: 16, spAtk: 16, spDef: 16, spd: 16 };
    const base = { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 };
    const mapKey = label => {
      const k = String(label || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (k === 'HP') return 'hp';
      if (k === 'ATK') return 'atk';
      if (k === 'DEF') return 'def';
      if (k === 'SPATK') return 'spAtk';
      if (k === 'SPDEF') return 'spDef';
      if (k === 'SPD' || k === 'SPEED') return 'spd';
      return null;
    };
    for (const line of (statLines || [])) {
      const txt = String(line || '').replace(/\s+/g, ' ').trim();
      const ivM = txt.match(/^(HP|ATK|DEF|SP\.?\s*ATK|SP\.?\s*DEF|SPD|SPEED)\s+([\d.]+)\s+IV\s*(\d+)/i);
      if (ivM) {
        const key = mapKey(ivM[1]);
        if (key) {
          cur[key] = parseIntStrict(ivM[2]);
          ivs[key] = Math.min(32, Math.max(1, parseInt(ivM[3], 10)));
        }
        continue;
      }
      const baseM = txt.match(/^(HP|ATK|DEF|SP\.?\s*ATK|SP\.?\s*DEF|SPD|SPEED)\s+([\d.]+)(?:\s*[·•]|\s+fixo|$)/i);
      if (baseM) {
        const key = mapKey(baseM[1]);
        if (key && !base[key]) base[key] = parseIntStrict(baseM[2]);
      }
    }
    const hpCombM = String(fullText || '').match(/HP\s+DE\s+COMBATE\s*([\d.]+)/i);
    const hpMax = hpCombM ? parseIntStrict(hpCombM[1]) : (cur.hp > 0 ? Math.max(24, Math.round(cur.hp * 12)) : 0);
    return {
      hpMax,
      atk: cur.atk,
      def: cur.def,
      spAtk: cur.spAtk,
      spDef: cur.spDef,
      spd: cur.spd,
      ivSpd: ivs.spd,
      baseSpd: base.spd || 75,
      baseStats: [base.hp, base.atk, base.def, base.spAtk, base.spDef, base.spd],
    };
  }

  // Parseia tabela de golpes da ficha da espécie (5 colunas: Golpe, Tipo, Categoria, Dano base, Cooldown)
  function parsePokedexAttacks(rows = []) {
    const out = [];
    for (const r of (rows || [])) {
      if (!Array.isArray(r) || r.length < 5) continue;
      const type = String(r[1] || '').trim().toUpperCase();
      if (!/^[A-Z]{3,10}$/.test(type)) continue;
      const catRaw = String(r[2] || '').trim().toLowerCase();
      const cat = /esp|spec/i.test(catRaw) ? 'SPECIAL' : (/fis|fís|phys/i.test(catRaw) ? 'PHYSICAL' : null);
      if (!cat) continue;
      const power = parseIntStrict(r[3]);
      const cd = parseFloatPt(r[4]);
      if (power > 0 && cd > 0) {
        out.push({ name: String(r[0] || '').trim(), type, cat, power, cd });
      }
    }
    return out;
  }

  // Parseia tabela de drops de pedras de evolução da ficha ([Item, Chance, Quantidade]) -> soma das probabilidades (0..1)
  function parsePokedexStones(rows = []) {
    let probSum = 0;
    let count = 0;
    for (const r of (rows || [])) {
      if (!Array.isArray(r) || r.length < 2) continue;
      const item = String(r[0] || '');
      if (!/stone|pedra/i.test(item) || /fragment|shiny/i.test(item)) continue;
      const pct = parseFloatPt(r[1]);
      if (pct > 0 && pct <= 100) {
        probSum += pct / 100;
        count++;
      }
    }
    return { stoneProbSum: probSum, stoneCount: count };
  }

  // Identifica poção ativa em uso (a partir de #auto-potion-opts) e sua cura/preço
  function resolvePotion({ activeChips = [], hpMax = 1000, preferredName = '' }) {
    const findByName = raw => {
      const s = String(raw || '').toLowerCase();
      return POTION_CATALOG.find(p => s.includes(p.id)) || null;
    };
    if (preferredName && preferredName !== 'auto') {
      const p = findByName(preferredName);
      if (p) return materializePotion(p, hpMax);
    }
    // Procura a 1ª poção marcada (.on) com estoque > 0 (mesma ordem do jogo: da mais barata p/ a mais cara)
    for (const ch of (activeChips || [])) {
      if (!ch || !ch.on || !(ch.stock > 0)) continue;
      const p = findByName(ch.title || ch.name);
      if (p) return materializePotion(p, hpMax);
    }
    // Fallback: qualquer poção marcada mesmo com estoque 0, ou estima pela faixa de HP
    for (const ch of (activeChips || [])) {
      if (!ch || !ch.on) continue;
      const p = findByName(ch.title || ch.name);
      if (p) return materializePotion(p, hpMax);
    }
    if (hpMax >= 6000) return materializePotion(POTION_CATALOG[5], hpMax); // Golden Potion
    if (hpMax >= 2500) return materializePotion(POTION_CATALOG[4], hpMax); // Ultimate
    if (hpMax >= 900) return materializePotion(POTION_CATALOG[3], hpMax);  // Hyper
    if (hpMax >= 350) return materializePotion(POTION_CATALOG[2], hpMax);  // Ultra
    if (hpMax >= 140) return materializePotion(POTION_CATALOG[1], hpMax);  // Great
    return materializePotion(POTION_CATALOG[0], hpMax);                    // Small
  }

  function materializePotion(p, hpMax) {
    const heal = p.healPct > 0 ? Math.max(60, Math.round(hpMax * p.healPct)) : p.healFlat;
    return { name: p.name, heal, price: p.price };
  }

  function resolveBall({ activeChips = [], cfgBall = 'Great Ball', capturing = false }) {
    const priceOf = name => {
      const k = String(name || '').toLowerCase();
      for (const [id, pr] of Object.entries(BALL_PRICES)) if (k.includes(id)) return { name, price: pr };
      return { name: name || 'Great Ball', price: 20 };
    };
    if (!capturing) return { name: cfgBall, price: 0, active: false };
    for (const ch of (activeChips || [])) {
      if (ch && ch.on && ch.stock > 0) return { ...priceOf(ch.title || ch.name), active: true };
    }
    return { ...priceOf(cfgBall), active: true };
  }

  // ---------- Simulador de combate real (fórmulas oficiais da Wiki) ----------
  function calcHitDamage(level, power, atk, def, stab, ef) {
    if (ef <= 0 || power <= 0) return 0;
    const base = (((2 * level) / 5 + 2) * power * (atk / Math.max(1, def))) / 50 + 2;
    return base * (stab ? 1.5 : 1) * ef * 0.925; // média de rand(0.85..1.00)
  }

  function fallbackAttacks(player) {
    const types = player.types && player.types.length ? player.types : ['NORMAL'];
    const cat = (player.spAtk || 0) >= (player.atk || 0) ? 'SPECIAL' : 'PHYSICAL';
    const t1 = types[0];
    const t2 = types[1] || t1;
    const out = [
      { type: t1, cat, power: 30, cd: 14 },
      { type: t1, cat, power: 40, cd: 16 },
      { type: t1, cat, power: 60, cd: 21 },
      { type: t1, cat, power: 80, cd: 25 },
      { type: t1, cat, power: 100, cd: 30 },
      { type: t1, cat, power: 120, cd: 31 },
      { type: t1, cat, power: 150, cd: 33 },
      { type: t1, cat, power: 600, cd: 60 },
    ];
    if (types.length > 1) {
      out.push(
        { type: t2, cat, power: 75, cd: 24 },
        { type: t2, cat, power: 120, cd: 31 },
        { type: t2, cat, power: 600, cd: 60 },
      );
    } else {
      out.push({ type: t1, cat, power: 600, cd: 60 });
    }
    return out;
  }

  function normalizePlayer(player) {
    const level = Math.max(1, Number(player.level) || 1);
    const types = (player.types || []).map(t => String(t).toUpperCase()).filter(Boolean);
    const hpMax = Math.max(24, Number(player.hpMax) || Math.round(((75 + 32) * (level / 100) * 1.2) * 12));
    const estStat = Math.max(10, Math.round(hpMax / 12));
    const atk = Number(player.atk) || estStat;
    const def = Number(player.def) || estStat;
    const spAtk = Number(player.spAtk) || estStat;
    const spDef = Number(player.spDef) || estStat;
    const baseSpd = Number(player.baseSpd) || 75;
    const ivSpd = Math.min(32, Math.max(1, Number(player.ivSpd) || 16));
    const attacks = Array.isArray(player.attacks) && player.attacks.length ? player.attacks : fallbackAttacks({ types, atk, spAtk });
    return { level, types, hpMax, atk, def, spAtk, spDef, baseSpd, ivSpd, attacks };
  }

  function simulateHunt({
    player,
    hunt,
    potion = null,
    ball = null,
    outlandMult = 1,
    capturing = false,
    xpMult = 1,
    bonusLootPct = 0,
    typesApi = _types,
  }) {
    const me = normalizePlayer(player || {});
    const mobTypes = (hunt.types || []).map(t => String(t).toUpperCase()).filter(Boolean);
    const lv = Math.max(1, Number(hunt.level || hunt.nivel) || 1);
    const base = Array.isArray(hunt.baseStats) && hunt.baseStats.length === 6 && hunt.baseStats.every(n => n > 0)
      ? hunt.baseStats
      : DEFAULT_BASE_STATS;

    const mobStat = b => Math.max(1, Math.round((b + 2 * MOB_AVG_IV) * (lv / 100) * MOB_STAT_FACTOR));
    const mHp = Math.max(24, Math.round(mobStat(base[0]) * 12)) * MOB_HP_MULT;
    const mAtk = mobStat(base[1]);
    const mDef = mobStat(base[2]);
    const mSpAtk = mobStat(base[3]);
    const mSpDef = mobStat(base[4]);

    const ampMult = (atkType, defTypes) => {
      if (!typesApi || !defTypes.length || !atkType) return 1;
      return typesApi.amp(typesApi.mult(atkType, defTypes));
    };

    // Desconto de cooldown por Speed (Wiki: até 7%) e GCD/Investida por IV de SPD
    const potSpd = Math.min(7, me.baseSpd <= 120 ? me.baseSpd / 20 : 6 + (me.baseSpd - 120) / 40);
    const cdMult = 1 - (potSpd * (me.ivSpd / 32)) / 100;
    const gcd = Math.max(0.4, 0.9 - 0.01 * me.ivSpd);
    const basicCd = Math.max(0.4, 2.0 - 0.01 * me.ivSpd);

    // Investida (ataque básico): física, power 30, STAB ×1.5, sempre no 1º tipo (2º só se imune)
    const t1 = me.types[0] || 'NORMAL';
    const t2 = me.types[1] || null;
    const ef1 = ampMult(t1, mobTypes);
    const efBasic = ef1 > 0 ? ef1 : (t2 ? ampMult(t2, mobTypes) : 0);
    const basicDmg = calcHitDamage(me.level, 30, me.atk, mDef, true, efBasic);

    const skills = me.attacks.map(a => {
      const aType = String(a.type || t1).toUpperCase();
      const ef = ampMult(aType, mobTypes);
      const isSpec = a.cat === 'SPECIAL';
      const d = calcHitDamage(
        me.level,
        Number(a.power) || 30,
        isSpec ? me.spAtk : me.atk,
        isSpec ? mSpDef : mDef,
        me.types.includes(aType),
        ef
      );
      return { d, cd: Math.max(1, (Number(a.cd) || 20) * cdMult), nextAt: 0 };
    }).filter(s => s.d > 0);

    // Dano do selvagem por golpe (×1.8, a cada 1.4 s)
    const mIsSpec = mSpAtk > mAtk;
    const mEfs = mobTypes.length ? mobTypes.map(t => ampMult(t, me.types)) : [1];
    const mBestEf = Math.max(...mEfs);
    const mAvgEf = mEfs.reduce((a, b) => a + b, 0) / mEfs.length;
    const mEf = 0.6 * mBestEf + 0.4 * mAvgEf;
    const mobHitDmg = calcHitDamage(lv, MOB_AVG_POWER, mIsSpec ? mSpAtk : mAtk, mIsSpec ? me.spDef : me.def, true, mEf) * MOB_DMG_MULT;

    // Simulação discreta de 300 s de hunt contínua
    let t = 0, kills = 0, dmgTaken = 0, combatTime = 0, nextBasic = 0, nextAct = 0, waveKills = 0;
    const maxEffOff = Math.max(efBasic, ...me.attacks.map(a => ampMult(String(a.type || t1).toUpperCase(), mobTypes)), 0);

    if (skills.length > 0 || basicDmg > 0) {
      while (t < SIM_DURATION_SEC) {
        t += WALK_SEC;
        if (t >= SIM_DURATION_SEC) break;
        const fightStart = t;
        let hp = mHp;
        let mobNextHit = t + 0.7;
        while (hp > 0 && t < SIM_DURATION_SEC) {
          const readyAt = Math.max(t, nextAct);
          let bestSkill = null;
          for (const s of skills) {
            if (s.nextAt <= readyAt && (!bestSkill || s.d > bestSkill.d)) bestSkill = s;
          }
          if (bestSkill) {
            t = readyAt;
            hp -= bestSkill.d;
            bestSkill.nextAt = t + bestSkill.cd;
            nextAct = t + gcd;
          } else if (nextBasic <= readyAt && basicDmg > 0) {
            t = readyAt;
            hp -= basicDmg;
            nextBasic = t + basicCd;
            nextAct = t + gcd;
          } else {
            let soonest = basicDmg > 0 ? Math.max(readyAt, nextBasic) : Infinity;
            for (const s of skills) soonest = Math.min(soonest, Math.max(readyAt, s.nextAt));
            if (!Number.isFinite(soonest)) { t = SIM_DURATION_SEC; break; }
            t = soonest;
            continue;
          }
          while (hp > 0 && mobNextHit <= t) {
            dmgTaken += mobHitDmg;
            mobNextHit += MOB_ATK_INTERVAL;
          }
        }
        if (hp <= 0) {
          combatTime += (t - fightStart);
          kills++;
          waveKills++;
          if (waveKills >= WAVE_SIZE) { t += WAVE_SEC; waveKills = 0; }
        }
      }
    }

    const kph = Math.round((kills / SIM_DURATION_SEC) * 3600);
    const ttkSec = kills > 0 ? +(combatTime / kills).toFixed(2) : 999;
    const dmgPerH = (dmgTaken / SIM_DURATION_SEC) * 3600;
    const dmgPerKill = kills > 0 ? dmgTaken / kills : mobHitDmg * 10;

    // XP e Gold por kill: usa o Hunt Analyser se disponível (já inclui VIP/Guild/Eventos/Loot Boost), senão fórmula oficial
    const xpPerKill = (Number(hunt.xp) > 0) ? (hunt.xp / ANALYSER_KPH) : (xpPerKillForLevel(lv) * Math.max(1, xpMult));
    const goldPerKill = (Number(hunt.gold) > 0) ? (hunt.gold / ANALYSER_KPH) : goldPerKillForLevel(lv, bonusLootPct);

    const xpH = Math.round(xpPerKill * kph);
    const goldH = Math.round(goldPerKill * kph);

    // Custos de poção e pokébola
    const pot = potion || resolvePotion({ hpMax: me.hpMax });
    const potionsH = pot.heal > 0 ? +(dmgPerH / pot.heal).toFixed(1) : 0;
    const potionCostH = Math.round(potionsH * pot.price);

    const ballInfo = ball || resolveBall({ capturing });
    const ballCostH = capturing && ballInfo.price > 0 ? Math.round(kph * ballInfo.price) : 0;

    // Retorno esperado de venda NPC das capturas (quando temos dados da Pokedex + captura ativa)
    let catchChance = 0;
    if (hunt.balls && hunt.balls.length && ballInfo.name) {
      const bName = String(ballInfo.name).toLowerCase();
      const row = hunt.balls.find(b => String(b.name || '').toLowerCase().includes(bName.split(' ')[0])) || hunt.balls[0];
      const ch = row ? (Number(row.catchChance) || Number(row.chance) || 0) : 0;
      if (ch > 0) catchChance = ch;
    }
    const npcSell = expectedNpcSellValue(hunt.baseNpcPrice || 0, hunt.captureLevel || lv);
    const npcCaptureH = capturing && catchChance > 0 && npcSell > 0 ? Math.round(kph * catchChance * npcSell) : 0;

    const netGoldH = goldH + npcCaptureH - potionCostH - ballCostH;

    // Pedras de evolução/h (se conhecido da Pokedex usa real; senão estima por nº de tipos e estágio/Outland)
    const isOutland = hunt.regiao === 'outland' || !!hunt.isOutland;
    const stoneProbSum = hunt.stoneProbSum > 0
      ? hunt.stoneProbSum
      : (Math.max(1, mobTypes.length) * (isOutland ? 0.005 : 0.0028));
    const stonesH = +(kph * stoneProbSum).toFixed(2);

    // Drops raros da Outland e Shiny
    const outlandScore = isOutland ? kph * Math.max(1, Number(outlandMult) || 1) : 0;
    const canShiny = hunt.canShiny != null ? !!hunt.canShiny : !isOutland;
    const shinyRate = hunt.shinyChance > 0 ? hunt.shinyChance : (canShiny ? 1 / 24000 : 0);
    const shinyScore = canShiny ? kph * (catchChance > 0 ? catchChance : 0.015) * (shinyRate * 24000) : 0;

    // Fator de segurança / sustentabilidade
    const grossIncomeH = Math.max(1, goldH + npcCaptureH);
    const potionRatio = potionCostH / grossIncomeH;
    let safetyMult = 1;
    let dangerous = false;

    if (kph <= 0) {
      safetyMult = 0;
      dangerous = true;
    } else {
      // Penaliza hunts lentas (poucos abates/h -> menos drops, capturas, pedras, shinies)
      if (kph < 240) safetyMult *= Math.max(0.15, (kph / 240) ** 0.75);
      // Penaliza gasto excessivo de poção em relação ao ganho bruto
      if (potionRatio > 0.25) {
        safetyMult *= Math.max(0.20, 1 - (potionRatio - 0.25) * 1.1);
      }
      // Risco de morte / desmaio (toma >75% do HP em 1 único mob ou morre em <=3 hits durante a luta)
      const hitsToDie = me.hpMax / Math.max(1, mobHitDmg);
      if (dmgPerKill > me.hpMax * 0.75 || (hitsToDie <= 3.2 && ttkSec > 3.5)) {
        safetyMult *= 0.25;
        dangerous = true;
      }
      if (potionRatio > 0.85 || kph < 90) dangerous = true;
    }

    const matchup = typesApi ? typesApi.matchup(me.types, mobTypes) : { off: 1, def: 1, ratio: 1, known: false };

    return {
      kph,
      ttkSec,
      xpH,
      goldH,
      npcCaptureH,
      potionsH,
      potionCostH,
      ballCostH,
      netGoldH,
      stonesH,
      outlandScore,
      shinyScore,
      isOutland,
      canShiny,
      potionRatio: +potionRatio.toFixed(3),
      safetyMult: +safetyMult.toFixed(3),
      dangerous,
      maxEffOff,
      matchup,
    };
  }

  // Pontua um pool já simulado conforme o foco escolhido ('balanced' | 'xp' | 'lucro' | 'shiny')
  function scoreSimulatedPool(items, focus = 'balanced') {
    const f = FOCUS_LABELS[focus] ? focus : 'balanced';
    const valid = items.filter(it => it.sim.kph > 0);
    const poolForMax = valid.some(it => !it.sim.dangerous) ? valid.filter(it => !it.sim.dangerous) : valid;

    const maxXp = Math.max(1, ...poolForMax.map(it => it.sim.xpH));
    const maxNet = Math.max(1, ...poolForMax.map(it => Math.max(0, it.sim.netGoldH)));
    const maxKph = Math.max(1, ...poolForMax.map(it => it.sim.kph));
    const maxStones = Math.max(0.01, ...poolForMax.map(it => it.sim.stonesH));
    const maxOutland = Math.max(1, ...poolForMax.map(it => it.sim.outlandScore));
    const maxShiny = Math.max(0.001, ...poolForMax.map(it => it.sim.shinyScore));

    return items.map(it => {
      const s = it.sim;
      if (s.kph <= 0) return { ...it, score: 0, ok: false };
      const nXp = Math.min(1.25, s.xpH / maxXp);
      const nNet = s.netGoldH >= 0
        ? Math.min(1.25, s.netGoldH / maxNet)
        : Math.max(-0.6, s.netGoldH / maxNet);
      const nKph = Math.min(1.2, s.kph / maxKph);
      const nStones = Math.min(1.2, s.stonesH / maxStones);
      const nOutland = s.isOutland ? Math.min(1.3, s.outlandScore / maxOutland) : 0;
      const nShiny = s.canShiny ? Math.min(1.2, s.shinyScore / maxShiny) : 0;

      let raw = 0;
      if (f === 'xp') {
        raw = 0.78 * nXp + 0.12 * nNet + 0.10 * nKph;
      } else if (f === 'lucro') {
        raw = 0.54 * nNet + 0.18 * nKph + 0.10 * nStones + 0.12 * nOutland + 0.06 * nXp;
      } else if (f === 'shiny') {
        raw = s.canShiny ? (0.48 * nShiny + 0.25 * nKph + 0.17 * nNet + 0.10 * nXp) : 0;
      } else {
        // balanced (padrão): equilíbrio entre XP/h real, Lucro líquido/h, abates/h, pedras e bônus de drops Outland
        raw = 0.38 * nXp + 0.35 * nNet + 0.15 * nKph + 0.06 * nStones + 0.06 * nOutland;
      }

      const score = Math.max(0, +(raw * s.safetyMult).toFixed(4));
      const ok = !s.dangerous && s.safetyMult >= 0.55 && (f !== 'shiny' || s.canShiny);
      return { ...it, score, ok };
    });
  }

  // Pré-seleciona as top candidatas da lista do Mapa para detalhar no Hunt Analyser + Pokedex (economia de tempo/cliques).
  // Diversifica entre Outland (máx 4) e patamares de nível das regiões normais para não deixar hunts fortes de fora.
  function selectCandidatesForDetail({
    hunts,
    player,
    focus = 'balanced',
    potion = null,
    ball = null,
    outlandMult = 1,
    capturing = false,
    curSlug = null,
    curName = '',
    maxCandidates = 16,
    typesApi = _types,
  }) {
    const entries = Object.entries(hunts || {});
    if (!entries.length) return [];
    const normCur = normalizeHuntName(curName);
    const simulated = entries.map(([slug, h]) => ({
      ...h,
      slug,
      nome: normalizeHuntName(h.nome || slug),
      sim: simulateHunt({ player, hunt: h, potion, ball, outlandMult, capturing, typesApi }),
    }));

    const picked = new Set();
    const bucketCounts = new Map();
    let outlandCount = 0;
    const maxOutland = 4;

    const tryAdd = (it, { ignoreCaps = false, perBucket = 3 } = {}) => {
      if (!it || picked.has(it.slug) || picked.size >= maxCandidates) return false;
      const isOut = !!(it.isOutland || it.regiao === 'outland');
      const bucket = `${it.regiao || ''}:${it.level || it.nivel || 0}`;
      if (!ignoreCaps) {
        if (isOut && outlandCount >= maxOutland) return false;
        if (!isOut && (bucketCounts.get(bucket) || 0) >= perBucket) return false;
      }
      picked.add(it.slug);
      if (isOut) outlandCount++;
      bucketCounts.set(bucket, (bucketCounts.get(bucket) || 0) + 1);
      return true;
    };

    const addList = (list, limit, opts) => {
      let added = 0;
      for (const it of list) {
        if (added >= limit || picked.size >= maxCandidates) break;
        if (tryAdd(it, opts)) added++;
      }
    };

    // 1. Sempre inclui a hunt atual para comparação exata
    const curItem = simulated.find(h => (curSlug && h.slug === curSlug) || (normCur && h.nome === normCur));
    if (curItem) tryAdd(curItem, { ignoreCaps: true });

    // 2. Top do foco principal (com diversificação de bucket para testar vários patamares de nível)
    const byFocus = scoreSimulatedPool(simulated, focus).sort((a, b) => b.score - a.score);
    addList(byFocus, 6, { perBucket: 2 });

    // 3. Diversidade: top XP (vários níveis, ex. Nv 200, 230, 290, 350), top Lucro/Outland e top Shiny
    const byXp = scoreSimulatedPool(simulated, 'xp').sort((a, b) => b.score - a.score);
    const byLucro = scoreSimulatedPool(simulated, 'lucro').sort((a, b) => b.score - a.score);
    const byShiny = scoreSimulatedPool(simulated, 'shiny').sort((a, b) => b.score - a.score);
    addList(byXp, 4, { perBucket: 2 });
    addList(byLucro, 3, { perBucket: 2 });
    addList(byShiny, 3, { perBucket: 2 });

    // 4. Preenche eventual folga com melhores remanescentes do foco principal
    addList(byFocus, maxCandidates - picked.size, { ignoreCaps: true });

    return simulated.filter(h => picked.has(h.slug)).map(h => h.slug);
  }

  // Seleciona a melhor hunt e decide entre ficar ('stay') ou trocar ('switch').
  // Se `player` for fornecido, usa o simulador real de combate/economia (v3).
  // Sem `player`, mantém o comportamento legado por matchup + xp (retrocompatível).
  function pickBestHunt({
    hunts,
    player = null,
    focus = 'balanced',
    potion = null,
    ball = null,
    outlandMult = 1,
    capturing = false,
    myTypes = [],
    curSlug = null,
    curName = '',
    inHunt = true,
    minRatio = 0.5,
    huntGain = 1.1,
    matchupFn = null,
    typesApi = _types,
  }) {
    const entries = Object.entries(hunts || {});
    if (!entries.length) return { action: 'none', reason: 'empty', best: null, current: null, ranked: [] };

    const normCur = normalizeHuntName(curName);
    let ranked;

    if (player) {
      const simulated = entries.map(([slug, h]) => {
        const sim = simulateHunt({ player, hunt: h, potion, ball, outlandMult, capturing, typesApi });
        return {
          ...h,
          slug,
          nome: normalizeHuntName(h.nome || slug),
          m: sim.matchup,
          sim,
        };
      });
      ranked = scoreSimulatedPool(simulated, focus);
    } else {
      const mFn = matchupFn || (typesApi && typesApi.matchup);
      ranked = entries.map(([slug, h]) => {
        const m = mFn ? mFn(myTypes, h.types || []) : { off: 1, def: 1, ratio: 1, known: false };
        const score = (h.xp || 0) * Math.min(1, m.ratio);
        const ok = m.off > 0 && m.ratio >= minRatio;
        const nome = normalizeHuntName(h.nome || slug);
        return { ...h, slug, nome, m, score, ok };
      });
    }

    const current = inHunt
      ? (ranked.find(h => curSlug && h.slug === curSlug)
        || ranked.find(h => normCur && h.nome === normCur)
        || null)
      : null;

    const pool = ranked.some(h => h.ok) ? ranked.filter(h => h.ok) : ranked.slice();
    pool.sort((a, b) =>
      (b.score - a.score)
      || (((b.sim && b.sim.netGoldH) || b.gold || 0) - ((a.sim && a.sim.netGoldH) || a.gold || 0))
      || (b.m.ratio - a.m.ratio)
      || ((current && b.slug === current.slug) - (current && a.slug === current.slug))
    );

    const best = pool[0];
    if (isSameHunt({ inHunt, curSlug: current ? current.slug : curSlug, curName: current ? current.nome : normCur, targetSlug: best.slug, targetName: best.nome })) {
      return { action: 'stay', reason: 'already-best', best, current, ranked: pool };
    }

    if (current && current.ok && best.score <= current.score * huntGain) {
      return { action: 'stay', reason: 'gain-below-threshold', best, current, ranked: pool };
    }

    return { action: 'switch', reason: current ? 'better-hunt' : 'enter-hunt', best, current, ranked: pool };
  }

  // Extrai segundos restantes do contador do botão de Centro Pokémon ("2.4s", "3s", "").
  function parseCenterCountdownSec(text) {
    if (!text) return 0;
    const m = String(text).match(/(\d+(?:[.,]\d+)?)\s*s/i);
    return m ? parseFloat(m[1].replace(',', '.')) : 0;
  }

  // O botão "Ir para o Centro Pokemon" (#ir-centro / #eco-ir-centro) só está livre fora dos 3s de combate.
  function isCenterButtonReady({ exists, hidden, disabled, countdownText = '' }) {
    if (!exists || hidden || disabled) return false;
    return parseCenterCountdownSec(countdownText) <= 0;
  }

  // Extrai espera (em segundos) de toasts de bloqueio em PT/EN
  function parseWaitToast(text) {
    if (!text) return null;
    const s = String(text);
    const combat = s.match(/(?:em combate|in combat).*?(?:espere|aguarde|wait)\s*(\d+(?:[.,]\d+)?)\s*s/i);
    if (combat) return { kind: 'combat', sec: parseFloat(combat[1].replace(',', '.')) };
    const gate = s.match(/(?:espere|aguarde|wait)\s*(\d+(?:[.,]\d+)?)\s*s/i);
    if (gate) return { kind: 'cooldown', sec: parseFloat(gate[1].replace(',', '.')) };
    return null;
  }

  function formatCompact(n) {
    const v = Number(n) || 0;
    const sign = v < 0 ? '-' : '';
    const abs = Math.abs(v);
    if (abs >= 1e9) return sign + (abs / 1e9).toFixed(2).replace('.', ',') + 'B';
    if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1).replace('.', ',') + 'M';
    if (abs >= 1e3) return sign + Math.round(abs / 1e3) + 'k';
    return sign + Math.round(abs);
  }

  // Decide se o Gerenciador de Hunt automático deve reavaliar imediatamente (sem esperar os 10 min):
  // - mudou espécie ou tipos do Pokémon ativo (troca de ativo ou evolução)
  // - treinador cruzou novo patamar de nível (destrava novas hunts/regiões/tiers de Outland)
  // - jogador está parado no Centro Pokémon
  function shouldAutoReeval({ prev, cur, inCenter = false }) {
    if (inCenter) return { reeval: true, reason: 'center' };
    if (!prev || !cur) return { reeval: false, reason: 'no-baseline' };
    const pName = String(prev.name || '').trim().toLowerCase();
    const cName = String(cur.name || '').trim().toLowerCase();
    if (pName && cName && pName !== cName) return { reeval: true, reason: 'active-changed' };
    const pTypes = (prev.types || []).join('/');
    const cTypes = (cur.types || []).join('/');
    if (pTypes && cTypes && pTypes !== cTypes) return { reeval: true, reason: 'types-changed' };
    const pTr = Number(prev.trainerLevel) || 0;
    const cTr = Number(cur.trainerLevel) || 0;
    if (pTr > 0 && cTr > pTr) {
      if (bestOutlandTierForLevel(cTr).numero !== bestOutlandTierForLevel(pTr).numero) {
        return { reeval: true, reason: 'outland-tier-up' };
      }
      const step = cTr < 100 ? 5 : (cTr < 500 ? 15 : 50);
      if (Math.floor(cTr / step) > Math.floor(pTr / step)) {
        return { reeval: true, reason: 'trainer-level-up' };
      }
    }
    return { reeval: false, reason: 'unchanged' };
  }

  return {
    ANALYSER_KPH,
    POTION_CATALOG,
    BALL_PRICES,
    OUTLAND_TIERS,
    FOCUS_LABELS,
    bestOutlandTierForLevel,
    xpPerKillForLevel,
    goldPerKillForLevel,
    expectedNpcSellValue,
    normalizeHuntName,
    isSameHunt,
    parseIntStrict,
    parseActiveCard,
    parseActiveSheet,
    parsePokedexAttacks,
    parsePokedexStones,
    resolvePotion,
    resolveBall,
    simulateHunt,
    scoreSimulatedPool,
    selectCandidatesForDetail,
    pickBestHunt,
    parseCenterCountdownSec,
    isCenterButtonReady,
    parseWaitToast,
    formatCompact,
    shouldAutoReeval,
  };
})();
if (typeof module !== 'undefined') module.exports = PK_HUNT;
