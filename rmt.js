/* Lógica pura do Radar RMT (Ouro <-> Gema) do pokeidle.io.
   Sem acesso ao DOM nem APIs: usado por content.js e testado diretamente em Node. */
const PK_RMT = (() => {
  // Whitelist de itens com liquidez real comprovada em Gemas e Coins (ignora Pedras/Stones = transfer P2P).
  const LIQUID_ITEMS = [
    { id: 'bike-frag', label: 'Frag. Bicicleta', minSanityCoins: 100e6, defaultLot: 1, undercut: 1, aliases: ['Fragmento de Bicicleta', 'Bicycle Fragment'] },
    { id: 'key-frag', label: 'Frag. Chave', minSanityCoins: 100e6, defaultLot: 1, undercut: 1, aliases: ['Fragmento de Chave', 'Key Fragment'] },
    { id: 'shiny-frag', label: 'Frag. Shiny Stone', minSanityCoins: 80e6, defaultLot: 1, undercut: 1, aliases: ['Fragmento de Shiny Stone', 'Shiny Stone Fragment'] },
    { id: 'zmove-frag', label: 'Frag. Z-Move', minSanityCoins: 100e6, defaultLot: 1, undercut: 1, aliases: ['Fragmento de Z-Move', 'Z-Move Fragment'] },
    { id: 'mega-frag', label: 'Frag. MEGA Stone', minSanityCoins: 100e6, defaultLot: 1, undercut: 1, aliases: ['Fragmento de MEGA Stone', 'Mega Stone Fragment'] },
    { id: 'mshiny-frag', label: 'Frag. MEGA Shiny', minSanityCoins: 200e6, defaultLot: 1, undercut: 1, aliases: ['Fragmento de MEGA Shiny Stone', 'Mega Shiny Stone Fragment'] },
    { id: 'aoe-piece', label: 'AoE TM Piece', minSanityCoins: 200e6, defaultLot: 1, undercut: 1, aliases: ['AoE TM Disk Piece'] },
    { id: 'bronze-token', label: 'Bronze Boss Token', minSanityCoins: 2e6, defaultLot: 10, undercut: 1, minUndercutAsk: 5, aliases: ['Bronze Boss Token'] },
  ];

  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  function matchLiquidItem(name) {
    const n = norm(name);
    if (!n) return null;
    for (const item of LIQUID_ITEMS) {
      if (item.aliases.some(a => norm(a) === n)) return item;
    }
    return null;
  }

  // Parseia tanto "702.500.000" quanto sufixos de cards ("44M", "2,5M", "700K", "7B", "9.010T")
  function parseCompactNum(raw) {
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
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

  // Parseia texto de média 7d e volume do painel de item (.cmp-media) em PT e EN (preserva 0 vendas)
  function parseAvg7d(text) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!s) return { avg7d: null, vol7d: null };
    const avgMatch = s.match(/:\s*([\d.,]+(?:\s*[KMBT])?)\s*\/?\s*(?:un|ea|u\b)/i)
      || s.match(/([\d.,]+(?:\s*[KMBT])?)\s*\/\s*(?:un|ea)/i);
    const volMatch = s.match(/[·|•]\s*([\d.,]+)\s*(?:un|units?|vendid|sold)/i)
      || s.match(/([\d.,]+)\s*(?:un\.\s*vendid|units?\s*sold)/i);
    const avg7d = avgMatch ? parseCompactNum(avgMatch[1]) : null;
    let vol7d = null;
    if (volMatch) {
      const digits = volMatch[1].replace(/[^\d]/g, '');
      if (digits) vol7d = parseInt(digits, 10);
    }
    return { avg7d, vol7d };
  }

  // Comissão oficial de Item em Gema: 15% sobre o total, arredondada para cima (confirmado na UI)
  function netItemGems(unitPrice, lotSize = 1) {
    const qty = Math.max(1, Math.floor(lotSize) || 1);
    const gross = unitPrice * qty;
    if (!Number.isFinite(gross) || gross <= 0) return { gross: 0, fee: 0, net: 0, netPerUnit: 0, effPct: 0 };
    const fee = Math.ceil(gross * 0.15);
    const net = Math.max(0, gross - fee);
    return { gross, fee, net, netPerUnit: net / qty, effPct: (fee / gross) * 100 };
  }

  // Comissão oficial de Item em Coins (Ouro): 15% sobre o total, arredondada para cima (TAXA_GOLD = 0.15)
  function netItemCoins(unitPrice, lotSize = 1) {
    const qty = Math.max(1, Math.floor(lotSize) || 1);
    const gross = unitPrice * qty;
    if (!Number.isFinite(gross) || gross <= 0) return { gross: 0, fee: 0, net: 0, netPerUnit: 0, effPct: 0 };
    const fee = Math.ceil(gross * 0.15);
    const net = Math.max(0, gross - fee);
    return { gross, fee, net, netPerUnit: net / qty, effPct: (fee / gross) * 100 };
  }

  // Filtra ofertas de book: descarta "Retido" (2 min) e preços trolls (< minSanityPrice)
  // Preserva níveis livres ordenados e metadados (vendedor/quantidade).
  function pickBestFreeOffer(offers, minSanityPrice = 1) {
    let skippedHeld = 0, skippedTroll = 0;
    const valid = [];
    for (const o of (offers || [])) {
      if (!o || !Number.isFinite(o.price) || o.price <= 0) continue;
      if (o.held) { skippedHeld++; continue; }
      if (o.price < minSanityPrice) { skippedTroll++; continue; }
      const clean = { price: o.price, qty: Math.max(1, Math.floor(o.qty) || 1) };
      if (o.name) clean.name = String(o.name).trim();
      if (o.level) clean.level = String(o.level).trim();
      if (o.pot) clean.pot = String(o.pot).trim();
      if (o.nota) clean.nota = String(o.nota).trim();
      if (o.seller) clean.seller = String(o.seller).trim();
      if (o.favId) clean.favId = String(o.favId).trim();
      valid.push(clean);
    }
    if (!valid.length) {
      return {
        bestPrice: null,
        bestOffer: null,
        topOffers: [],
        levels: [],
        unitsAtBest: 0,
        totalFreeUnits: 0,
        totalFreeOrders: 0,
        skippedHeld,
        skippedTroll,
      };
    }
    valid.sort((a, b) => a.price - b.price);
    const bestPrice = valid[0].price;
    const unitsAtBest = valid.filter(o => o.price === bestPrice).reduce((s, o) => s + o.qty, 0);
    const totalFreeUnits = valid.reduce((s, o) => s + o.qty, 0);
    const levels = valid.slice(0, 20).map(o => ({
      price: o.price,
      qty: o.qty,
      seller: o.seller || null,
    }));
    return {
      bestPrice,
      bestOffer: valid[0],
      topOffers: valid.slice(0, 5),
      levels,
      unitsAtBest,
      totalFreeUnits,
      totalFreeOrders: valid.length,
      skippedHeld,
      skippedTroll,
    };
  }

  // Calcula quantas unidades comprar no book real com o orçamento disponível sem ultrapassar maxUnitPrice
  function planBuyFromLevels(levels, budgetRaw, maxUnitPrice, fallbackUnitPrice) {
    const budget = Math.max(0, Number(budgetRaw) || 0);
    const list = (levels && levels.length)
      ? levels
      : (fallbackUnitPrice > 0 ? [{ price: fallbackUnitPrice, qty: 1000, seller: null }] : []);
    if (!list.length || budget <= 0) {
      return { qty: 0, totalCoins: 0, totalCost: 0, avgPrice: 0, maxPricePaid: 0, sellers: [] };
    }
    const cap = Number.isFinite(maxUnitPrice) && maxUnitPrice > 0 ? maxUnitPrice : list[0].price * 1.05;
    let rem = budget, qty = 0, totalCoins = 0, maxPricePaid = 0;
    const sellers = [];
    for (const lv of list) {
      if (!lv || lv.price <= 0 || lv.price > cap) break;
      const canBuy = Math.min(lv.qty || 1, Math.floor(rem / lv.price));
      if (canBuy <= 0) break;
      qty += canBuy;
      totalCoins += canBuy * lv.price;
      rem -= canBuy * lv.price;
      maxPricePaid = Math.max(maxPricePaid, lv.price);
      if (lv.seller && !sellers.includes(lv.seller) && sellers.length < 3) sellers.push(lv.seller);
    }
    return {
      qty,
      totalCoins,
      totalCost: totalCoins,
      avgPrice: qty > 0 ? totalCoins / qty : 0,
      maxPricePaid,
      sellers,
    };
  }

  // Avalia rota de um item líquido nos dois sentidos (Ouro->Gema e Gema->Ouro)
  // modo 'book' = verificado no book; 'list' = estimativa da tabela esquerda
  function evaluateItemRoute({
    item,
    coinsOffer,
    gemasOffer,
    gold = 0,
    gems = 0,
    source = 'book',
    coinsAvg7d = null,
    coinsVol7d = null,
    gemsAvg7d = null,
    gemsVol7d = null,
  }) {
    if (!item || !coinsOffer || !gemasOffer) return null;
    const buyCoins = coinsOffer.bestPrice;
    const askGems = gemasOffer.bestPrice;
    if (!buyCoins || !askGems) return null;

    const cAvg = Number.isFinite(coinsAvg7d) && coinsAvg7d > 0 ? coinsAvg7d
      : (Number.isFinite(coinsOffer.avg7d) && coinsOffer.avg7d > 0 ? coinsOffer.avg7d : null);
    const cVol = Number.isFinite(coinsVol7d) && coinsVol7d >= 0 ? coinsVol7d
      : (Number.isFinite(coinsOffer.vol7d) && coinsOffer.vol7d >= 0 ? coinsOffer.vol7d : null);
    const gAvg = Number.isFinite(gemsAvg7d) && gemsAvg7d > 0 ? gemsAvg7d
      : (Number.isFinite(gemasOffer.avg7d) && gemasOffer.avg7d > 0 ? gemasOffer.avg7d : null);
    const gVol = Number.isFinite(gemsVol7d) && gemsVol7d >= 0 ? gemsVol7d
      : (Number.isFinite(gemasOffer.vol7d) && gemasOffer.vol7d >= 0 ? gemasOffer.vol7d : null);

    const warnings = [];
    if (buyCoins < item.minSanityCoins) warnings.push('preço Coins suspeito');
    if (coinsOffer.skippedTroll > 0) warnings.push('troll ignorado');
    if (source === 'book' && coinsOffer.totalFreeUnits < 15 && coinsOffer.unitsAtBest < 5) warnings.push('book Coins raso');

    const cut = item.minUndercutAsk ? (askGems >= item.minUndercutAsk ? (item.undercut || 0) : 0) : (item.undercut || 0);
    const sellGems = Math.max(2, askGems - cut);
    const lot = item.defaultLot || 1;
    const netLot = netItemGems(sellGems, lot);
    const netOne = netItemGems(sellGems, 1);
    if (netLot.netPerUnit <= 0) return null;

    if (lot > 1 && netOne.effPct >= 24) warnings.push(`1un=${Math.round(netOne.effPct)}% taxa`);
    if (gAvg && sellGems > gAvg * 1.20) warnings.push(`venda +${Math.round((sellGems / gAvg - 1) * 100)}% vs 7d`);

    const coinsPerGem = buyCoins / netLot.netPerUnit;
    const minEntryCoins = lot > 1 && netOne.effPct >= 24 ? buyCoins * lot : buyCoins;

    // Sentido inverso: Gema -> Ouro (compra no book de Gemas, anuncia 1 Coin abaixo do menor livre em Coins)
    const buyGems = askGems;
    const sellCoins = Math.max(2, buyCoins - 1);
    const netCoinsOne = netItemCoins(sellCoins, 1);
    const netCoinsUnit = netCoinsOne.netPerUnit;
    const netCoinsPerGem = buyGems > 0 ? netCoinsUnit / buyGems : 0;
    const reverseWarnings = [];
    if (buyCoins < item.minSanityCoins) reverseWarnings.push('preço Coins suspeito');
    if (gemasOffer.skippedTroll > 0) reverseWarnings.push('troll Gemas ignorado');
    if (source === 'book' && (gemasOffer.totalFreeUnits || 0) < 15 && (gemasOffer.unitsAtBest || 0) < 5) reverseWarnings.push('book Gemas raso');
    if (source === 'book' && (coinsOffer.totalFreeUnits || 0) > 0 && (coinsOffer.totalFreeUnits || 0) < 5) reverseWarnings.push('poucos anúncios Coins');
    if (cAvg && sellCoins > cAvg * 1.20) reverseWarnings.push(`venda +${Math.round((sellCoins / cAvg - 1) * 100)}% vs 7d`);

    return {
      id: item.id,
      label: item.label,
      marketName: item.aliases[0] || item.label,
      kind: 'item',
      source,
      buyCoins,
      minEntryCoins,
      askGems,
      sellGems,
      lot,
      netGemsUnit: netLot.netPerUnit,
      netGemsLot: netLot.net,
      effFeePct: netLot.effPct,
      coinsPerGem,
      coinsFor1000Gems: coinsPerGem * 1000,
      gemsPerBillion: 1e9 / coinsPerGem,
      unitsAtBestCoins: coinsOffer.unitsAtBest || 0,
      totalFreeCoinsUnits: coinsOffer.totalFreeUnits || 0,
      coinsLevels: coinsOffer.levels || [],
      bestSeller: coinsOffer.bestOffer?.seller || null,
      canAfford: gold >= buyCoins,
      warnings,
      // Gema -> Ouro
      buyGems,
      sellCoins,
      netCoinsUnit,
      netCoinsPerGem,
      coinsFor1000GemsOut: netCoinsPerGem * 1000,
      unitsAtBestGems: gemasOffer.unitsAtBest || 0,
      totalFreeGemsUnits: gemasOffer.totalFreeUnits || 0,
      gemsLevels: gemasOffer.levels || [],
      bestGemsSeller: gemasOffer.bestOffer?.seller || null,
      canAffordGems: gems >= buyGems,
      reverseWarnings,
      // Referências de liquidez/preço histórico (7 dias, do .cmp-media)
      coinsAvg7d: cAvg,
      coinsVol7d: cVol,
      gemsAvg7d: gAvg,
      gemsVol7d: gVol,
    };
  }

  // Garante campos do sentido inverso (Gema -> Ouro) mesmo em rotas legadas salvas em cache
  function normalizeReverseRoute(route) {
    if (!route || route.kind === 'pokemon') return null;
    const buyGems = Number(route.buyGems || route.askGems) || 0;
    const askCoins = Number(route.buyCoins) || 0;
    if (buyGems <= 0 || askCoins <= 0) return null;
    const sellCoins = Number(route.sellCoins) > 0 ? route.sellCoins : Math.max(2, askCoins - 1);
    const netCoinsUnit = Number(route.netCoinsUnit) > 0 ? route.netCoinsUnit : netItemCoins(sellCoins, 1).netPerUnit;
    const netCoinsPerGem = Number(route.netCoinsPerGem) > 0 ? route.netCoinsPerGem : (netCoinsUnit / buyGems);
    if (!Number.isFinite(netCoinsPerGem) || netCoinsPerGem <= 0) return null;
    return {
      ...route,
      buyGems,
      sellCoins,
      netCoinsUnit,
      netCoinsPerGem,
      coinsFor1000GemsOut: netCoinsPerGem * 1000,
      gemsLevels: Array.isArray(route.gemsLevels) ? route.gemsLevels : [],
      reverseWarnings: Array.isArray(route.reverseWarnings) ? route.reverseWarnings : [],
    };
  }

  // Apenas itens fungíveis entram no ranking (ignora rotas legadas de Pokémon salvas em cache)
  function rankRoutes(routes) {
    return (routes || [])
      .filter(r => r && r.kind !== 'pokemon' && Number.isFinite(r.coinsPerGem) && r.coinsPerGem > 0)
      .slice()
      .sort((a, b) => a.coinsPerGem - b.coinsPerGem);
  }

  // Ranking Gema -> Ouro: MAIOR Coins líquidos por Gema primeiro
  function rankReverseRoutes(routes) {
    return (routes || [])
      .map(normalizeReverseRoute)
      .filter(r => r && Number.isFinite(r.netCoinsPerGem) && r.netCoinsPerGem > 0)
      .sort((a, b) => b.netCoinsPerGem - a.netCoinsPerGem);
  }

  function formatCoins(n) {
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace('.', ',') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
    return String(Math.round(n));
  }

  function formatCoinsExact(n) {
    if (!Number.isFinite(n) || n <= 0) return '—';
    return Math.round(n).toLocaleString('pt-BR');
  }

  function formatGems(n) {
    if (!Number.isFinite(n) || n <= 0) return '0G';
    return Math.round(n).toLocaleString('pt-BR') + 'G';
  }

  // Gera instrução pronta e acionável para itens fungíveis (o que comprar, onde ir, por quanto vender, quanto recebe líquido)
  function buildRouteInstruction(route, gold = 0) {
    if (!route || route.kind === 'pokemon') return null;
    const budget = Math.max(0, Number(gold) || 0);

    // Rota de Item
    const lot = route.lot || 1;
    const capPrice = route.buyCoins * 1.04; // aceita até +4% nos próximos degraus do book
    const plan = planBuyFromLevels(route.coinsLevels, budget, capPrice, route.buyCoins);
    const affordable = plan.qty >= 1;
    let qty = affordable ? plan.qty : lot;
    let totalCoins = affordable ? plan.totalCoins : route.buyCoins * lot;
    let maxPricePaid = affordable ? plan.maxPricePaid : route.buyCoins;

    // Se item recomenda lote > 1 (ex: Bronze Boss Token) e cabe pelo menos 1 lote, arredonda para múltiplo do lote?
    // Não precisa desperdiçar unidades: calcula taxa exata para qty total!
    const netReal = netItemGems(route.sellGems, qty);
    const effCpg = netReal.net > 0 ? totalCoins / netReal.net : route.coinsPerGem;
    const where = `RMT → Itens → ${route.marketName || route.label} → Coins`;

    let buyText;
    if (affordable) {
      const priceTxt = maxPricePaid > route.buyCoins
        ? `até ${formatCoins(maxPricePaid)}/un (total ${formatCoins(totalCoins)})`
        : `a ${formatCoins(route.buyCoins)}/un${qty > 1 ? ` (total ${formatCoins(totalCoins)})` : ''}`;
      buyText = `${qty}× ${route.marketName || route.label} ${priceTxt}`;
    } else {
      const needQty = lot > 1 && netItemGems(route.sellGems, 1).effPct >= 24 ? lot : 1;
      const needCost = route.buyCoins * needQty;
      qty = needQty;
      totalCoins = needCost;
      buyText = `${needQty}× ${route.marketName || route.label} a ${formatCoins(route.buyCoins)}/un${needQty > 1 ? ` (total ${formatCoins(needCost)})` : ''}`;
    }

    const finalNet = netItemGems(route.sellGems, qty);
    const lotHint = lot > 1 && qty < lot
      ? ` (⚠ abaixo de ${lot}× paga ${Math.round(finalNet.effPct)}% de taxa)`
      : (lot > 1 ? ` (lote único de ${qty}× evita 25% de taxa)` : '');
    const sellText = qty > 1
      ? `Anuncie ${qty}× por ${route.sellGems} Gemas/un → recebe ${finalNet.net}G líq.${lotHint}`
      : `Anuncie 1× por ${route.sellGems} Gemas → recebe ${finalNet.net}G líq.${lotHint}`;

    const entryCost = route.minEntryCoins || route.buyCoins;
    return {
      routeId: route.id,
      kind: 'item',
      label: route.label,
      where,
      qty,
      affordable,
      missingCoins: affordable ? 0 : Math.max(0, entryCost - budget),
      totalCoins,
      netGemsTotal: finalNet.net,
      coinsPerGem: finalNet.net > 0 ? totalCoins / finalNet.net : effCpg,
      buyText,
      sellText,
      sellers: plan.sellers,
      note: route.warnings && route.warnings.length ? route.warnings.join(' · ') : '',
    };
  }

  // Motor de decisão completo: elimina análise manual do jogador e entrega veredito + instruções
  function buildActionPlan({ routes, gold = 0, source = 'book' }) {
    const ranked = rankRoutes(routes);
    if (!ranked.length) return null;

    const budget = Math.max(0, Number(gold) || 0);
    const bestOverall = ranked[0];
    // Entre as rotas acessíveis, escolhe a de menor Coins/Gema REAL para o ouro atual (evita escolher lote pequeno com 25% de taxa sobre rota melhor)
    const affordableCandidates = ranked
      .filter(r => budget >= r.buyCoins)
      .map(r => ({ route: r, inst: buildRouteInstruction(r, budget) }))
      .filter(x => x.inst && x.inst.affordable && Number.isFinite(x.inst.coinsPerGem))
      .sort((a, b) => a.inst.coinsPerGem - b.inst.coinsPerGem);
    const bestAffPair = affordableCandidates[0] || null;
    const bestAffordable = bestAffPair ? bestAffPair.route : null;
    const cheapest = ranked.slice().sort((a, b) => a.buyCoins - b.buyCoins)[0];

    // Próxima meta acessível que já entrega eficiência próxima do topo (<= 10% pior que bestOverall)
    const nearOptimal = ranked.filter(r => r.coinsPerGem <= bestOverall.coinsPerGem * 1.10);
    const nextGoal = nearOptimal.slice().sort((a, b) => a.buyCoins - b.buyCoins)[0] || bestOverall;

    const bestInst = buildRouteInstruction(bestOverall, budget);
    const affInst = bestAffPair ? bestAffPair.inst : null;
    const goalInst = buildRouteInstruction(nextGoal, budget);

    // Caso 1: Melhor rota absoluta já cabe no ouro -> COMPRE AGORA
    if (bestAffordable && bestAffordable.id === bestOverall.id) {
      return {
        verdict: 'BUY_NOW',
        headline: 'COMPRE AGORA (melhor rota do mercado)',
        summary: `${formatCoins(bestInst.coinsPerGem)}/G · 1.000G ≈ ${formatCoins(bestOverall.coinsFor1000Gems)}`,
        source,
        gold: budget,
        primary: bestInst,
        fallback: null,
        goal: null,
        lossPct: 0,
        ranked,
      };
    }

    // Caso 2: Existe rota que cabe no ouro, mas existe outra mais eficiente fora do orçamento
    if (bestAffordable && affInst) {
      // Quanto % a mais de ouro por gema a rota acessível custa vs a melhor absoluta
      const extraCostPct = Math.round((affInst.coinsPerGem / bestOverall.coinsPerGem - 1) * 100);
      // Quanto % a menos de gemas o jogador recebe pelo mesmo ouro
      const lessGemsPct = Math.round((1 - bestOverall.coinsPerGem / affInst.coinsPerGem) * 100);

      if (extraCostPct <= 8) {
        return {
          verdict: 'BUY_NOW',
          headline: `COMPRE AGORA (${extraCostPct > 0 ? `só ${extraCostPct}% atrás do topo` : 'no topo'})`,
          summary: `${formatCoins(affInst.coinsPerGem)}/G · 1.000G ≈ ${formatCoins(affInst.coinsPerGem * 1000)}`,
          source,
          gold: budget,
          primary: affInst,
          fallback: null,
          goal: bestInst,
          lossPct: lessGemsPct,
          ranked,
        };
      }

      const goalRoute = nextGoal.id !== bestOverall.id ? goalInst : bestInst;
      return {
        verdict: 'SAVE_OR_BUY',
        headline: `MELHOR JUNTAR (+${extraCostPct}% mais gemas/ouro)`,
        summary: `Falta ${formatCoins(goalRoute.missingCoins)} p/ ${goalRoute.label} (${formatCoins(goalRoute.coinsPerGem)}/G)`,
        source,
        gold: budget,
        primary: goalRoute,
        bestOverall: nextGoal.id !== bestOverall.id ? bestInst : null,
        fallback: affInst,
        lossPct: lessGemsPct,
        extraCostPct,
        ranked,
      };
    }

    // Caso 3: Ouro ainda não compra nenhuma rota -> JUNTAR OURO
    const cheapInst = buildRouteInstruction(cheapest, budget);
    return {
      verdict: 'SAVE_ONLY',
      headline: `JUNTE +${formatCoins(cheapInst.missingCoins)} PARA COMEÇAR`,
      summary: `Melhor rota: ${bestOverall.label} (${formatCoins(bestOverall.coinsPerGem)}/G · falta ${formatCoins(bestInst.missingCoins)})`,
      source,
      gold: budget,
      primary: goalInst,
      fallback: cheapest.id !== nextGoal.id ? cheapInst : null,
      bestOverall: nextGoal.id !== bestOverall.id ? bestInst : null,
      lossPct: 0,
      ranked,
    };
  }

  // Gera instrução acionável no sentido Gema -> Ouro (compra em Gemas, anuncia em Coins)
  function buildGemToGoldInstruction(rawRoute, gems = 0) {
    const route = normalizeReverseRoute(rawRoute);
    if (!route) return null;
    const budget = Math.max(0, Number(gems) || 0);

    const capPrice = route.buyGems * 1.04; // aceita até +4% nos próximos degraus do book de Gemas
    const plan = planBuyFromLevels(route.gemsLevels, budget, capPrice, route.buyGems);
    const affordable = plan.qty >= 1;
    const qty = affordable ? plan.qty : 1;
    const totalGems = affordable ? plan.totalCost : route.buyGems;
    const maxPricePaid = affordable ? plan.maxPricePaid : route.buyGems;
    const where = `RMT → Itens → ${route.marketName || route.label} → Gemas`;

    let buyText;
    if (affordable) {
      const priceTxt = maxPricePaid > route.buyGems
        ? `até ${formatGems(maxPricePaid)}/un (total ${formatGems(totalGems)})`
        : `a ${formatGems(route.buyGems)}/un${qty > 1 ? ` (total ${formatGems(totalGems)})` : ''}`;
      buyText = `${qty}× ${route.marketName || route.label} ${priceTxt}`;
    } else {
      buyText = `1× ${route.marketName || route.label} a ${formatGems(route.buyGems)}/un`;
    }

    const finalNet = netItemCoins(route.sellCoins, qty);
    const realNetCpg = totalGems > 0 ? finalNet.net / totalGems : route.netCoinsPerGem;
    const sellText = qty > 1
      ? `Anuncie ${qty}× por ${formatCoinsExact(route.sellCoins)} Coins/un → recebe ${formatCoins(finalNet.net)} líq.`
      : `Anuncie 1× por ${formatCoinsExact(route.sellCoins)} Coins → recebe ${formatCoins(finalNet.net)} líq.`;

    return {
      routeId: route.id,
      kind: 'item',
      direction: 'gem-to-gold',
      label: route.label,
      where,
      qty,
      affordable,
      missingGems: affordable ? 0 : Math.max(0, route.buyGems - budget),
      totalGems,
      netCoinsTotal: finalNet.net,
      netCoinsPerGem: realNetCpg,
      buyText,
      sellText,
      sellers: plan.sellers,
      note: route.reverseWarnings && route.reverseWarnings.length ? route.reverseWarnings.join(' · ') : '',
    };
  }

  // Motor de decisão Gema -> Ouro: maximiza Coins líquidos recebidos por Gema gasta
  function buildGemToGoldActionPlan({ routes, gems = 0, source = 'book' }) {
    const ranked = rankReverseRoutes(routes);
    if (!ranked.length) return null;

    const budget = Math.max(0, Number(gems) || 0);
    const bestOverall = ranked[0];

    const affordableCandidates = ranked
      .filter(r => budget >= r.buyGems)
      .map(r => ({ route: r, inst: buildGemToGoldInstruction(r, budget) }))
      .filter(x => x.inst && x.inst.affordable && Number.isFinite(x.inst.netCoinsPerGem) && x.inst.netCoinsPerGem > 0)
      .sort((a, b) => b.inst.netCoinsPerGem - a.inst.netCoinsPerGem);
    const bestAffPair = affordableCandidates[0] || null;
    const bestAffordable = bestAffPair ? bestAffPair.route : null;
    const cheapest = ranked.slice().sort((a, b) => (a.buyGems - b.buyGems) || (b.netCoinsPerGem - a.netCoinsPerGem))[0];

    // Próxima meta acessível que já entrega retorno próximo do topo (>= 90% de bestOverall)
    const nearOptimal = ranked.filter(r => r.netCoinsPerGem >= bestOverall.netCoinsPerGem * 0.90);
    const nextGoal = nearOptimal.slice().sort((a, b) => (a.buyGems - b.buyGems) || (b.netCoinsPerGem - a.netCoinsPerGem))[0] || bestOverall;

    const bestInst = buildGemToGoldInstruction(bestOverall, budget);
    const affInst = bestAffPair ? bestAffPair.inst : null;
    const goalInst = buildGemToGoldInstruction(nextGoal, budget);

    // Caso 1: Melhor rota absoluta já cabe nas gemas -> COMPRE AGORA
    if (bestAffordable && bestAffordable.id === bestOverall.id) {
      return {
        direction: 'gem-to-gold',
        verdict: 'BUY_NOW',
        headline: 'COMPRE AGORA (melhor rota do mercado)',
        summary: `${formatCoins(bestInst.netCoinsPerGem)}/G líq. · 1.000G ≈ ${formatCoins(bestInst.netCoinsPerGem * 1000)}`,
        source,
        gems: budget,
        primary: bestInst,
        fallback: null,
        goal: null,
        lossPct: 0,
        ranked,
      };
    }

    // Caso 2: Existe rota que cabe nas gemas, mas existe outra mais lucrativa fora do orçamento
    if (bestAffordable && affInst) {
      const extraGainPct = Math.round((bestOverall.netCoinsPerGem / affInst.netCoinsPerGem - 1) * 100);
      const lossPct = Math.round((1 - affInst.netCoinsPerGem / bestOverall.netCoinsPerGem) * 100);

      if (extraGainPct <= 8) {
        return {
          direction: 'gem-to-gold',
          verdict: 'BUY_NOW',
          headline: `COMPRE AGORA (${extraGainPct > 0 ? `só ${extraGainPct}% atrás do topo` : 'no topo'})`,
          summary: `${formatCoins(affInst.netCoinsPerGem)}/G líq. · 1.000G ≈ ${formatCoins(affInst.netCoinsPerGem * 1000)}`,
          source,
          gems: budget,
          primary: affInst,
          fallback: null,
          goal: bestInst,
          lossPct,
          ranked,
        };
      }

      const goalRoute = nextGoal.id !== bestOverall.id ? goalInst : bestInst;
      return {
        direction: 'gem-to-gold',
        verdict: 'SAVE_OR_BUY',
        headline: `MELHOR JUNTAR (+${extraGainPct}% mais ouro/gema)`,
        summary: `Falta ${formatGems(goalRoute.missingGems)} p/ ${goalRoute.label} (${formatCoins(goalRoute.netCoinsPerGem)}/G líq.)`,
        source,
        gems: budget,
        primary: goalRoute,
        bestOverall: nextGoal.id !== bestOverall.id ? bestInst : null,
        fallback: affInst,
        lossPct,
        extraGainPct,
        ranked,
      };
    }

    // Caso 3: Gemas ainda não compram nenhuma rota -> JUNTAR GEMAS (mas exibe melhor rota do mercado)
    const cheapInst = buildGemToGoldInstruction(cheapest, budget);
    return {
      direction: 'gem-to-gold',
      verdict: 'SAVE_ONLY',
      headline: `JUNTE +${formatGems(cheapInst.missingGems)} PARA COMEÇAR`,
      summary: `Melhor rota: ${bestOverall.label} (${formatCoins(bestOverall.netCoinsPerGem)}/G líq. · 1.000G ≈ ${formatCoins(bestOverall.coinsFor1000GemsOut)})`,
      source,
      gems: budget,
      primary: goalInst,
      fallback: cheapest.id !== nextGoal.id ? cheapInst : null,
      bestOverall: nextGoal.id !== bestOverall.id ? bestInst : null,
      lossPct: 0,
      ranked,
    };
  }

  // Formata o plano Gema -> Ouro em texto claro
  function formatGemToGoldPlanText(plan) {
    if (!plan) return 'Abra RMT → Itens ou clique Escanear.';
    const lines = [plan.headline, plan.summary];
    if (plan.verdict === 'BUY_NOW' && plan.primary) {
      lines.push(`1. COMPRAR (${plan.primary.where}): ${plan.primary.buyText}`);
      lines.push(`2. VENDER: ${plan.primary.sellText}`);
    } else if (plan.verdict === 'SAVE_OR_BUY') {
      if (plan.primary) {
        lines.push(`META (falta ${formatGems(plan.primary.missingGems)}): ${plan.primary.buyText} → ${plan.primary.sellText}`);
      }
      if (plan.fallback) {
        lines.push(`AGORA (-${plan.lossPct}% ouro): ${plan.fallback.buyText} → ${plan.fallback.sellText}`);
      }
    } else if (plan.verdict === 'SAVE_ONLY') {
      if (plan.primary) {
        lines.push(`META ÓTIMA (falta ${formatGems(plan.primary.missingGems)}): ${plan.primary.buyText} → ${plan.primary.sellText}`);
      }
      if (plan.fallback) {
        lines.push(`1ª ENTRADA (falta ${formatGems(plan.fallback.missingGems)}): ${plan.fallback.buyText} → ${plan.fallback.sellText}`);
      }
    }
    return lines.join('\n');
  }

  function formatPct(n, signed = true) {
    if (!Number.isFinite(n)) return '0%';
    const sign = signed && n > 0 ? '+' : '';
    const abs = Math.abs(n);
    const txt = abs >= 10 ? n.toFixed(1) : n.toFixed(1);
    return sign + txt.replace('.', ',') + '%';
  }

  function groupPriceLevels(levels) {
    const out = [];
    for (const lv of (levels || [])) {
      if (!lv || !Number.isFinite(lv.price) || lv.price <= 0) continue;
      const qty = Math.max(1, Math.floor(lv.qty) || 1);
      const last = out[out.length - 1];
      if (last && last.price === lv.price) {
        last.qty += qty;
        if (lv.seller && !last.sellers.includes(lv.seller) && last.sellers.length < 3) last.sellers.push(lv.seller);
      } else {
        out.push({ price: lv.price, qty, sellers: lv.seller ? [lv.seller] : [] });
      }
    }
    return out;
  }

  function calcMinQtyForTargetGems(sellGems, lot, targetGems) {
    const minBase = lot > 1 && netItemGems(sellGems, 1).effPct >= 24 ? lot : 1;
    const perUnitEst = netItemGems(sellGems, Math.max(minBase, 1)).netPerUnit;
    if (perUnitEst <= 0) return minBase;
    let q = Math.max(minBase, Math.ceil(targetGems / perUnitEst));
    while (netItemGems(sellGems, q).net < targetGems && q < 100000) q++;
    return q;
  }

  // Analisa se vale a pena fazer trading (arbitragem cruzada Ouro↔Gema e flip na mesma moeda)
  // Valida spreads contra taxas oficiais (15% + 15% ou 15% no flip), profundidade do book e média/volume 7d.
  function buildTradingPlan({ routes, gold = 0, gems = 0, source = 'book' } = {}) {
    const valid = rankRoutes(routes).map(normalizeReverseRoute).filter(Boolean);
    if (!valid.length) return null;

    const goldBudget = Math.max(0, Number(gold) || 0);
    const gemsBudget = Math.max(0, Number(gems) || 0);
    const opportunities = [];
    let bestSpread = null;

    // 1) Arbitragem cruzada (par itemA Ouro->Gema + itemB Gema->Ouro, itemA !== itemB)
    for (const a of valid) {
      for (const b of valid) {
        if (a.id === b.id) continue;
        const roiPct = (b.netCoinsPerGem / a.coinsPerGem - 1) * 100;
        if (!Number.isFinite(roiPct)) continue;

        if (!bestSpread || roiPct > bestSpread.roiPct) {
          bestSpread = {
            kind: 'cross',
            buyId: a.id,
            buyLabel: a.label,
            sellId: b.id,
            sellLabel: b.label,
            roiPct,
            coinsPerGemIn: a.coinsPerGem,
            netCoinsPerGemOut: b.netCoinsPerGem,
          };
        }

        if (roiPct <= 0) continue;

        // ROI conservador usando média 7d nas pontas de venda (se book estiver acima da média)
        const hasAnyAvg = (Number.isFinite(b.coinsAvg7d) && b.coinsAvg7d > 0) || (Number.isFinite(a.gemsAvg7d) && a.gemsAvg7d > 0);
        let roiAtAvg7dPct = null;
        if (hasAnyAvg) {
          const consSellGems = (a.gemsAvg7d && a.gemsAvg7d < a.sellGems) ? a.gemsAvg7d : a.sellGems;
          const consNetGemsU = netItemGems(Math.max(2, consSellGems), a.lot || 1).netPerUnit;
          const consCpgIn = consNetGemsU > 0 ? a.buyCoins / consNetGemsU : Infinity;
          const consSellCoins = (b.coinsAvg7d && b.coinsAvg7d < b.sellCoins) ? b.coinsAvg7d : b.sellCoins;
          const consNetCoinsU = netItemCoins(Math.max(2, consSellCoins), 1).netPerUnit;
          const consCpgOut = b.buyGems > 0 ? consNetCoinsU / b.buyGems : 0;
          if (Number.isFinite(consCpgIn) && consCpgIn > 0 && consCpgOut > 0) {
            roiAtAvg7dPct = (consCpgOut / consCpgIn - 1) * 100;
          }
        }

        const risks = [];
        let confidence = source === 'book' ? 'high' : 'low';
        if (source !== 'book') risks.push('estimativa da lista (clique Escanear)');

        if (b.coinsAvg7d && b.sellCoins > b.coinsAvg7d * 1.15) {
          const overPct = Math.round((b.sellCoins / b.coinsAvg7d - 1) * 100);
          risks.push(`venda Coins de ${b.label} +${overPct}% acima da média 7d (${formatCoins(b.coinsAvg7d)})`);
        }
        if (a.gemsAvg7d && a.sellGems > a.gemsAvg7d * 1.15) {
          const overPct = Math.round((a.sellGems / a.gemsAvg7d - 1) * 100);
          risks.push(`venda Gemas de ${a.label} +${overPct}% acima da média 7d (${formatGems(a.gemsAvg7d)})`);
        }
        if (roiAtAvg7dPct != null && roiAtAvg7dPct <= 0) {
          risks.push(`na média 7d dá ${formatPct(roiAtAvg7dPct)} (prejuízo)`);
          confidence = 'low';
        }
        if (b.coinsVol7d != null && b.coinsVol7d < 5) {
          risks.push(`${b.label}: só ${b.coinsVol7d} vendas Coins em 7d`);
          if (b.coinsVol7d < 3) confidence = 'low';
        }
        if (a.gemsVol7d != null && a.gemsVol7d < 5) {
          risks.push(`${a.label}: só ${a.gemsVol7d} vendas Gemas em 7d`);
          if (a.gemsVol7d < 3) confidence = 'low';
        }
        if (source === 'book') {
          if ((a.totalFreeCoinsUnits || 0) < 15 && (a.unitsAtBestCoins || 0) < 5) risks.push(`book Coins raso em ${a.label}`);
          if ((b.totalFreeGemsUnits || 0) < 15 && (b.unitsAtBestGems || 0) < 5) risks.push(`book Gemas raso em ${b.label}`);
          if ((b.totalFreeCoinsUnits || 0) > 0 && (b.totalFreeCoinsUnits || 0) < 5) risks.push(`poucos anúncios Coins em ${b.label}`);
        }
        if (confidence === 'high' && risks.length > 0) confidence = 'medium';

        // Capital mínimo para fechar 1 ciclo completo em Coins ou em Gemas
        const minQtyA = calcMinQtyForTargetGems(a.sellGems, a.lot || 1, b.buyGems);
        const minCapitalCoins = a.buyCoins * minQtyA;
        const entryCoinsA = a.minEntryCoins || a.buyCoins;
        const minQtyB = Math.max(1, Math.ceil(entryCoinsA / b.netCoinsUnit));
        const minCapitalGems = b.buyGems * minQtyB;

        const canRunGold = goldBudget >= minCapitalCoins;
        const canRunGems = gemsBudget >= minCapitalGems;

        let startCurrency = 'coins';
        if (canRunGems && !canRunGold) startCurrency = 'gems';
        else if (!canRunGold && !canRunGems && gemsBudget > 0 && (gemsBudget / minCapitalGems) > (goldBudget / minCapitalCoins)) {
          startCurrency = 'gems';
        }

        let step1, step2, profitText, capitalText, affordable, missingText = '', effectiveRoiPct = roiPct;
        if (startCurrency === 'coins') {
          affordable = canRunGold;
          const qA = affordable
            ? planBuyFromLevels(a.coinsLevels, goldBudget, a.buyCoins * 1.04, a.buyCoins).qty || minQtyA
            : minQtyA;
          const pA = affordable
            ? planBuyFromLevels(a.coinsLevels, goldBudget, a.buyCoins * 1.04, a.buyCoins)
            : { qty: minQtyA, totalCost: minCapitalCoins, maxPricePaid: a.buyCoins };
          const netGemsMid = netItemGems(a.sellGems, pA.qty).net;
          const pB = planBuyFromLevels(b.gemsLevels, netGemsMid, b.buyGems * 1.04, b.buyGems);
          const qB = pB.qty >= 1 ? pB.qty : 1;
          const spentGemsB = pB.qty >= 1 ? pB.totalCost : b.buyGems;
          const netCoinsEnd = netItemCoins(b.sellCoins, qB).net;
          const leftoverGems = Math.max(0, netGemsMid - spentGemsB);
          const equivEndCoins = netCoinsEnd + leftoverGems * b.netCoinsPerGem;
          const equivProfitCoins = equivEndCoins - pA.totalCost;
          if (affordable && pA.totalCost > 0) effectiveRoiPct = (equivProfitCoins / pA.totalCost) * 100;

          step1 = `Ouro→Gema: compre ${pA.qty}× ${a.marketName} (${formatCoins(pA.totalCost)}) e anuncie por ${a.sellGems}G/un → ${formatGems(netGemsMid)} líq.`;
          step2 = `Gema→Ouro: compre ${qB}× ${b.marketName} (${formatGems(spentGemsB)}) e anuncie por ${formatCoinsExact(b.sellCoins)} Coins/un → ${formatCoins(netCoinsEnd)} líq.${leftoverGems > 0 ? ` (+${formatGems(leftoverGems)} sobra)` : ''}`;
          capitalText = affordable ? `Capital usado: ${formatCoins(pA.totalCost)}` : `Capital mín.: ${formatCoins(minCapitalCoins)}`;
          missingText = affordable ? '' : `falta +${formatCoins(Math.max(0, minCapitalCoins - goldBudget))}`;
          profitText = `${equivProfitCoins >= 0 ? '+' : ''}${formatCoins(Math.abs(equivProfitCoins))} líq. (${formatPct(effectiveRoiPct)})`;
        } else {
          affordable = canRunGems;
          const pB = affordable
            ? planBuyFromLevels(b.gemsLevels, gemsBudget, b.buyGems * 1.04, b.buyGems)
            : { qty: minQtyB, totalCost: minCapitalGems, maxPricePaid: b.buyGems };
          const netCoinsMid = netItemCoins(b.sellCoins, pB.qty).net;
          const pA = planBuyFromLevels(a.coinsLevels, netCoinsMid, a.buyCoins * 1.04, a.buyCoins);
          const qA = pA.qty >= 1 ? pA.qty : 1;
          const spentCoinsA = pA.qty >= 1 ? pA.totalCost : a.buyCoins;
          const netGemsEnd = netItemGems(a.sellGems, qA).net;
          const leftoverCoins = Math.max(0, netCoinsMid - spentCoinsA);
          const equivEndGems = netGemsEnd + leftoverCoins / a.coinsPerGem;
          const equivProfitGems = equivEndGems - pB.totalCost;
          if (affordable && pB.totalCost > 0) effectiveRoiPct = (equivProfitGems / pB.totalCost) * 100;

          step1 = `Gema→Ouro: compre ${pB.qty}× ${b.marketName} (${formatGems(pB.totalCost)}) e anuncie por ${formatCoinsExact(b.sellCoins)} Coins/un → ${formatCoins(netCoinsMid)} líq.`;
          step2 = `Ouro→Gema: compre ${qA}× ${a.marketName} (${formatCoins(spentCoinsA)}) e anuncie por ${a.sellGems}G/un → ${formatGems(netGemsEnd)} líq.${leftoverCoins >= 1e6 ? ` (+${formatCoins(leftoverCoins)} sobra)` : ''}`;
          capitalText = affordable ? `Capital usado: ${formatGems(pB.totalCost)}` : `Capital mín.: ${formatGems(minCapitalGems)}`;
          missingText = affordable ? '' : `falta +${formatGems(Math.max(0, minCapitalGems - gemsBudget))}`;
          const profAbs = Math.abs(equivProfitGems);
          const profStr = profAbs >= 10 ? `${Math.round(profAbs)}G` : `${profAbs.toFixed(1).replace('.', ',')}G`;
          profitText = `${equivProfitGems >= 0 ? '+' : '-'}${profStr} líq. (${formatPct(effectiveRoiPct)})`;
        }

        if (effectiveRoiPct <= 0) continue;

        opportunities.push({
          kind: 'cross',
          id: `cross:${a.id}->${b.id}`,
          title: `${a.label} → ${b.label}`,
          subtitle: startCurrency === 'coins' ? 'Ciclo Ouro → Gema → Ouro' : 'Ciclo Gema → Ouro → Gema',
          startCurrency,
          buyId: a.id,
          sellId: b.id,
          roiPct: effectiveRoiPct,
          baseRoiPct: roiPct,
          roiAtAvg7dPct,
          confidence,
          affordable,
          minCapitalCoins,
          minCapitalGems,
          capitalText,
          missingText,
          step1,
          step2,
          profitText,
          risks,
        });
      }
    }

    // 2) Flip / Snipe na mesma moeda (somente em modo 'book' com degraus reais)
    if (source === 'book') {
      for (const r of valid) {
        const itemDef = LIQUID_ITEMS.find(it => it.id === r.id);

        // 2a) Flip em Coins
        const cGroups = groupPriceLevels(r.coinsLevels);
        if (cGroups.length >= 2) {
          const g0 = cGroups[0], g1 = cGroups[1];
          const sellPrice = Math.max(2, g1.price - 1);
          const affordable = goldBudget >= g0.price;
          const qty = affordable ? Math.min(g0.qty, Math.floor(goldBudget / g0.price)) : 1;
          const cost = g0.price * qty;
          const net = netItemCoins(sellPrice, qty).net;
          const profit = net - cost;
          const roiPct = cost > 0 ? (profit / cost) * 100 : 0;
          if (profit > 0) {
            const risks = [];
            let confidence = 'high';
            let roiAtAvg7dPct = null;
            if (r.coinsAvg7d) {
              const consNet = netItemCoins(r.coinsAvg7d, qty).net;
              roiAtAvg7dPct = cost > 0 ? ((consNet - cost) / cost) * 100 : null;
              if (sellPrice > r.coinsAvg7d * 1.15) {
                const overPct = Math.round((sellPrice / r.coinsAvg7d - 1) * 100);
                risks.push(`revenda +${overPct}% acima da média 7d (${formatCoins(r.coinsAvg7d)})`);
              }
              if (roiAtAvg7dPct != null && roiAtAvg7dPct <= 0) {
                risks.push(`na média 7d dá ${formatPct(roiAtAvg7dPct)} (prejuízo)`);
                confidence = 'low';
              }
            }
            if (r.coinsVol7d != null && r.coinsVol7d < 5) {
              risks.push(`só ${r.coinsVol7d} vendas Coins em 7d`);
              if (r.coinsVol7d < 3) confidence = 'low';
            }
            if ((r.totalFreeCoinsUnits || 0) - g0.qty < 3) risks.push('poucos anúncios acima do nível 1');
            if (confidence === 'high' && risks.length > 0) confidence = 'medium';

            opportunities.push({
              kind: 'flip-coins',
              id: `flip-coins:${r.id}`,
              title: `Flip Coins · ${r.label}`,
              subtitle: `Snipe no book de Coins (${g0.qty} un. no nível 1)`,
              startCurrency: 'coins',
              buyId: r.id,
              sellId: r.id,
              roiPct,
              baseRoiPct: roiPct,
              roiAtAvg7dPct,
              confidence,
              affordable,
              minCapitalCoins: g0.price,
              minCapitalGems: 0,
              capitalText: affordable ? `Capital usado: ${formatCoins(cost)}` : `Capital mín.: ${formatCoins(g0.price)}`,
              missingText: affordable ? '' : `falta +${formatCoins(Math.max(0, g0.price - goldBudget))}`,
              step1: `Compre ${qty}× ${r.marketName} em Coins a ${formatCoins(g0.price)}/un${qty > 1 ? ` (total ${formatCoins(cost)})` : ''}`,
              step2: `Revenda ${qty}× em Coins por ${formatCoinsExact(sellPrice)}/un → ${formatCoins(net)} líq.`,
              profitText: `+${formatCoins(profit)} líq. (${formatPct(roiPct)})`,
              risks,
            });
          }
        }

        // 2b) Flip em Gemas
        const gGroups = groupPriceLevels(r.gemsLevels);
        if (gGroups.length >= 2) {
          const g0 = gGroups[0], g1 = gGroups[1];
          const cut = itemDef && itemDef.minUndercutAsk
            ? (g1.price >= itemDef.minUndercutAsk ? (itemDef.undercut || 0) : 0)
            : (itemDef ? (itemDef.undercut || 0) : 1);
          const sellPrice = Math.max(2, g1.price - cut);
          const affordable = gemsBudget >= g0.price;
          const minLot = Math.min(g0.qty, r.lot || 1);
          const qty = affordable ? Math.min(g0.qty, Math.floor(gemsBudget / g0.price)) : minLot;
          const cost = g0.price * qty;
          const net = netItemGems(sellPrice, qty).net;
          const profit = net - cost;
          const roiPct = cost > 0 ? (profit / cost) * 100 : 0;
          if (profit > 0) {
            const risks = [];
            let confidence = 'high';
            let roiAtAvg7dPct = null;
            if (r.gemsAvg7d) {
              const consNet = netItemGems(r.gemsAvg7d, qty).net;
              roiAtAvg7dPct = cost > 0 ? ((consNet - cost) / cost) * 100 : null;
              if (sellPrice > r.gemsAvg7d * 1.15) {
                const overPct = Math.round((sellPrice / r.gemsAvg7d - 1) * 100);
                risks.push(`revenda +${overPct}% acima da média 7d (${formatGems(r.gemsAvg7d)})`);
              }
              if (roiAtAvg7dPct != null && roiAtAvg7dPct <= 0) {
                risks.push(`na média 7d dá ${formatPct(roiAtAvg7dPct)} (prejuízo)`);
                confidence = 'low';
              }
            }
            if (r.gemsVol7d != null && r.gemsVol7d < 5) {
              risks.push(`só ${r.gemsVol7d} vendas Gemas em 7d`);
              if (r.gemsVol7d < 3) confidence = 'low';
            }
            if ((r.totalFreeGemsUnits || 0) - g0.qty < 3) risks.push('poucos anúncios acima do nível 1');
            if (confidence === 'high' && risks.length > 0) confidence = 'medium';

            opportunities.push({
              kind: 'flip-gems',
              id: `flip-gems:${r.id}`,
              title: `Flip Gemas · ${r.label}`,
              subtitle: `Snipe no book de Gemas (${g0.qty} un. no nível 1)`,
              startCurrency: 'gems',
              buyId: r.id,
              sellId: r.id,
              roiPct,
              baseRoiPct: roiPct,
              roiAtAvg7dPct,
              confidence,
              affordable,
              minCapitalCoins: 0,
              minCapitalGems: g0.price,
              capitalText: affordable ? `Capital usado: ${formatGems(cost)}` : `Capital mín.: ${formatGems(g0.price)}`,
              missingText: affordable ? '' : `falta +${formatGems(Math.max(0, g0.price - gemsBudget))}`,
              step1: `Compre ${qty}× ${r.marketName} em Gemas a ${formatGems(g0.price)}/un${qty > 1 ? ` (total ${formatGems(cost)})` : ''}`,
              step2: `Revenda ${qty}× em Gemas por ${formatGems(sellPrice)}/un → ${formatGems(net)} líq.`,
              profitText: `+${formatGems(profit)} líq. (${formatPct(roiPct)})`,
              risks,
            });
          }
        }
      }
    }

    const confRank = { high: 2, medium: 1, low: 0 };
    opportunities.sort((x, y) => (confRank[y.confidence] - confRank[x.confidence]) || (y.roiPct - x.roiPct));

    if (!opportunities.length) {
      const gapTxt = bestSpread
        ? `Melhor ciclo: ${formatPct(bestSpread.roiPct)} após taxas 15%+15% (${bestSpread.buyLabel} → ${bestSpread.sellLabel})`
        : 'Nenhuma rota cobre a comissão de 15%';
      return {
        direction: 'trading',
        verdict: 'NO_TRADE',
        headline: 'NÃO VALE TRADING AGORA',
        summary: `${gapTxt} · sem flip lucrativo`,
        source,
        gold: goldBudget,
        gems: gemsBudget,
        best: null,
        bestSpread,
        opportunities: [],
      };
    }

    const best = opportunities[0];
    const isFlip = best.kind.startsWith('flip-');
    if (best.confidence !== 'low' && best.roiPct >= 3) {
      return {
        direction: 'trading',
        verdict: 'PROFITABLE',
        headline: isFlip
          ? `VALE FLIP (${formatPct(best.roiPct)} líq.)`
          : `VALE TRADING (${formatPct(best.roiPct)} / ciclo)`,
        summary: `${best.title} · ${best.profitText}${best.missingText ? ` · ${best.missingText}` : ''}`,
        source,
        gold: goldBudget,
        gems: gemsBudget,
        best,
        bestSpread,
        opportunities: opportunities.slice(0, 8),
      };
    }

    return {
      direction: 'trading',
      verdict: 'RISKY',
      headline: `TRADING COM RISCO (${formatPct(best.roiPct)} teórico)`,
      summary: `${best.title} · ${best.risks[0] || 'margem apertada (<3%)'}`,
      source,
      gold: goldBudget,
      gems: gemsBudget,
      best,
      bestSpread,
      opportunities: opportunities.slice(0, 8),
    };
  }

  function formatTradingPlanText(plan) {
    if (!plan) return 'Abra RMT → Itens ou clique Escanear.';
    const lines = [plan.headline, plan.summary];
    if (plan.best) {
      lines.push(`1. ${plan.best.step1}`);
      lines.push(`2. ${plan.best.step2}`);
      lines.push(`LUCRO: ${plan.best.profitText} (${plan.best.capitalText})`);
      if (plan.best.risks && plan.best.risks.length) {
        lines.push(`RISCOS: ${plan.best.risks.join(' · ')}`);
      }
    }
    return lines.join('\n');
  }

  // Formata o plano de ação em texto claro (usado em logs, testes e fallback)
  function formatActionPlanText(plan) {
    if (!plan) return 'Abra RMT → Itens ou clique Escanear.';
    if (plan.direction === 'gem-to-gold') return formatGemToGoldPlanText(plan);
    if (plan.direction === 'trading') return formatTradingPlanText(plan);
    const lines = [plan.headline, plan.summary];
    if (plan.verdict === 'BUY_NOW' && plan.primary) {
      lines.push(`1. COMPRAR (${plan.primary.where}): ${plan.primary.buyText}`);
      lines.push(`2. VENDER: ${plan.primary.sellText}`);
    } else if (plan.verdict === 'SAVE_OR_BUY') {
      if (plan.primary) {
        lines.push(`META (falta ${formatCoins(plan.primary.missingCoins)}): ${plan.primary.buyText} → ${plan.primary.sellText}`);
      }
      if (plan.fallback) {
        lines.push(`AGORA (-${plan.lossPct}% gemas): ${plan.fallback.buyText} → ${plan.fallback.sellText}`);
      }
    } else if (plan.verdict === 'SAVE_ONLY') {
      if (plan.primary) {
        lines.push(`META ÓTIMA (falta ${formatCoins(plan.primary.missingCoins)}): ${plan.primary.buyText} → ${plan.primary.sellText}`);
      }
      if (plan.fallback) {
        lines.push(`1ª ENTRADA (falta ${formatCoins(plan.fallback.missingCoins)}): ${plan.fallback.buyText} → ${plan.fallback.sellText}`);
      }
    }
    return lines.join('\n');
  }

  return {
    LIQUID_ITEMS,
    matchLiquidItem,
    parseCompactNum,
    parseAvg7d,
    netItemGems,
    netItemCoins,
    pickBestFreeOffer,
    planBuyFromLevels,
    evaluateItemRoute,
    buildRouteInstruction,
    buildActionPlan,
    buildGemToGoldInstruction,
    buildGemToGoldActionPlan,
    buildTradingPlan,
    formatGemToGoldPlanText,
    formatTradingPlanText,
    formatActionPlanText,
    rankRoutes,
    rankReverseRoutes,
    formatCoins,
    formatCoinsExact,
    formatGems,
  };
})();
if (typeof module !== 'undefined') module.exports = PK_RMT;
