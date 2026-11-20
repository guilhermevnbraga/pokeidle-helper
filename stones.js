/* Lógica pura da Venda de Pedras no Mercado da Comunidade (RMT — Coins) do pokeidle.io.
   Sem acesso ao DOM nem APIs: usado por content.js e testado diretamente em Node. */
const PK_STONES = (() => {
  const COMMISSION_RATE = 0.15;
  const MIN_PRICE = 2;

  // 17 pedras de evolução confirmadas no DOM (RMT -> Itens -> Pedras, data-cat="stone").
  const KNOWN_STONES = [
    { id: '2', name: 'Ancient Stone' },
    { id: '23', name: 'Cocoon Stone' },
    { id: '31', name: 'Darkness Stone' },
    { id: '40', name: 'Earth Stone' },
    { id: '45', name: 'Enigma Stone' },
    { id: '49', name: 'Feather Stone' },
    { id: '53', name: 'Fire Stone' },
    { id: '66', name: 'Heart Stone' },
    { id: '71', name: 'Ice Stone' },
    { id: '76', name: 'Leaf Stone' },
    { id: '87', name: 'Metal Stone' },
    { id: '106', name: 'Punch Stone' },
    { id: '109', name: 'Rock Stone' },
    { id: '133', name: 'Thunder Stone' },
    { id: '139', name: 'Venom Stone' },
    { id: '142', name: 'Water Stone' },
    { id: '209', name: 'Sun Stone' },
  ];

  const KNOWN_STONE_IDS = new Set(KNOWN_STONES.map(s => s.id));
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const KNOWN_STONE_NAMES = new Set(KNOWN_STONES.map(s => norm(s.name)));

  function parseIntClean(raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? Math.round(raw) : null;
    const s = String(raw || '').trim();
    if (!s || s === '—' || s === '-') return null;
    const digits = s.replace(/[^\d]/g, '');
    if (!digits) return null;
    const n = Number(digits);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function isStoneItem({ id = null, name = '', hasTypeChip = false, stoneIds = null } = {}) {
    const n = norm(name);
    if (/\b(frag|fragmento|fragment)\b/.test(n)) return false;
    const idStr = id != null && id !== '' ? String(id).trim() : '';
    if (stoneIds && stoneIds.size > 0) {
      if (idStr && stoneIds.has(idStr)) return true;
      // Se o catálogo dinâmico da aba Pedras foi fornecido e temos ID, confia nele + chip
      if (idStr && !hasTypeChip) return false;
    }
    if (idStr && KNOWN_STONE_IDS.has(idStr)) return true;
    if (n && KNOWN_STONE_NAMES.has(n)) return true;
    if (hasTypeChip && /\b(stone|pedra)\b/.test(n)) return true;
    return false;
  }

  // Extrai preço médio e volume vendidos nos últimos 7 dias a partir do texto de .cmp-media
  // Ex.: "Preço médio vendido nos últimos 7 dias: 107.786 /un. · 197.716 un. vendidas"
  function parseAvg7d(text) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return { avg7d: null, vol7d: null };
    const avgMatch = s.match(/:\s*([\d.,]+)\s*\/?\s*(?:un|ea|u\b)/i)
      || s.match(/([\d.,]+)\s*\/\s*(?:un|ea)/i);
    const volMatch = s.match(/[·|•]\s*([\d.,]+)\s*(?:un|units?|vendid|sold)/i)
      || s.match(/([\d.,]+)\s*(?:un\.\s*vendid|units?\s*sold)/i);
    const avg7d = avgMatch ? parseIntClean(avgMatch[1]) : null;
    const vol7d = volMatch ? parseIntClean(volMatch[1]) : null;
    return { avg7d, vol7d };
  }

  // Parseia uma linha da Tabela de Preços (#cm-historico-global) em Coins
  // Ex.: itemText="219× Leaf Stone", valueText="16.994.400"
  function parseHistoryRow({ itemText = '', valueText = '', isOrb = false } = {}) {
    if (isOrb) return null;
    const itemClean = String(itemText || '').replace(/\s+/g, ' ').trim();
    const m = itemClean.match(/^([\d.,]+)\s*[×x]\s*(.+)$/i);
    if (!m) return null;
    const qty = parseIntClean(m[1]);
    const name = m[2].trim();
    const totalCoins = parseIntClean(valueText);
    if (!qty || qty <= 0 || !totalCoins || totalCoins <= 0 || !name) return null;
    const unitPrice = Math.round(totalCoins / qty);
    if (!Number.isFinite(unitPrice) || unitPrice < MIN_PRICE) return null;
    return {
      name,
      normName: norm(name),
      qty,
      totalCoins,
      unitPrice,
    };
  }

  function median(nums) {
    if (!nums.length) return 0;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  // Filtra outliers (ex.: transfer P2P de 1 pedra por milhões) e resume vendas comprovadas recentes
  function summarizeProvenSales(sales, { avg7d = null } = {}) {
    const clean = (sales || []).filter(s => s && Number.isFinite(s.unitPrice) && s.unitPrice >= MIN_PRICE && s.qty > 0);
    if (!clean.length) {
      return { validCount: 0, totalUnits: 0, maxProven: null, minProven: null, weightedAvg: null, discarded: 0 };
    }
    const ref = (Number.isFinite(avg7d) && avg7d > 0)
      ? avg7d
      : (clean.length >= 3 ? median(clean.map(s => s.unitPrice)) : 0);

    const valid = [];
    let discarded = 0;
    for (const s of clean) {
      if (ref > 0) {
        const maxMult = s.qty === 1 ? 1.85 : 2.5;
        const minMult = 0.15;
        if (s.unitPrice > ref * maxMult || s.unitPrice < Math.max(MIN_PRICE, Math.floor(ref * minMult))) {
          discarded++;
          continue;
        }
      }
      valid.push(s);
    }
    if (!valid.length) {
      return { validCount: 0, totalUnits: 0, maxProven: null, minProven: null, weightedAvg: null, discarded };
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
      discarded,
    };
  }

  // Analisa ofertas do book atual (separa livres vs retidas, ignora micro-iscas no topo)
  function analyzeFreeBook(offers, { avg7d = null } = {}) {
    const free = [];
    const held = [];
    for (const o of (offers || [])) {
      if (!o || !Number.isFinite(o.price) || o.price < MIN_PRICE) continue;
      if (o.own) continue;
      const qty = Math.max(1, Math.floor(o.qty) || 1);
      if (o.held) held.push({ price: Math.floor(o.price), qty });
      else free.push({ price: Math.floor(o.price), qty });
    }
    free.sort((a, b) => a.price - b.price);
    held.sort((a, b) => a.price - b.price);

    // Agrupa níveis livres por preço exato
    const levels = [];
    for (const o of free) {
      const last = levels[levels.length - 1];
      if (last && last.price === o.price) last.qty += o.qty;
      else levels.push({ price: o.price, qty: o.qty });
    }

    // Descarta micro-iscas no topo (<= 5 un. acumuladas com preço < 80% do próximo nível livre)
    let idx = 0, skippedBaitUnits = 0, skippedBaitLevels = 0;
    while (idx + 1 < levels.length) {
      const cur = levels[idx];
      const next = levels[idx + 1];
      if (cur.qty <= 3 && skippedBaitUnits + cur.qty <= 5 && cur.price < next.price * 0.80) {
        skippedBaitUnits += cur.qty;
        skippedBaitLevels++;
        idx++;
      } else {
        break;
      }
    }

    // Se houver parede muito pequena de dump (< 50% da avg7d) na frente de ofertas normais (>= 60% avg7d), pula ela
    if (Number.isFinite(avg7d) && avg7d > 0 && idx < levels.length) {
      let dumpUnits = 0, nextNormalIdx = -1;
      for (let i = idx; i < levels.length; i++) {
        if (levels[i].price < avg7d * 0.60) {
          dumpUnits += levels[i].qty;
        } else {
          nextNormalIdx = i;
          break;
        }
      }
      if (nextNormalIdx > idx && levels[idx].price < avg7d * 0.50 && dumpUnits <= 100) {
        skippedBaitUnits += dumpUnits;
        skippedBaitLevels += (nextNormalIdx - idx);
        idx = nextNormalIdx;
      }
    }

    const bestLevel = levels[idx] || null;
    const bestFree = bestLevel ? bestLevel.price : null;
    const bestFreeQty = bestLevel ? bestLevel.qty : 0;
    const totalFreeUnits = levels.slice(idx).reduce((s, l) => s + l.qty, 0);
    const heldBelowUnits = bestFree != null
      ? held.filter(o => o.price < bestFree).reduce((s, o) => s + o.qty, 0)
      : held.reduce((s, o) => s + o.qty, 0);

    return {
      bestFree,
      bestFreeQty,
      totalFreeUnits,
      freeLevels: levels.slice(idx, idx + 8),
      bestHeld: held.length ? held[0].price : null,
      heldBelowUnits,
      skippedBaitLevels,
      skippedBaitUnits,
    };
  }

  function netCoins(unitPrice, qty) {
    const q = Math.max(0, Math.floor(qty) || 0);
    const p = Math.max(0, Math.floor(unitPrice) || 0);
    const gross = p * q;
    if (gross <= 0) return { gross: 0, fee: 0, net: 0 };
    const fee = Math.ceil(gross * COMMISSION_RATE);
    return { gross, fee, net: Math.max(0, gross - fee) };
  }

  // Decide o melhor preço comprovado para vender uma pedra em Coins
  function chooseStonePrice({
    id = null,
    name = '',
    qty = 0,
    offers = [],
    avg7d = null,
    vol7d = null,
    recentSales = [],
  } = {}) {
    const q = Math.max(0, Math.floor(qty) || 0);
    const avg = (Number.isFinite(avg7d) && avg7d >= MIN_PRICE) ? Math.round(avg7d) : null;
    const book = analyzeFreeBook(offers, { avg7d: avg });
    const proven = summarizeProvenSales(recentSales, { avg7d: avg });

    const base = {
      id: id != null ? String(id) : null,
      name: String(name || '').trim(),
      qty: q,
      avg7d: avg,
      vol7d: Number.isFinite(vol7d) ? Math.round(vol7d) : null,
      bestFree: book.bestFree,
      bestFreeQty: book.bestFreeQty,
      totalFreeUnits: book.totalFreeUnits,
      bestHeld: book.bestHeld,
      heldBelowUnits: book.heldBelowUnits,
      maxProvenRecent: proven.maxProven,
      provenSalesCount: proven.validCount,
      provenUnits: proven.totalUnits,
    };

    if (q <= 0) {
      return { ...base, action: 'skip', reason: 'sem estoque', price: null, gross: 0, fee: 0, net: 0, source: 'skip', provenCeiling: null };
    }

    const provenCeiling = Math.max(avg || 0, proven.maxProven || 0) || null;
    if (provenCeiling == null && book.bestFree == null) {
      return { ...base, action: 'skip', reason: 'sem dados de mercado', price: null, gross: 0, fee: 0, net: 0, source: 'skip', provenCeiling: null };
    }

    const bookTarget = book.bestFree != null ? Math.max(MIN_PRICE, book.bestFree - 1) : provenCeiling;
    let price;
    let source;

    if (provenCeiling != null) {
      if (book.bestFree == null) {
        price = provenCeiling;
        source = (proven.maxProven && proven.maxProven >= (avg || 0))
          ? 'máx. venda comprovada (sem livre)'
          : 'média 7d (sem livre)';
      } else if (bookTarget <= provenCeiling) {
        price = bookTarget;
        source = '1 abaixo do menor livre';
      } else {
        price = provenCeiling;
        source = (proven.maxProven && proven.maxProven >= (avg || 0))
          ? 'máx. venda comprovada'
          : 'média vendida 7d';
      }
    } else {
      price = bookTarget;
      source = '1 abaixo do menor livre (sem hist.)';
    }

    price = Math.max(MIN_PRICE, Math.floor(price));

    // Proteção contra crash/dump maciço no book livre não confirmado por vendas recentes
    const recentConfirmsCrash = proven.validCount > 0 && proven.maxProven != null && avg != null && proven.maxProven < avg * 0.65;
    if (avg != null && price < Math.floor(avg * 0.50) && !recentConfirmsCrash) {
      return {
        ...base,
        action: 'skip',
        reason: `book livre muito abaixo da média 7d (${price} vs ${avg})`,
        price,
        gross: 0,
        fee: 0,
        net: 0,
        source: 'proteção anti-dump',
        provenCeiling,
      };
    }

    const fin = netCoins(price, q);
    return {
      ...base,
      action: 'sell',
      reason: source,
      price,
      gross: fin.gross,
      fee: fin.fee,
      net: fin.net,
      source,
      provenCeiling,
    };
  }

  function formatCoins(n) {
    if (!Number.isFinite(n) || n <= 0) return '0';
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return Math.round(n).toLocaleString('pt-BR');
  }

  function summarizePlan(items) {
    const list = items || [];
    const sellable = list.filter(i => i.action === 'sell');
    const skipped = list.filter(i => i.action !== 'sell');
    const totalUnits = sellable.reduce((s, i) => s + (i.qty || 0), 0);
    const totalGross = sellable.reduce((s, i) => s + (i.gross || 0), 0);
    const totalFee = sellable.reduce((s, i) => s + (i.fee || 0), 0);
    const totalNet = sellable.reduce((s, i) => s + (i.net || 0), 0);
    return {
      totalTypes: list.length,
      sellTypes: sellable.length,
      skipTypes: skipped.length,
      totalUnits,
      totalGross,
      totalFee,
      totalNet,
    };
  }

  return {
    COMMISSION_RATE,
    MIN_PRICE,
    KNOWN_STONES,
    KNOWN_STONE_IDS,
    norm,
    parseIntClean,
    isStoneItem,
    parseAvg7d,
    parseHistoryRow,
    summarizeProvenSales,
    analyzeFreeBook,
    netCoins,
    chooseStonePrice,
    summarizePlan,
    formatCoins,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = PK_STONES;
