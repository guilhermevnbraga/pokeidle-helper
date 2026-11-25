/* Análise temporal do Radar RMT: o preço de agora é bom ou é melhor esperar?
   Lógica pura (sem DOM): content.js grava um snapshot por scan e consulta o veredito.
   Referências: (1) média 7d do próprio jogo (.cmp-media) e (2) histórico acumulado pelos scans. */
const PK_TIMING = (() => {
  const MAX_SAMPLES = 500;          // por item
  const MAX_AGE_MS = 30 * 864e5;    // 30 dias
  const MIN_GAP_MS = 15 * 60e3;     // snapshots mais próximos que isso substituem o anterior
  const HIST_MIN_N = 8;             // amostras para confiar no histórico
  const HIST_MIN_SPAN_H = 12;       // e cobertura mínima em horas
  const NOW_PCT = 2;                // >= +2% vs normal => bom momento
  const WAIT_PCT = -5;              // <= -5% vs normal => esperar
  const BLOCK_H = 6;                // janelas do dia (4 blocos)

  const num = x => (Number.isFinite(x) && x > 0 ? x : null);
  const dirOf = d => (d === 'gem-to-gold' ? 'gem-to-gold' : 'gold-to-gem');
  // "goodness" em log: maior = melhor para quem opera. Ouro→Gema quer Coins/Gema baixo; Gema→Ouro quer alto.
  const metricOf = (r, dir) => (dir === 'gem-to-gold' ? num(r && r.netCoinsPerGem) : num(r && r.coinsPerGem));
  const good = (v, dir) => (dir === 'gem-to-gold' ? Math.log(v) : -Math.log(v));
  const pctOf = dlog => (Math.exp(dlog) - 1) * 100;

  function emptyHistory() { return { v: 1, items: {} }; }

  function normalizeHistory(h) {
    return h && h.v === 1 && h.items && typeof h.items === 'object' ? h : emptyHistory();
  }

  // Valor "justo" derivado da média 7d (mesma unidade da métrica da rota).
  function fairMetric(r, dir) {
    if (!r) return null;
    const cAvg = num(r.coinsAvg7d), gAvg = num(r.gemsAvg7d);
    const buyCoins = num(r.buyCoins), gemRef = num(dir === 'gem-to-gold' ? r.buyGems : r.sellGems);
    if (!cAvg || !gAvg || !buyCoins || !gemRef) return null;
    // Coins/Gema escala com (média Coins / Coins atual) e (Gemas atual / média Gemas), nos dois sentidos.
    const m = metricOf(r, dir); if (!m) return null;
    return m * (cAvg / buyCoins) * (gemRef / gAvg);
  }

  // Grava um snapshot por item (substitui o último se foi há < 15 min). Retorna o histórico atualizado.
  function recordSnapshot(history, routes, now = Date.now()) {
    const h = normalizeHistory(history);
    for (const r of routes || []) {
      if (!r || !r.id || r.kind === 'pokemon') continue;
      const c = num(r.coinsPerGem), n = num(r.netCoinsPerGem);
      if (!c && !n) continue;
      const fg = fairMetric(r, 'gold-to-gem'), fr = fairMetric(r, 'gem-to-gold');
      const s = { t: now, c: c || null, r: n || null, fc: fg || null, fr: fr || null, bc: num(r.buyCoins), bg: num(r.askGems || r.buyGems) };
      const arr = (h.items[r.id] = h.items[r.id] || []);
      const last = arr[arr.length - 1];
      if (last && now - last.t < MIN_GAP_MS) arr[arr.length - 1] = s; else arr.push(s);
      while (arr.length > MAX_SAMPLES) arr.shift();
    }
    for (const id of Object.keys(h.items)) {
      h.items[id] = h.items[id].filter(s => now - s.t <= MAX_AGE_MS);
      if (!h.items[id].length) delete h.items[id];
    }
    return h;
  }

  function median(a) {
    const s = a.slice().sort((x, y) => x - y), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // Avalia uma rota: { verdict: NOW|NEUTRAL|WAIT|UNKNOWN, scorePct, ... }.
  // scorePct > 0 => rende mais que o normal (ótimo); < 0 => pior que o normal (esperar).
  function assessRoute(route, history, dir, { now = Date.now(), currentAt = null } = {}) {
    dir = dirOf(dir);
    const cur = metricOf(route, dir);
    const out = {
      id: route && route.id, label: route && route.label, verdict: 'UNKNOWN', scorePct: null,
      fairPct: null, histPct: null, percentile: null, n: 0, spanH: 0, reliable: false,
      medianUpsidePct: null, bestUpsidePct: null, bestWindow: null, reasons: [],
    };
    if (!cur) return out;
    const gc = good(cur, dir);

    // (1) vs média 7d do jogo
    const fair = fairMetric(route, dir);
    if (fair) out.fairPct = pctOf(gc - good(fair, dir));

    // (2) vs histórico acumulado (exclui a leitura atual)
    const key = dir === 'gem-to-gold' ? 'r' : 'c';
    const arr = ((history && history.items && history.items[route.id]) || [])
      .filter(s => num(s[key]) && (currentAt == null || s.t !== currentAt));
    out.n = arr.length;
    if (arr.length) {
      out.spanH = (Math.max(...arr.map(s => s.t)) - Math.min(...arr.map(s => s.t))) / 36e5;
      const gs = arr.map(s => good(s[key], dir));
      out.reliable = arr.length >= HIST_MIN_N && out.spanH >= HIST_MIN_SPAN_H;
      const med = median(gs), best = Math.max(...gs);
      out.percentile = (gs.filter(g => g <= gc).length / gs.length) * 100;
      if (out.reliable) {
        out.histPct = pctOf(gc - med);
        out.medianUpsidePct = Math.max(0, pctOf(med - gc));
        out.bestUpsidePct = Math.max(0, pctOf(best - gc));
        // melhor janela do dia (precisa de >= 3 amostras por bloco e >= 24h de cobertura)
        if (out.spanH >= 24) {
          const blocks = {};
          for (const s of arr) { const b = Math.floor(new Date(s.t).getHours() / BLOCK_H); (blocks[b] = blocks[b] || []).push(good(s[key], dir)); }
          const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
          const ok = Object.entries(blocks).filter(([, a]) => a.length >= 3).map(([b, a]) => [Number(b), mean(a)]);
          const curB = Math.floor(new Date(now).getHours() / BLOCK_H);
          const curM = ok.find(([b]) => b === curB);
          if (ok.length >= 2) {
            const [bb, bm] = ok.reduce((p, q) => (q[1] > p[1] ? q : p));
            const gainPct = curM ? pctOf(bm - curM[1]) : null;
            if (bb !== curB && (gainPct == null || gainPct >= 3)) {
              const f = n => String(n).padStart(2, '0');
              out.bestWindow = { from: bb * BLOCK_H, to: (bb + 1) * BLOCK_H, gainPct };
              out.bestWindowText = `${f(bb * BLOCK_H)}–${f((bb + 1) * BLOCK_H)}h${gainPct != null ? ` (+${gainPct.toFixed(1)}%)` : ''}`;
            }
          }
        }
      }
    }

    const parts = [out.fairPct, out.reliable ? out.histPct : null].filter(v => v != null);
    if (!parts.length) { out.reasons.push('sem referência (escaneie mais vezes para formar histórico)'); return out; }
    out.scorePct = parts.reduce((a, b) => a + b, 0) / parts.length;

    let v = out.scorePct >= NOW_PCT ? 'NOW' : (out.scorePct <= WAIT_PCT ? 'WAIT' : 'NEUTRAL');
    if (out.reliable && out.percentile != null) {
      if (out.percentile >= 80 && out.scorePct > WAIT_PCT) v = 'NOW';
      else if (out.percentile <= 20 && out.scorePct < NOW_PCT) v = 'WAIT';
    }
    out.verdict = v;
    const sg = x => `${x >= 0 ? '+' : ''}${x.toFixed(1).replace('.', ',')}%`;
    if (out.fairPct != null) out.reasons.push(`${sg(out.fairPct)} vs média 7d`);
    if (out.reliable) out.reasons.push(`${sg(out.histPct)} vs mediana do histórico (${out.n} leituras/${Math.round(out.spanH)}h, melhor que ${Math.round(out.percentile)}%)`);
    else if (out.n) out.reasons.push(`histórico curto (${out.n} leituras/${Math.round(out.spanH)}h)`);
    if (v === 'WAIT' && out.medianUpsidePct) out.reasons.push(`voltar à mediana rende ~+${out.medianUpsidePct.toFixed(1).replace('.', ',')}%`);
    return out;
  }

  // Compara todas as rotas: decide agir agora, aceitar ou esperar.
  function adviseTiming(routes, history, dir, opts = {}) {
    dir = dirOf(dir);
    const list = (routes || []).map(r => ({ route: r, a: assessRoute(r, history, dir, opts) })).filter(x => x.a.verdict !== 'UNKNOWN' || metricOf(x.route, dir));
    const known = list.filter(x => x.a.scorePct != null);
    const byId = {};
    for (const x of list) byId[x.route.id] = x.a;
    // Foco: julga só a rota recomendada (a que o usuário vai de fato usar), não a "mais barata vs o normal".
    if (opts.focusId != null) {
      const f = list.find(x => x.route.id === opts.focusId);
      if (f) {
        const a = f.a, label = f.route.label;
        const sg = x => `${x >= 0 ? '+' : ''}${x.toFixed(1).replace('.', ',')}%`;
        const marketPct = known.length ? median(known.map(x => x.a.scorePct)) : null;
        const best = { id: f.route.id, label, ...a };
        if (a.scorePct == null) {
          return { dir, verdict: 'UNKNOWN', focus: true, headline: `${label}: sem referência de preço normal ainda; escaneie algumas vezes ao longo do dia.`, best, byId, marketPct, bestWindow: a.bestWindowText || null, nowIds: [], waitIds: [] };
        }
        let verdict = a.verdict, headline;
        if (verdict === 'NOW') headline = `BOM MOMENTO: ${label} está ${sg(a.scorePct)} vs o normal`;
        else if (verdict === 'WAIT') headline = `ESPERE: ${label} está ${sg(a.scorePct)} vs o normal${a.medianUpsidePct ? `; voltar à mediana rende ~+${a.medianUpsidePct.toFixed(1).replace('.', ',')}%` : ''}`;
        else { verdict = 'NEUTRAL'; headline = `PREÇO NORMAL: ${label} está ${sg(a.scorePct)} vs o normal; sem pressa, nem vantagem em esperar muito`; }
        return { dir, verdict, focus: true, headline, best, byId, marketPct, bestWindow: a.bestWindowText || null, nowIds: verdict === 'NOW' ? [f.route.id] : [], waitIds: verdict === 'WAIT' ? [f.route.id] : [] };
      }
    }
    if (!known.length) {
      return { dir, verdict: 'UNKNOWN', headline: 'Sem referência de preço normal ainda: escaneie algumas vezes ao longo do dia.', best: null, byId, marketPct: null };
    }
    const marketPct = median(known.map(x => x.a.scorePct));
    const rank = (a, b) => b.a.scorePct - a.a.scorePct;
    const now = known.filter(x => x.a.verdict === 'NOW').sort(rank);
    const neutral = known.filter(x => x.a.verdict === 'NEUTRAL').sort(rank);
    const wait = known.filter(x => x.a.verdict === 'WAIT').sort(rank);
    const sg = x => `${x >= 0 ? '+' : ''}${x.toFixed(1).replace('.', ',')}%`;
    let verdict, best, headline;
    if (now.length) {
      verdict = 'NOW'; best = now[0];
      headline = `BOM MOMENTO: ${best.route.label} está ${sg(best.a.scorePct)} vs o normal`;
    } else if (neutral.length) {
      verdict = 'NEUTRAL'; best = neutral[0];
      headline = `PREÇO NORMAL: ${best.route.label} (${sg(best.a.scorePct)} vs normal); sem pressa, nem vantagem em esperar muito`;
    } else {
      verdict = 'WAIT'; best = wait[0];
      const up = Math.max(0, ...wait.map(x => x.a.medianUpsidePct || 0));
      headline = `ESPERE: mercado ${sg(marketPct)} vs o normal${up ? `; voltar à mediana rende até ~+${up.toFixed(1).replace('.', ',')}%` : ''}`;
    }
    const win = known.map(x => x.a.bestWindowText).filter(Boolean);
    return { dir, verdict, headline, best: { id: best.route.id, label: best.route.label, ...best.a }, byId, marketPct,
      bestWindow: win.length ? win[0] : null, nowIds: now.map(x => x.route.id), waitIds: wait.map(x => x.route.id) };
  }

  // Núcleo comum: compara o valor atual (log, maior=melhor) com a média 7d e/ou o histórico.
  function judge(gc, fairGood, histGoods, spanH) {
    const o = { verdict: 'UNKNOWN', scorePct: null, fairPct: null, histPct: null, percentile: null, n: histGoods.length,
      spanH, reliable: histGoods.length >= HIST_MIN_N && spanH >= HIST_MIN_SPAN_H, medianUpsidePct: null, bestUpsidePct: null, reasons: [] };
    if (fairGood != null) o.fairPct = pctOf(gc - fairGood);
    if (histGoods.length) {
      o.percentile = (histGoods.filter(g => g <= gc).length / histGoods.length) * 100;
      if (o.reliable) {
        const med = median(histGoods);
        o.histPct = pctOf(gc - med);
        o.medianUpsidePct = Math.max(0, pctOf(med - gc));
        o.bestUpsidePct = Math.max(0, pctOf(Math.max(...histGoods) - gc));
      }
    }
    const parts = [o.fairPct, o.histPct].filter(v => v != null);
    if (!parts.length) return o;
    o.scorePct = parts.reduce((a, b) => a + b, 0) / parts.length;
    let v = o.scorePct >= NOW_PCT ? 'NOW' : (o.scorePct <= WAIT_PCT ? 'WAIT' : 'NEUTRAL');
    if (o.reliable) {
      if (o.percentile >= 80 && o.scorePct > WAIT_PCT) v = 'NOW';
      else if (o.percentile <= 20 && o.scorePct < NOW_PCT) v = 'WAIT';
    }
    o.verdict = v;
    return o;
  }

  const sgn = x => `${x >= 0 ? '+' : ''}${x.toFixed(1).replace('.', ',')}%`;
  const spanOf = arr => (arr.length ? (Math.max(...arr.map(s => s.t)) - Math.min(...arr.map(s => s.t))) / 36e5 : 0);
  const histOf = (history, id, currentAt) => ((history && history.items && history.items[id]) || []).filter(s => currentAt == null || s.t !== currentAt);

  // Timing de uma oportunidade de Trading (cross | flip-coins | flip-gems).
  //  - cross: o spread atual (netCoinsPerGem de B / coinsPerGem de A) vs o spread normal.
  //  - flip: o preço de compra no nível 1 vs o preço normal do item (menor = melhor para comprar).
  function assessTrade(op, routes, history, { currentAt = null } = {}) {
    const by = {}; for (const r of routes || []) if (r && r.id) by[r.id] = r;
    const a = by[op.buyId], b = by[op.sellId];
    const none = { verdict: 'UNKNOWN', scorePct: null, reasons: [] };
    let gc, fairGood = null, histGoods = [], span = 0, label;
    if (op.kind === 'cross') {
      const ca = metricOf(a, 'gold-to-gem'), rb = metricOf(b, 'gem-to-gold');
      if (!ca || !rb) return none;
      gc = Math.log(rb / ca);
      const fa = fairMetric(a, 'gold-to-gem'), fb = fairMetric(b, 'gem-to-gold');
      if (fa && fb) fairGood = Math.log(fb / fa);
      const bt = new Map(histOf(history, b.id, currentAt).filter(s => num(s.r)).map(s => [s.t, s.r]));
      const pairs = histOf(history, a.id, currentAt).filter(s => num(s.c) && bt.has(s.t));
      histGoods = pairs.map(s => Math.log(bt.get(s.t) / s.c)); span = spanOf(pairs); label = 'spread';
    } else if (op.kind === 'flip-coins' || op.kind === 'flip-gems') {
      const coins = op.kind === 'flip-coins';
      const cur = num(coins ? a && a.buyCoins : a && a.askGems), avg = num(coins ? a && a.coinsAvg7d : a && a.gemsAvg7d);
      if (!cur) return none;
      gc = -Math.log(cur);
      if (avg) fairGood = -Math.log(avg);
      const arr = histOf(history, a.id, currentAt).filter(s => num(coins ? s.bc : s.bg));
      histGoods = arr.map(s => -Math.log(coins ? s.bc : s.bg)); span = spanOf(arr); label = 'preço de compra';
    } else return none;
    const o = judge(gc, fairGood, histGoods, span);
    if (o.fairPct != null) o.reasons.push(`${label} ${sgn(o.fairPct)} vs média 7d`);
    if (o.reliable) o.reasons.push(`${label} ${sgn(o.histPct)} vs mediana do histórico (${o.n} leituras/${Math.round(o.spanH)}h)`);
    else if (o.n) o.reasons.push(`histórico curto (${o.n} leituras)`);
    if (o.verdict === 'WAIT' && o.medianUpsidePct) o.reasons.push(`voltar à mediana melhora ~${sgn(o.medianUpsidePct)}`);
    return o;
  }

  // Anota o plano de Trading com timing: reordena (NOW > normal/sem dado > WAIT) e vira WAIT se tudo estiver abaixo do normal.
  function annotateTrading(plan, routes, history, opts = {}) {
    if (!plan || !plan.opportunities || !plan.opportunities.length) return plan;
    const tRank = { NOW: 2, NEUTRAL: 1, UNKNOWN: 1, WAIT: 0 };
    const confRank = { high: 2, medium: 1, low: 0 };
    const ops = plan.opportunities.map(op => ({ ...op, timing: assessTrade(op, routes, history, opts) }));
    ops.sort((x, y) => (confRank[y.confidence] - confRank[x.confidence]) || (tRank[y.timing.verdict] - tRank[x.timing.verdict]) || (y.roiPct - x.roiPct));
    const best = ops[0];
    const out = { ...plan, opportunities: ops, best };
    if (best.timing.verdict === 'WAIT') {
      out.verdict = 'WAIT';
      out.headline = `ESPERE O TRADING (${best.timing.scorePct != null ? sgn(best.timing.scorePct) : 'abaixo'} vs o normal)`;
      out.summary = `${best.title} · ${best.timing.reasons.join(' · ')}`;
    } else if (best.timing.verdict === 'NOW' && plan.verdict === 'PROFITABLE') {
      out.headline = `${plan.headline} · BOM MOMENTO (${sgn(best.timing.scorePct)})`;
    }
    return out;
  }

  function badge(a) {
    if (!a || a.verdict === 'UNKNOWN' || a.scorePct == null) return '';
    const sg = `${a.scorePct >= 0 ? '+' : ''}${a.scorePct.toFixed(1).replace('.', ',')}%`;
    return a.verdict === 'NOW' ? `▲${sg}` : (a.verdict === 'WAIT' ? `⏳${sg}` : `●${sg}`);
  }

  return { recordSnapshot, assessRoute, adviseTiming, assessTrade, annotateTrading, fairMetric, badge, normalizeHistory, emptyHistory,
    _const: { HIST_MIN_N, HIST_MIN_SPAN_H, NOW_PCT, WAIT_PCT } };
})();
if (typeof module !== 'undefined') module.exports = PK_TIMING;
