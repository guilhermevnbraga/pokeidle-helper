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
      // Com sufixo (ex: "2,5M" ou "9.010T"): ponto antes de 3 digitos e milhar, virgula e decimal
      numStr = numStr.replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.');
    } else {
      // Inteiro formatado PT-BR (ex: "702.500.000")
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
  function pickBestFreeOffer(offers, minSanityPrice = 1) {
    let skippedHeld = 0, skippedTroll = 0;
    const valid = [];
    for (const o of (offers || [])) {
      if (!o || !Number.isFinite(o.price) || o.price <= 0) continue;
      if (o.held) { skippedHeld++; continue; }
      if (o.price < minSanityPrice) { skippedTroll++; continue; }
      valid.push({ price: o.price, qty: Math.max(1, Math.floor(o.qty) || 1) });
    }
    if (!valid.length) {
      return { bestPrice: null, unitsAtBest: 0, totalFreeUnits: 0, totalFreeOrders: 0, skippedHeld, skippedTroll };
    }
    valid.sort((a, b) => a.price - b.price);
    const bestPrice = valid[0].price;
    const unitsAtBest = valid.filter(o => o.price === bestPrice).reduce((s, o) => s + o.qty, 0);
    const totalFreeUnits = valid.reduce((s, o) => s + o.qty, 0);
    return { bestPrice, unitsAtBest, totalFreeUnits, totalFreeOrders: valid.length, skippedHeld, skippedTroll };
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
    return {
      id: item.id,
      label: item.label,
      kind: 'item',
      source,
      buyCoins,
      askGems,
      sellGems,
      lot,
      netGemsUnit: netLot.netPerUnit,
      effFeePct: netLot.effPct,
      coinsPerGem,
      coinsFor1000Gems: coinsPerGem * 1000,
      unitsAtBestCoins: coinsOffer.unitsAtBest || 0,
      totalFreeCoinsUnits: coinsOffer.totalFreeUnits || 0,
      canAfford: gold >= buyCoins,
      warnings,
    };
  }

  // Avalia rota de Pokémon de Sacrifício (piso N >= 3,5)
  function evaluateSacrificeRoute({ coinsOffer, gemasOffer, gold = 0, pensionCoins = 100000 }) {
    if (!coinsOffer || !gemasOffer || !coinsOffer.bestPrice || !gemasOffer.bestPrice) return null;
    const buyCoins = coinsOffer.bestPrice;
    const askGems = gemasOffer.bestPrice;
    // Sanidade: piso de sacrifício N 3,5 nunca custa > 500 Gemas (protege contra leitura cruzada de moeda)
    if (askGems > 500 || buyCoins < 1e6) return null;
    // Para piso de 7-8G, vender no piso ou -1 (mínimo 2G); se ask >= 8, testa ask-1 (7G) pois 7G e 8G rendem ambos 6G com ceil
    const sellGems = askGems >= 8 ? askGems - 1 : Math.max(2, askGems);
    const net = netPokeGems(sellGems);
    if (net.net <= 0) return null;
    const totalCost = buyCoins + pensionCoins;
    const coinsPerGem = totalCost / net.net;
    const warnings = ['13% + pensão 100k/d'];
    if (coinsOffer.skippedHeld > 0) warnings.push('retidos ignorados');
    return {
      id: 'poke-sacrifice',
      label: 'Poke Sacrifício',
      kind: 'pokemon',
      source: 'book',
      buyCoins: totalCost,
      askGems,
      sellGems,
      lot: 1,
      netGemsUnit: net.net,
      effFeePct: net.effPct,
      coinsPerGem,
      coinsFor1000Gems: coinsPerGem * 1000,
      unitsAtBestCoins: coinsOffer.unitsAtBest || 0,
      totalFreeCoinsUnits: coinsOffer.totalFreeUnits || 0,
      canAfford: gold >= totalCost,
      warnings,
    };
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

  return {
    LIQUID_ITEMS,
    matchLiquidItem,
    parseCompactNum,
    netItemGems,
    netPokeGems,
    pickBestFreeOffer,
    evaluateItemRoute,
    evaluateSacrificeRoute,
    rankRoutes,
    formatCoins,
  };
})();
if (typeof module !== 'undefined') module.exports = PK_RMT;
