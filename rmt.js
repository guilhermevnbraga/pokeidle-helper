/* Lógica pura do Radar RMT (Ouro -> Gema) do pokeidle.io.
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

  // Categorias de Pokémon com liquidez real em Gemas (comparadas sempre contra o piso da própria categoria)
  const POKE_CATEGORIES = [
    { id: 'poke-sacrifice', label: 'Poke Sacrifício', filterId: null, filterLabel: 'sem filtro (N ≥ 3,5)', minSanityCoins: 5e6, maxSanityGems: 500, lowLiquidity: false },
    { id: 'poke-p5', label: 'Poke P5', filterId: '#cm-p5', filterLabel: 'filtro P5', minSanityCoins: 20e6, maxSanityGems: 5000, lowLiquidity: false },
    { id: 'poke-mega', label: 'Poke Mega', filterId: '#cm-mega', filterLabel: 'filtro Mega', minSanityCoins: 100e6, maxSanityGems: 20000, lowLiquidity: true },
    { id: 'poke-shiny', label: 'Poke Shiny', filterId: '#cm-shiny', filterLabel: 'filtro Shiny', minSanityCoins: 50e6, maxSanityGems: 20000, lowLiquidity: true },
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

  // Comissão progressiva oficial de Pokémon em Gema (Wiki): 13% <=500, 10% <=5000, 7,5% >5000
  function netPokeGems(gross) {
    if (!Number.isFinite(gross) || gross <= 0) return { gross: 0, fee: 0, net: 0, effPct: 0 };
    const f1 = Math.min(gross, 500) * 0.13;
    const f2 = Math.max(0, Math.min(gross, 5000) - 500) * 0.10;
    const f3 = Math.max(0, gross - 5000) * 0.075;
    const fee = Math.ceil(f1 + f2 + f3);
    const net = Math.max(0, gross - fee);
    return { gross, fee, net, effPct: (fee / gross) * 100 };
  }

  // Filtra ofertas de book: descarta "Retido" (2 min) e preços trolls (< minSanityPrice)
  // Preserva níveis livres ordenados e metadados (nome/vendedor/atributos de Pokémon ou item).
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

  // Calcula quantas unidades comprar no book real com o ouro disponível sem ultrapassar maxUnitPrice
  function planBuyFromLevels(levels, gold, maxUnitPrice, fallbackUnitPrice) {
    const budget = Math.max(0, Number(gold) || 0);
    const list = (levels && levels.length)
      ? levels
      : (fallbackUnitPrice > 0 ? [{ price: fallbackUnitPrice, qty: 1000, seller: null }] : []);
    if (!list.length || budget <= 0) {
      return { qty: 0, totalCoins: 0, avgPrice: 0, maxPricePaid: 0, sellers: [] };
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
      avgPrice: qty > 0 ? totalCoins / qty : 0,
      maxPricePaid,
      sellers,
    };
  }

  // Avalia rota de um item líquido (modo 'book' = verificado no book; 'list' = estimativa da tabela esquerda)
  function evaluateItemRoute({ item, coinsOffer, gemasOffer, gold = 0, source = 'book' }) {
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
    };
  }

  // Avalia rota de qualquer categoria de Pokémon (Sacrifício, P5, Mega, Shiny)
  function evaluatePokeRoute({ category, coinsOffer, gemasOffer, gold = 0, pensionCoins = 100000 }) {
    const cat = category || POKE_CATEGORIES[0];
    if (!coinsOffer || !gemasOffer || !coinsOffer.bestPrice || !gemasOffer.bestPrice) return null;
    const rawBuyCoins = coinsOffer.bestPrice;
    const askGems = gemasOffer.bestPrice;
    if (askGems > cat.maxSanityGems || rawBuyCoins < (cat.minSanityCoins || 1e6)) return null;

    // Undercut inteligente: para 8G usa 7G (ambos rendem 6G líq. com ceil 13%, mas 7G fura fila);
    // abaixo de 8G preserva o piso (mín 2G); acima de 8G faz ask - 1.
    const sellGems = askGems >= 8 ? askGems - 1 : Math.max(2, askGems);
    const net = netPokeGems(sellGems);
    if (net.net <= 0) return null;

    const totalCost = rawBuyCoins + pensionCoins;
    const coinsPerGem = totalCost / net.net;
    const warnings = [`${Math.round(net.effPct)}% + pensão 100k/d`];
    if (cat.lowLiquidity) warnings.push('liquidez menor (confira espécie)');
    if (coinsOffer.skippedHeld > 0) warnings.push('retidos ignorados');

    const topPokes = (coinsOffer.topOffers || []).map(o => ({
      name: o.name || cat.label,
      level: o.level || '',
      pot: o.pot || '',
      nota: o.nota || '',
      seller: o.seller || '',
      price: o.price,
      favId: o.favId || null,
    }));
    const bestPoke = topPokes[0] || {
      name: cat.label,
      level: '',
      pot: '',
      nota: '',
      seller: '',
      price: rawBuyCoins,
      favId: null,
    };
    const refGemPoke = gemasOffer.bestOffer ? {
      name: gemasOffer.bestOffer.name || '',
      nota: gemasOffer.bestOffer.nota || '',
      price: gemasOffer.bestPrice,
    } : null;

    return {
      id: cat.id,
      label: cat.label,
      categoryLabel: cat.label,
      filterId: cat.filterId || null,
      filterLabel: cat.filterLabel || 'sem filtro',
      kind: 'pokemon',
      source: 'book',
      buyCoins: totalCost,
      rawBuyCoins,
      minEntryCoins: totalCost,
      pensionCoins,
      askGems,
      sellGems,
      lot: 1,
      netGemsUnit: net.net,
      netGemsLot: net.net,
      effFeePct: net.effPct,
      coinsPerGem,
      coinsFor1000Gems: coinsPerGem * 1000,
      gemsPerBillion: 1e9 / coinsPerGem,
      unitsAtBestCoins: coinsOffer.unitsAtBest || 0,
      totalFreeCoinsUnits: coinsOffer.totalFreeUnits || 0,
      coinsLevels: (coinsOffer.levels || []).map(lv => ({ ...lv, price: lv.price + pensionCoins })),
      bestPoke,
      topPokes,
      refGemPoke,
      canAfford: gold >= totalCost,
      warnings,
    };
  }

  // Retrocompatibilidade com assinatura anterior
  function evaluateSacrificeRoute({ coinsOffer, gemasOffer, gold = 0, pensionCoins = 100000 }) {
    return evaluatePokeRoute({ category: POKE_CATEGORIES[0], coinsOffer, gemasOffer, gold, pensionCoins });
  }

  function rankRoutes(routes) {
    return (routes || [])
      .filter(r => r && Number.isFinite(r.coinsPerGem) && r.coinsPerGem > 0)
      .slice()
      .sort((a, b) => a.coinsPerGem - b.coinsPerGem);
  }

  function formatCoins(n) {
    if (!Number.isFinite(n) || n <= 0) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace('.', ',') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
    return String(Math.round(n));
  }

  function formatPokeDescriptor(p) {
    if (!p) return 'Pokémon';
    const meta = [p.level, p.pot, p.nota].filter(Boolean).join(' · ');
    const base = meta ? `${p.name} (${meta})` : p.name;
    return p.seller ? `${base} de ${p.seller}` : base;
  }

  // Gera instrução pronta e acionável (o que comprar, onde ir, por quanto vender, quanto recebe líquido)
  function buildRouteInstruction(route, gold = 0) {
    if (!route) return null;
    const budget = Math.max(0, Number(gold) || 0);

    if (route.kind === 'pokemon') {
      const p = route.bestPoke || { name: route.label, price: route.rawBuyCoins || route.buyCoins };
      const rawPrice = p.price || route.rawBuyCoins || route.buyCoins;
      const pension = route.pensionCoins || 100000;
      const costOne = rawPrice + pension;
      const affordable = budget >= costOne;
      // Verifica se há outros Pokémon livres próximos do piso que cabem no orçamento
      const extraPokes = [];
      let rem = budget - costOne;
      let totalCost = costOne;
      let totalNet = route.netGemsUnit;
      if (affordable && route.topPokes && route.topPokes.length > 1) {
        const cap = rawPrice * 1.08;
        for (let i = 1; i < route.topPokes.length; i++) {
          const cand = route.topPokes[i];
          const candCost = cand.price + pension;
          if (cand.price <= cap && rem >= candCost) {
            extraPokes.push(cand);
            rem -= candCost;
            totalCost += candCost;
            totalNet += route.netGemsUnit;
          }
        }
      }
      const where = route.filterId
        ? `RMT → Pokémon → Coins + ${route.filterLabel} (Menor preço)`
        : 'RMT → Pokémon → Coins (Menor preço)';
      const pokeTxt = formatPokeDescriptor(p);
      const qty = affordable ? (1 + extraPokes.length) : 1;
      const buyText = extraPokes.length
        ? `${pokeTxt} por ${formatCoins(rawPrice)} (+${extraPokes.length} outro${extraPokes.length > 1 ? 's' : ''} no piso até ${formatCoins(extraPokes[extraPokes.length - 1].price)})`
        : `${pokeTxt} por ${formatCoins(rawPrice)}`;
      const sellText = qty > 1
        ? `Anuncie cada por ${route.sellGems} Gemas (+100k pensão/d) → ${totalNet}G líq. (${route.netGemsUnit}G cada)`
        : `Anuncie por ${route.sellGems} Gemas (+100k pensão 1d) → recebe ${route.netGemsUnit}G líq.`;
      return {
        routeId: route.id,
        kind: 'pokemon',
        label: route.label,
        where,
        qty,
        affordable,
        missingCoins: affordable ? 0 : Math.max(0, costOne - budget),
        totalCoins: affordable ? totalCost : costOne,
        netGemsTotal: affordable ? totalNet : route.netGemsUnit,
        coinsPerGem: (affordable ? totalCost : costOne) / (affordable ? totalNet : route.netGemsUnit),
        buyText,
        sellText,
        poke: p,
        extraPokes,
        note: route.warnings && route.warnings.length ? route.warnings.join(' · ') : '',
      };
    }

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

  // Formata o plano de ação em texto claro (usado em logs, testes e fallback)
  function formatActionPlanText(plan) {
    if (!plan) return 'Abra RMT → Itens ou clique Escanear.';
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
      if (plan.fallback) {
        lines.push(`1ª ENTRADA (falta ${formatCoins(plan.fallback.missingCoins)}): ${plan.fallback.buyText} → ${plan.fallback.sellText}`);
      }
      if (plan.primary) {
        lines.push(`META ÓTIMA (falta ${formatCoins(plan.primary.missingCoins)}): ${plan.primary.buyText} → ${plan.primary.sellText}`);
      }
    }
    return lines.join('\n');
  }

  return {
    LIQUID_ITEMS,
    POKE_CATEGORIES,
    matchLiquidItem,
    parseCompactNum,
    netItemGems,
    netPokeGems,
    pickBestFreeOffer,
    planBuyFromLevels,
    evaluateItemRoute,
    evaluatePokeRoute,
    evaluateSacrificeRoute,
    buildRouteInstruction,
    buildActionPlan,
    formatActionPlanText,
    rankRoutes,
    formatCoins,
    formatPokeDescriptor,
  };
})();
if (typeof module !== 'undefined') module.exports = PK_RMT;
