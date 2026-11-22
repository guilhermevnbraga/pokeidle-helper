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
  function evaluateItemRoute({ item, coinsOffer, gemasOffer, gold = 0, gems = 0, source = 'book' }) {
    if (!item || !coinsOffer || !gemasOffer) return null;
    const buyCoins = coinsOffer.bestPrice;
    const askGems = gemasOffer.bestPrice;
    if (!buyCoins || !askGems) return null;

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

  // Formata o plano de ação em texto claro (usado em logs, testes e fallback)
  function formatActionPlanText(plan) {
    if (!plan) return 'Abra RMT → Itens ou clique Escanear.';
    if (plan.direction === 'gem-to-gold') return formatGemToGoldPlanText(plan);
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
    netItemGems,
    netItemCoins,
    pickBestFreeOffer,
    planBuyFromLevels,
    evaluateItemRoute,
    buildRouteInstruction,
    buildActionPlan,
    buildGemToGoldInstruction,
    buildGemToGoldActionPlan,
    formatGemToGoldPlanText,
    formatActionPlanText,
    rankRoutes,
    rankReverseRoutes,
    formatCoins,
    formatCoinsExact,
    formatGems,
  };
})();
if (typeof module !== 'undefined') module.exports = PK_RMT;
