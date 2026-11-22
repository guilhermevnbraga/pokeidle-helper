/* Lógica pura do Analisador de Venda de Inventário (Gold vs Gema) do pokeidle.io.
   Sem acesso ao DOM nem APIs: usado por content.js e testado diretamente em Node. */
const PK_SELL = (() => {
  const TAXA_GOLD = 0.15;
  const TAXA_ITEM_GEM = 0.15;
  const MIN_PRICE_GOLD = 2;
  const MIN_PRICE_GEM = 2;
  const TIE_BAND_PCT = 3; // diferença <= 3% conta como empate técnico

  // Faixas progressivas oficiais de comissão em Gemas para Pokémon (shared/taxa-mercado.mjs)
  const POKEMON_GEM_BRACKETS = [
    { upTo: 500, bp: 1300 },
    { upTo: 5000, bp: 1000 },
    { upTo: Infinity, bp: 750 },
  ];

  const norm = s => String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  function parseIntClean(raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null;
    const s = String(raw || '').trim();
    if (!s || s === '—' || s === '-') return null;
    const digits = s.replace(/[^\d]/g, '');
    if (!digits) return null;
    const n = Number(digits);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  // Parseia número com ponto de milhar ou abreviação K/M/B/T (ex.: "6,5B", "32M", "200.000.000")
  function parseCompactNum(raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null;
    const s = String(raw || '').trim();
    if (!s || s === '—' || s === '-') return null;
    const m = s.match(/(\d+(?:\.\d{3})*(?:,\d+)?|\d+(?:[.,]\d+)?)\s*([KMBT])?\b/i);
    if (!m) return null;
    let numStr = m[1];
    const suf = (m[2] || '').toUpperCase();
    if (suf) {
      numStr = numStr.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
    } else {
      numStr = numStr.replace(/\./g, '').replace(',', '.');
    }
    const base = Number(numStr);
    if (!Number.isFinite(base) || base <= 0) return null;
    const mult = { '': 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 }[suf] || 1;
    return Math.round(base * mult);
  }

  function parseDecimal(raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
    const s = String(raw || '').trim().replace(',', '.');
    const m = s.match(/(\d+(?:\.\d+)?)/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function median(nums) {
    if (!nums.length) return 0;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  // ---------- Comissões oficiais do RMT (shared/taxa-mercado.mjs) ----------
  function netGold(unitPrice, qty = 1) {
    const q = Math.max(1, Math.floor(qty) || 1);
    const p = Math.max(0, Math.floor(unitPrice) || 0);
    const gross = p * q;
    if (gross <= 0) return { gross: 0, fee: 0, net: 0, netPerUnit: 0, effPct: 0 };
    const fee = Math.min(gross, Math.ceil(gross * TAXA_GOLD));
    const net = Math.max(0, gross - fee);
    return { gross, fee, net, netPerUnit: net / q, effPct: (fee / gross) * 100 };
  }

  function gemFeeTotal(total, kind = 'item') {
    const t = Math.floor(Number(total) || 0);
    if (t <= 0) return 0;
    if (kind !== 'pokemon') {
      return Math.min(t, Math.ceil((t * 1500) / 10000));
    }
    let floor = 0;
    let bp = 0;
    for (const b of POKEMON_GEM_BRACKETS) {
      const ceil = Math.min(t, b.upTo);
      if (ceil <= floor) break;
      bp += (ceil - floor) * b.bp;
      floor = ceil;
    }
    return Math.min(t, Math.ceil(bp / 10000));
  }

  function netGems(unitPrice, qty = 1, kind = 'item') {
    const q = kind === 'pokemon' ? 1 : Math.max(1, Math.floor(qty) || 1);
    const p = Math.max(0, Math.floor(unitPrice) || 0);
    const gross = p * q;
    if (gross <= 0) return { gross: 0, fee: 0, net: 0, netPerUnit: 0, effPct: 0 };
    const fee = gemFeeTotal(gross, kind);
    const net = Math.max(0, gross - fee);
    return { gross, fee, net, netPerUnit: net / q, effPct: (fee / gross) * 100 };
  }

  // ---------- Elegibilidade e regras de Pokémon ----------
  function pokemonOnlyGems(pk) {
    return !!(pk && pk.shiny);
  }

  function pokemonEligibility(pk) {
    if (!pk) return { eligible: false, reason: 'Pokémon inválido' };
    if (pk.shiny) return { eligible: true, reason: 'Shiny (somente Gemas)' };
    if (Number(pk.potency) === 5) return { eligible: true, reason: 'P5' };
    if (pk.legendary) return { eligible: true, reason: 'Lendário' };
    const lv = Number(pk.level) || 0;
    const nota = Number(pk.nota) || 0;
    if (lv < 50) return { eligible: false, reason: `Nível ${lv} < 50 (mín. do RMT)` };
    if (nota < 3.5) return { eligible: false, reason: `Nota ${nota.toFixed(3).replace('.', ',')} < 3,5 (mín. do RMT)` };
    return { eligible: true, reason: 'Nv 50+ e Nota 3,5+' };
  }

  // ---------- Parsers puros (média 7d, histórico de itens e pokémons, selos) ----------
  function parseAvg7d(text) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return { avg7d: null, vol7d: null };
    const avgMatch = s.match(/:\s*([\d.,]+)\s*\/?\s*(?:un|ea|u\b)/i)
      || s.match(/([\d.,]+)\s*\/\s*(?:un|ea)/i);
    const volMatch = s.match(/[·|•]\s*([\d.,]+)\s*(?:un|units?|vendid|sold)/i)
      || s.match(/([\d.,]+)\s*(?:un\.\s*vendid|units?\s*sold)/i);
    return {
      avg7d: avgMatch ? parseIntClean(avgMatch[1]) : null,
      vol7d: volMatch ? parseIntClean(volMatch[1]) : null,
    };
  }

  // Parseia linha da Tabela de Preços de Item (tanto Coins quanto Gemas)
  function parseItemHistoryRow({ itemText = '', valueText = '', isOrb = false } = {}) {
    const itemClean = String(itemText || '').replace(/\s+/g, ' ').trim();
    const m = itemClean.match(/^([\d.,]+)\s*[×x]\s*(.+)$/i);
    if (!m) return null;
    const qty = parseIntClean(m[1]);
    const name = m[2].trim();
    const total = parseIntClean(valueText);
    const minP = isOrb ? MIN_PRICE_GEM : MIN_PRICE_GOLD;
    if (!qty || qty <= 0 || !total || total <= 0 || !name) return null;
    const unitPrice = Math.round(total / qty);
    if (!Number.isFinite(unitPrice) || unitPrice < minP) return null;
    return {
      currency: isOrb ? 'gem' : 'gold',
      name,
      normName: norm(name),
      qty,
      total,
      unitPrice,
    };
  }

  // Parseia texto de selos (ex: "P2 IV 162 Q 1,600 N 3,704" ou colado "100P5IV 112Q 1,021N 4,174")
  function parsePokemonAttrs(text) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    const pM = s.match(/(?:^|[\s\d])P([1-5])(?=\s|IV|\b|$)/i);
    const ivM = s.match(/(?:^|[\s\d])IV\s*(\d+)/i);
    const qM = s.match(/(?:^|[\s\d])Q\s*(\d+[.,]\d+|\d+)/i);
    const nM = s.match(/(?:^|[\s\d])N\s*(\d+[.,]\d+|\d+)/i);
    const lvM = s.match(/\bNv\.?\s*(\d+)/i) || s.match(/\bLv\.?\s*(\d+)/i);
    const shiny = /✨|\bshiny\b/i.test(s);
    const mega = /\bmega\b/i.test(s);
    return {
      potency: pM ? parseInt(pM[1], 10) : null,
      iv: ivM ? parseInt(ivM[1], 10) : null,
      quality: qM ? parseDecimal(qM[1]) : null,
      nota: nM ? parseDecimal(nM[1]) : null,
      level: lvM ? parseInt(lvM[1], 10) : null,
      shiny,
      mega,
    };
  }

  // Parseia linha da Tabela de Preços de Pokémon (Coins ou Gemas)
  // Ex.: itemTitle="Brave Charizard Nv 100 · Ver ficha", itemTxt="Brave Charizard Nv 100P5IV 112Q 1,021N 4,174", valTxt="200.000.000"
  function parsePokemonHistoryRow({ itemTitle = '', itemText = '', valueText = '', isOrb = false, isShiny = false } = {}) {
    const titleBase = String(itemTitle || '').split('·')[0].trim();
    const fullText = String(itemText || '').trim();
    const speciesSource = titleBase || fullText;
    const spM = speciesSource.match(/^(?:✨\s*)?(?:Shiny\s+)?(.+?)\s+(?:Nv\.?|Lv\.?)\s*(\d+)/i);
    if (!spM) return null;
    const species = spM[1].replace(/^✨\s*/, '').trim();
    const level = parseInt(spM[2], 10) || 1;
    const price = parseIntClean(valueText) || parseCompactNum(valueText);
    const minP = isOrb ? MIN_PRICE_GEM : MIN_PRICE_GOLD;
    if (!species || !price || price < minP) return null;
    const attrs = parsePokemonAttrs(fullText);
    const shiny = !!(isShiny || attrs.shiny || /✨|\bshiny\b/i.test(titleBase));
    return {
      currency: isOrb ? 'gem' : 'gold',
      species,
      normSpecies: norm(species),
      level,
      potency: attrs.potency || 1,
      iv: attrs.iv,
      quality: attrs.quality,
      nota: attrs.nota,
      shiny,
      mega: attrs.mega || /^mega\s+/i.test(species),
      price,
    };
  }

  // ---------- Taxa de câmbio Coins/Gema ----------
  // Deriva a taxa real de conversão Coins -> 1 Gema a partir do Radar RMT (melhor rota líquida)
  // ou de um fallback explícito (ex.: mediana dos itens fungíveis da lista do RMT).
  function extractExchangeRate({ rmtRoutes = [], fallbackCoinsPerGem = null, fallbackLabel = 'lista RMT' } = {}) {
    const valid = (rmtRoutes || [])
      .filter(r => r && r.kind !== 'pokemon' && Number.isFinite(r.coinsPerGem) && r.coinsPerGem > 0)
      .slice()
      .sort((a, b) => a.coinsPerGem - b.coinsPerGem);
    if (valid.length) {
      const top = valid[0];
      return {
        coinsPerGem: top.coinsPerGem,
        source: top.source === 'book' ? 'radar-book' : 'radar-list',
        label: top.label || top.marketName || 'Radar RMT',
      };
    }
    if (Number.isFinite(fallbackCoinsPerGem) && fallbackCoinsPerGem > 0) {
      return {
        coinsPerGem: fallbackCoinsPerGem,
        source: 'fallback',
        label: fallbackLabel,
      };
    }
    return null;
  }

  // Estima Coins/Gema a partir de pares { coins, gems } lidos da lista de itens líquidos (tabela esquerda do RMT)
  function estimateRateFromItemList(rows) {
    const rates = [];
    for (const r of (rows || [])) {
      if (!r || !Number.isFinite(r.coins) || !Number.isFinite(r.gems)) continue;
      if (r.coins <= 0 || r.gems < MIN_PRICE_GEM) continue;
      // Usa lote de 10 para itens baratos (< 10G) e 1 para itens caros, aplicando comissão oficial 15%
      const lot = r.gems < 10 ? 10 : 1;
      const ng = netGems(Math.max(MIN_PRICE_GEM, r.gems - (r.gems >= 5 ? 1 : 0)), lot, 'item');
      if (ng.netPerUnit <= 0) continue;
      rates.push({ label: r.name || 'Item RMT', coinsPerGem: r.coins / ng.netPerUnit });
    }
    if (!rates.length) return null;
    rates.sort((a, b) => a.coinsPerGem - b.coinsPerGem);
    return {
      coinsPerGem: rates[0].coinsPerGem,
      source: 'rmt-list',
      label: rates[0].label,
    };
  }

  // ---------- Análise de book e histórico de ITENS (Coins ou Gemas) ----------
  function summarizeProvenItemSales(sales, { avg7d = null, currency = 'gold' } = {}) {
    const minP = currency === 'gem' ? MIN_PRICE_GEM : MIN_PRICE_GOLD;
    const clean = (sales || []).filter(s => s && Number.isFinite(s.unitPrice) && s.unitPrice >= minP && s.qty > 0);
    if (!clean.length) {
      return { validCount: 0, totalUnits: 0, maxProven: null, minProven: null, weightedAvg: null, medianPrice: null, discarded: 0 };
    }
    const ref = (Number.isFinite(avg7d) && avg7d >= minP)
      ? avg7d
      : (clean.length >= 3 ? median(clean.map(s => s.unitPrice)) : 0);

    const valid = [];
    let discarded = 0;
    for (const s of clean) {
      if (ref > 0) {
        const maxMult = s.qty === 1 ? 1.85 : 2.5;
        const minMult = 0.15;
        if (s.unitPrice > ref * maxMult || s.unitPrice < Math.max(minP, Math.floor(ref * minMult))) {
          discarded++;
          continue;
        }
      }
      valid.push(s);
    }
    if (!valid.length) {
      return { validCount: 0, totalUnits: 0, maxProven: null, minProven: null, weightedAvg: null, medianPrice: null, discarded };
    }
    let maxProven = 0, minProven = Infinity, totalUnits = 0, weightedSum = 0;
    for (const s of valid) {
      if (s.unitPrice > maxProven) maxProven = s.unitPrice;
      if (s.unitPrice < minProven) minProven = s.unitPrice;
      totalUnits += s.qty;
      weightedSum += s.unitPrice * s.qty;
    }
    return {
      validCount: valid.length,
      totalUnits,
      maxProven,
      minProven,
      weightedAvg: Math.round(weightedSum / totalUnits),
      medianPrice: median(valid.map(s => s.unitPrice)),
      discarded,
    };
  }

  function analyzeItemBook(offers, { avg7d = null, currency = 'gold' } = {}) {
    const minP = currency === 'gem' ? MIN_PRICE_GEM : MIN_PRICE_GOLD;
    const free = [];
    const held = [];
    for (const o of (offers || [])) {
      if (!o || !Number.isFinite(o.price) || o.price < minP) continue;
      if (o.own) continue;
      const qty = Math.max(1, Math.floor(o.qty) || 1);
      if (o.held) held.push({ price: Math.floor(o.price), qty });
      else free.push({ price: Math.floor(o.price), qty });
    }
    free.sort((a, b) => a.price - b.price);
    held.sort((a, b) => a.price - b.price);

    const levels = [];
    for (const o of free) {
      const last = levels[levels.length - 1];
      if (last && last.price === o.price) last.qty += o.qty;
      else levels.push({ price: o.price, qty: o.qty });
    }

    // Descarta micro-iscas no topo (<= 5 un. acumuladas com preço < 92% do próximo nível)
    let idx = 0, skippedBaitUnits = 0;
    while (idx + 1 < levels.length) {
      const cur = levels[idx];
      const next = levels[idx + 1];
      if (cur.qty <= 3 && skippedBaitUnits + cur.qty <= 5 && cur.price < next.price * 0.92) {
        skippedBaitUnits += cur.qty;
        idx++;
      } else {
        break;
      }
    }

    // Pula parede pequena de dump (< 50% da avg7d) antes de ofertas normais (>= 60% avg7d)
    if (Number.isFinite(avg7d) && avg7d >= minP && idx < levels.length) {
      let dumpUnits = 0, nextNormalIdx = -1;
      for (let i = idx; i < levels.length; i++) {
        if (levels[i].price < avg7d * 0.60) dumpUnits += levels[i].qty;
        else { nextNormalIdx = i; break; }
      }
      if (nextNormalIdx > idx && levels[idx].price < avg7d * 0.50 && dumpUnits <= 100) {
        skippedBaitUnits += dumpUnits;
        idx = nextNormalIdx;
      }
    }

    const bestLevel = levels[idx] || null;
    return {
      bestFree: bestLevel ? bestLevel.price : null,
      bestFreeQty: bestLevel ? bestLevel.qty : 0,
      totalFreeUnits: levels.slice(idx).reduce((s, l) => s + l.qty, 0),
      freeLevels: levels.slice(idx, idx + 6),
      bestHeld: held.length ? held[0].price : null,
      skippedBaitUnits,
    };
  }

  // Decide o melhor preço de venda de um ITEM em uma moeda específica ('gold' ou 'gem')
  function evaluateItemCurrency({
    currency = 'gold',
    qty = 1,
    offers = [],
    avg7d = null,
    vol7d = null,
    recentSales = [],
  } = {}) {
    const minP = currency === 'gem' ? MIN_PRICE_GEM : MIN_PRICE_GOLD;
    const q = Math.max(1, Math.floor(qty) || 1);
    const avg = (Number.isFinite(avg7d) && avg7d >= minP) ? Math.round(avg7d) : null;
    const vol = (Number.isFinite(vol7d) && vol7d >= 0) ? Math.round(vol7d) : null;
    const book = analyzeItemBook(offers, { avg7d: avg, currency });
    const proven = summarizeProvenItemSales(recentSales, { avg7d: avg, currency });
    const warnings = [];

    const provenCeiling = Math.max(avg || 0, proven.maxProven || 0) || null;
    if (provenCeiling == null && book.bestFree == null) {
      return {
        currency,
        available: false,
        unitPrice: null,
        gross: 0,
        fee: 0,
        net: 0,
        effPct: 0,
        source: 'sem dados de mercado',
        bestFree: null,
        avg7d: avg,
        vol7d: vol,
        maxProven: null,
        provenCount: 0,
        confidence: 'none',
        warnings: ['sem ofertas livres nem histórico nesta moeda'],
      };
    }

    // Em Gemas com preço muito baixo (<= 4G), fazer undercut de 1 pode derrubar 25-50% do preço:
    // só dá undercut se o book tiver preço >= 5 (ou se book for maior que o teto comprovado).
    const undercut = currency === 'gem'
      ? (book.bestFree != null && book.bestFree >= 5 ? 1 : 0)
      : 1;
    const bookTarget = book.bestFree != null ? Math.max(minP, book.bestFree - undercut) : provenCeiling;

    let unitPrice;
    let source;
    if (provenCeiling != null) {
      if (book.bestFree == null) {
        unitPrice = provenCeiling;
        source = (proven.maxProven && proven.maxProven >= (avg || 0))
          ? 'máx. venda comprovada (sem livre)'
          : 'média 7d (sem livre)';
      } else if (bookTarget <= provenCeiling) {
        unitPrice = bookTarget;
        source = undercut > 0 ? '1 abaixo do menor livre' : 'no menor livre';
      } else {
        unitPrice = provenCeiling;
        source = (proven.maxProven && proven.maxProven >= (avg || 0))
          ? 'máx. venda comprovada'
          : 'média vendida 7d';
      }
    } else {
      unitPrice = bookTarget;
      source = undercut > 0 ? '1 abaixo do menor livre (sem hist.)' : 'menor livre (sem hist.)';
      warnings.push('sem histórico 7d confirmado');
    }

    unitPrice = Math.max(minP, Math.floor(unitPrice));

    // Aviso de dump no book (diferente de pedras em lote, aqui informamos ao usuário sem bloquear)
    const recentConfirmsCrash = proven.validCount > 0 && proven.maxProven != null && avg != null && proven.maxProven < avg * 0.65;
    if (avg != null && unitPrice < Math.floor(avg * 0.50) && !recentConfirmsCrash) {
      warnings.push(`book muito abaixo da média 7d (${unitPrice} vs ${avg})`);
    }
    if (vol === 0 && proven.validCount === 0) {
      warnings.push('baixa liquidez (0 vendas 7d)');
    }

    const fin = currency === 'gem' ? netGems(unitPrice, q, 'item') : netGold(unitPrice, q);
    if (currency === 'gem' && fin.effPct >= 22) {
      warnings.push(`taxa efetiva ${Math.round(fin.effPct)}% (arredondamento em lote pequeno)`);
    }

    const confidence = (proven.validCount > 0 || (avg != null && (vol == null || vol > 0)))
      ? (book.bestFree != null ? 'high' : 'medium')
      : 'low';

    return {
      currency,
      available: fin.net > 0,
      unitPrice,
      gross: fin.gross,
      fee: fin.fee,
      net: fin.net,
      effPct: fin.effPct,
      source,
      bestFree: book.bestFree,
      avg7d: avg,
      vol7d: vol,
      maxProven: proven.maxProven,
      provenCount: proven.validCount,
      confidence,
      warnings,
    };
  }

  // ---------- Análise de comparáveis e precificação de POKÉMON ----------
  // Calcula peso de similaridade [0..1] entre o Pokémon do usuário e um anúncio/venda do mercado.
  function scoreComparablePokemon(target, comp) {
    if (!target || !comp) return 0;
    if (norm(target.species) !== norm(comp.species)) return 0;
    // Shiny e Mega são mercados completamente distintos
    if (!!target.shiny !== !!comp.shiny) return 0;
    if (!!target.mega !== !!comp.mega) return 0;
    // P5 tem prêmio próprio: não misturar P5 com P1-P4
    const tP5 = Number(target.potency) === 5;
    const cP5 = Number(comp.potency) === 5;
    if (tP5 !== cP5) return 0;

    let score = 1.0;

    // Proximidade de Nota (peso mais forte depois de espécie/shiny/P5)
    if (Number.isFinite(target.nota) && Number.isFinite(comp.nota)) {
      const diffN = Math.abs(target.nota - comp.nota);
      if (diffN > 1.8) return 0; // nota muito distante não é comparável
      score *= Math.max(0.2, 1 - diffN / 2.2);
    }

    // Proximidade de Potência (para P1..P4)
    if (!tP5 && Number.isFinite(target.potency) && Number.isFinite(comp.potency)) {
      const diffP = Math.abs(target.potency - comp.potency);
      score *= Math.max(0.35, 1 - diffP * 0.22);
    }

    // Proximidade de Nível (nível alto >= 200 agrega valor relevante de treino:
    // não misturar Nv 100 recém-capturado com Pokémon treinado Nv 500+)
    if (Number.isFinite(target.level) && Number.isFinite(comp.level)) {
      const tLv = Math.max(1, target.level);
      const cLv = Math.max(1, comp.level);
      const ratio = Math.min(tLv, cLv) / Math.max(tLv, cLv);
      if (tLv >= 200 || cLv >= 200) {
        if (ratio < 0.45) return 0;
        score *= Math.max(0.35, ratio);
      } else {
        score *= Math.max(0.6, 0.6 + 0.4 * ratio);
      }
    }

    // Z-Move / TM AoE se informados nos dois lados
    if (target.hasZMove != null && comp.hasZMove != null && !!target.hasZMove !== !!comp.hasZMove) {
      score *= 0.55;
    }
    if (target.hasAoe != null && comp.hasAoe != null && !!target.hasAoe !== !!comp.hasAoe) {
      score *= 0.55;
    }

    return score;
  }

  function filterOutliers(items, getVal) {
    if (items.length < 4) return items;
    const med = median(items.map(getVal));
    if (med <= 0) return items;
    const filtered = items.filter(it => {
      const v = getVal(it);
      return v >= med * 0.25 && v <= med * 3.5;
    });
    return filtered.length ? filtered : items;
  }

  function weightedAvgPrice(items) {
    let sumW = 0, sumV = 0;
    for (const it of items) {
      const w = it.weight || 1;
      sumW += w;
      sumV += it.price * w;
    }
    return sumW > 0 ? Math.round(sumV / sumW) : null;
  }

  // Decide o melhor preço de venda de um POKÉMON em uma moeda ('gold' ou 'gem')
  function evaluatePokemonCurrency({
    pokemon,
    currency = 'gold',
    listings = [],
    sales = [],
  } = {}) {
    const minP = currency === 'gem' ? MIN_PRICE_GEM : MIN_PRICE_GOLD;
    if (currency === 'gold' && pokemonOnlyGems(pokemon)) {
      return {
        currency,
        available: false,
        blockedReason: 'Shiny só pode ser anunciado em Gemas',
        unitPrice: null,
        gross: 0,
        fee: 0,
        net: 0,
        effPct: 0,
        source: 'bloqueado pelo jogo',
        bestFree: null,
        medianSale: null,
        comparableListings: 0,
        comparableSales: 0,
        confidence: 'none',
        warnings: ['Pokémon Shiny só pode ser vendido em Gemas no RMT'],
      };
    }

    const freeListings = (listings || [])
      .filter(l => l && !l.own && !l.held && Number.isFinite(l.price) && l.price >= minP)
      .map(l => ({ ...l, weight: scoreComparablePokemon(pokemon, l) }))
      .filter(l => l.weight > 0);

    const compSales = (sales || [])
      .filter(s => s && Number.isFinite(s.price) && s.price >= minP)
      .map(s => ({ ...s, weight: scoreComparablePokemon(pokemon, s) }))
      .filter(s => s.weight > 0);

    // Se não achou comparável estrito por nota, relaxa apenas para mesma espécie + shiny + P5 (marcando baixa confiança)
    let relaxed = false;
    let useListings = filterOutliers(freeListings, x => x.price);
    let useSales = filterOutliers(compSales, x => x.price);

    if (!useListings.length && !useSales.length) {
      const looseMatch = c => c && norm(c.species) === norm(pokemon.species)
        && !!c.shiny === !!pokemon.shiny
        && !!c.mega === !!pokemon.mega
        && (Number(c.potency) === 5) === (Number(pokemon.potency) === 5);
      const looseL = (listings || [])
        .filter(l => l && !l.own && !l.held && Number.isFinite(l.price) && l.price >= minP && looseMatch(l))
        .map(l => ({ ...l, weight: 0.3 }));
      const looseS = (sales || [])
        .filter(s => s && Number.isFinite(s.price) && s.price >= minP && looseMatch(s))
        .map(s => ({ ...s, weight: 0.3 }));
      if (looseL.length || looseS.length) {
        relaxed = true;
        useListings = filterOutliers(looseL, x => x.price);
        useSales = filterOutliers(looseS, x => x.price);
      }
    }

    if (!useListings.length && !useSales.length) {
      return {
        currency,
        available: false,
        unitPrice: null,
        gross: 0,
        fee: 0,
        net: 0,
        effPct: 0,
        source: 'sem comparáveis nesta moeda',
        bestFree: null,
        medianSale: null,
        comparableListings: 0,
        comparableSales: 0,
        confidence: 'none',
        warnings: ['nenhum Pokémon similar encontrado nesta moeda'],
      };
    }

    useListings.sort((a, b) => a.price - b.price);
    const bestFree = useListings.length ? useListings[0].price : null;
    const topListings = useListings.slice(0, 5);
    const floorRef = topListings.length ? weightedAvgPrice(topListings) : null;
    const saleAvg = useSales.length ? weightedAvgPrice(useSales) : null;
    const medianSale = useSales.length ? median(useSales.map(s => s.price)) : null;
    const maxSale = useSales.length ? Math.max(...useSales.map(s => s.price)) : null;

    const warnings = [];
    if (relaxed) warnings.push('poucos comparáveis exatos (referência ampla da espécie)');

    const undercut = currency === 'gem'
      ? (bestFree != null && bestFree >= 10 ? 1 : 0)
      : (bestFree != null && bestFree >= 1000 ? Math.max(1, Math.min(1000, Math.floor(bestFree * 0.005))) : 1);

    let unitPrice;
    let source;
    if (saleAvg != null && bestFree != null) {
      // Se existem vendas comprovadas e anúncios ativos:
      // - Se o menor anúncio livre está barato demais (abaixo das vendas), posiciona 1 abaixo do menor livre
      //   para não encalhar, ou até a média vendida se o book estiver caro acima das vendas reais.
      const competitive = Math.max(minP, bestFree - undercut);
      if (competitive <= Math.round(saleAvg * 1.15)) {
        unitPrice = competitive;
        source = 'abaixo do menor anúncio similar';
      } else {
        unitPrice = Math.max(minP, Math.round(saleAvg));
        source = 'média de vendas comprovadas (book acima)';
      }
    } else if (saleAvg != null) {
      unitPrice = Math.max(minP, Math.round(saleAvg));
      source = `média de ${useSales.length} venda(s) comprovada(s)`;
    } else {
      unitPrice = Math.max(minP, bestFree - undercut);
      source = `abaixo do menor de ${useListings.length} anúncio(s) (sem hist.)`;
      warnings.push('sem vendas recentes no histórico nesta moeda');
    }

    // Se o Pokémon do usuário tem nível bem superior (> 1.5x) ou nota bem acima (+0.4) dos comparáveis, avisa
    if (useListings.length || useSales.length) {
      const pool = useSales.length ? useSales : topListings;
      const avgCompLv = pool.reduce((s, x) => s + (x.level || 100), 0) / pool.length;
      const avgCompNota = pool.filter(x => Number.isFinite(x.nota)).reduce((s, x, _, a) => s + x.nota / a.length, 0);
      if (Number.isFinite(pokemon.level) && pokemon.level > avgCompLv * 1.5 && pokemon.level >= 200) {
        warnings.push(`seu Nv ${pokemon.level} é maior que a média dos comparáveis (~Nv ${Math.round(avgCompLv)}): pode valer mais`);
      }
      if (Number.isFinite(pokemon.nota) && avgCompNota > 0 && pokemon.nota >= avgCompNota + 0.4) {
        warnings.push(`sua Nota ${pokemon.nota.toFixed(2).replace('.', ',')} supera os comparáveis (~${avgCompNota.toFixed(2).replace('.', ',')}): pode pedir prêmio`);
      }
    }

    const fin = currency === 'gem' ? netGems(unitPrice, 1, 'pokemon') : netGold(unitPrice, 1);
    const confidence = !relaxed && useSales.length >= 2
      ? 'high'
      : (!relaxed && (useSales.length >= 1 || useListings.length >= 3) ? 'medium' : 'low');

    return {
      currency,
      available: fin.net > 0,
      unitPrice,
      gross: fin.gross,
      fee: fin.fee,
      net: fin.net,
      effPct: fin.effPct,
      source,
      bestFree,
      floorRef,
      medianSale,
      maxSale,
      comparableListings: useListings.length,
      comparableSales: useSales.length,
      confidence,
      warnings,
    };
  }

  // ---------- Comparação Gold vs Gema e Veredito ----------
  function compareSaleOptions({
    kind = 'item',
    name = '',
    qty = 1,
    goldEval,
    gemEval,
    exchangeRate = null,
    onlyGems = false,
  } = {}) {
    const gOk = !!(goldEval && goldEval.available && goldEval.net > 0);
    const oOk = !!(gemEval && gemEval.available && gemEval.net > 0);
    const cpg = exchangeRate && Number.isFinite(exchangeRate.coinsPerGem) && exchangeRate.coinsPerGem > 0
      ? exchangeRate.coinsPerGem
      : null;

    const goldEquivGems = (gOk && cpg) ? goldEval.net / cpg : null;
    const gemEquivGold = (oOk && cpg) ? Math.round(gemEval.net * cpg) : null;
    const impliedCoinsPerGem = (gOk && oOk) ? goldEval.net / gemEval.net : null;

    let bestCurrency = 'none';
    let advantagePct = 0;
    let headline = 'Sem dados suficientes para recomendar';
    let explanation = '';

    if (onlyGems) {
      if (oOk) {
        bestCurrency = 'gem';
        headline = 'VENDER EM GEMAS (regra Shiny)';
        explanation = `Shiny só pode ser vendido em Gemas: recebe ${gemEval.net.toLocaleString('pt-BR')} G líq.${gemEquivGold ? ` (≈ ${formatCoins(gemEquivGold)} Coins)` : ''}.`;
      } else {
        bestCurrency = 'none';
        headline = 'SOMENTE GEMAS (sem comparáveis)';
        explanation = 'Shiny só pode ser vendido em Gemas, mas não encontramos anúncios ou vendas similares.';
      }
    } else if (gOk && !oOk) {
      bestCurrency = 'gold';
      headline = 'VENDER EM GOLD (única moeda com mercado)';
      explanation = `Sem ofertas/histórico confiáveis em Gemas. Em Gold recebe ${formatCoins(goldEval.net)} líq.${goldEquivGems ? ` (≈ ${goldEquivGems.toFixed(1).replace('.', ',')} G)` : ''}.`;
    } else if (!gOk && oOk) {
      bestCurrency = 'gem';
      headline = 'VENDER EM GEMAS (única moeda com mercado)';
      explanation = `Sem ofertas/histórico confiáveis em Gold. Em Gemas recebe ${gemEval.net.toLocaleString('pt-BR')} G líq.${gemEquivGold ? ` (≈ ${formatCoins(gemEquivGold)} Coins)` : ''}.`;
    } else if (gOk && oOk) {
      if (cpg) {
        const diffPct = ((gemEquivGold - goldEval.net) / goldEval.net) * 100;
        const absDiff = Math.abs(diffPct);
        if (absDiff <= TIE_BAND_PCT) {
          // Desempata pela moeda com maior confiança/liquidez
          const confRank = { high: 3, medium: 2, low: 1, none: 0 };
          const gScore = (confRank[goldEval.confidence] || 0) * 10 + Math.min(9, goldEval.provenCount || goldEval.comparableSales || 0);
          const oScore = (confRank[gemEval.confidence] || 0) * 10 + Math.min(9, gemEval.provenCount || gemEval.comparableSales || 0);
          bestCurrency = 'tie';
          advantagePct = Math.round(absDiff * 10) / 10;
          const pref = oScore > gScore ? 'Gemas' : 'Gold';
          headline = `EMPATE (~${Math.round(absDiff)}%) · prefira ${pref}`;
          explanation = `Retorno equivalente quase igual (Gold ${formatCoins(goldEval.net)} vs Gemas ≈ ${formatCoins(gemEquivGold)}). ${pref} tem liquidez/referência igual ou melhor.`;
        } else if (gemEquivGold > goldEval.net) {
          bestCurrency = 'gem';
          advantagePct = Math.round(diffPct);
          headline = `MELHOR: VENDER EM GEMAS (+${advantagePct}% valor)`;
          explanation = `${gemEval.net.toLocaleString('pt-BR')} G líq. equivale a ~${formatCoins(gemEquivGold)} Coins (câmbio ${formatCoins(cpg)}/G), contra ${formatCoins(goldEval.net)} vendendo direto em Gold.`;
        } else {
          const goldAdvPct = Math.round(((goldEval.net - gemEquivGold) / gemEquivGold) * 100);
          bestCurrency = 'gold';
          advantagePct = goldAdvPct;
          headline = `MELHOR: VENDER EM GOLD (+${goldAdvPct}% valor)`;
          explanation = `${formatCoins(goldEval.net)} líq. compra ~${goldEquivGems.toFixed(1).replace('.', ',')} G via RMT (${formatCoins(cpg)}/G), contra ${gemEval.net.toLocaleString('pt-BR')} G vendendo direto em Gemas.`;
        }
      } else {
        bestCurrency = 'tie';
        headline = 'SEM CÂMBIO RMT (escaneie Radar RMT)';
        explanation = `Gold líq.: ${formatCoins(goldEval.net)} vs Gemas líq.: ${gemEval.net.toLocaleString('pt-BR')} G (razão ${formatCoins(impliedCoinsPerGem)}/G). Escaneie o Radar RMT para comparar na mesma base.`;
      }
    }

    const warnings = [];
    if (!cpg && gOk && oOk) warnings.push('Câmbio Coins/Gema indisponível: rode o Radar RMT para ver qual compensa mais.');
    if (goldEval && goldEval.warnings) {
      for (const w of goldEval.warnings) warnings.push(`Gold: ${w}`);
    }
    if (gemEval && gemEval.warnings) {
      for (const w of gemEval.warnings) warnings.push(`Gemas: ${w}`);
    }

    return {
      kind,
      name,
      qty: kind === 'pokemon' ? 1 : Math.max(1, Math.floor(qty) || 1),
      bestCurrency,
      advantagePct,
      headline,
      explanation,
      gold: goldEval,
      gem: gemEval,
      goldEquivGems,
      gemEquivGold,
      impliedCoinsPerGem,
      exchangeRate,
      warnings,
    };
  }

  function analyzeItemSale({
    name = '',
    qty = 1,
    goldBook = {},
    gemBook = {},
    goldSales = [],
    gemSales = [],
    exchangeRate = null,
  } = {}) {
    const goldEval = evaluateItemCurrency({
      currency: 'gold',
      qty,
      offers: goldBook.offers || [],
      avg7d: goldBook.avg7d ?? null,
      vol7d: goldBook.vol7d ?? null,
      recentSales: goldSales,
    });
    const gemEval = evaluateItemCurrency({
      currency: 'gem',
      qty,
      offers: gemBook.offers || [],
      avg7d: gemBook.avg7d ?? null,
      vol7d: gemBook.vol7d ?? null,
      recentSales: gemSales,
    });
    return compareSaleOptions({
      kind: 'item',
      name,
      qty,
      goldEval,
      gemEval,
      exchangeRate,
      onlyGems: false,
    });
  }

  function analyzePokemonSale({
    pokemon,
    goldListings = [],
    gemListings = [],
    goldSales = [],
    gemSales = [],
    exchangeRate = null,
  } = {}) {
    const goldEval = evaluatePokemonCurrency({
      pokemon,
      currency: 'gold',
      listings: goldListings,
      sales: goldSales,
    });
    const gemEval = evaluatePokemonCurrency({
      pokemon,
      currency: 'gem',
      listings: gemListings,
      sales: gemSales,
    });
    const label = pokemon
      ? `${pokemon.shiny ? '✨ ' : ''}${pokemon.species} Nv ${pokemon.level || '?'}`
      : 'Pokémon';
    return compareSaleOptions({
      kind: 'pokemon',
      name: label,
      qty: 1,
      goldEval,
      gemEval,
      exchangeRate,
      onlyGems: pokemonOnlyGems(pokemon),
    });
  }

  function formatCoins(n) {
    if (!Number.isFinite(n) || n <= 0) return '0';
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '').replace('.', ',') + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '').replace('.', ',') + 'K';
    return Math.round(n).toLocaleString('pt-BR');
  }

  function formatGems(n) {
    if (!Number.isFinite(n) || n <= 0) return '0 G';
    if (n >= 100) return Math.round(n).toLocaleString('pt-BR') + ' G';
    return (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',')) + ' G';
  }

  return {
    TAXA_GOLD,
    TAXA_ITEM_GEM,
    MIN_PRICE_GOLD,
    MIN_PRICE_GEM,
    TIE_BAND_PCT,
    POKEMON_GEM_BRACKETS,
    norm,
    parseIntClean,
    parseCompactNum,
    parseDecimal,
    netGold,
    gemFeeTotal,
    netGems,
    pokemonOnlyGems,
    pokemonEligibility,
    parseAvg7d,
    parseItemHistoryRow,
    parsePokemonAttrs,
    parsePokemonHistoryRow,
    extractExchangeRate,
    estimateRateFromItemList,
    summarizeProvenItemSales,
    analyzeItemBook,
    evaluateItemCurrency,
    scoreComparablePokemon,
    evaluatePokemonCurrency,
    compareSaleOptions,
    analyzeItemSale,
    analyzePokemonSale,
    formatCoins,
    formatGems,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PK_SELL;
