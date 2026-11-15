/* PokeIdle Helper — só cliques no DOM, com intervalos conservadores (Termos §5: automação ok, sem
   explorar falhas, sem burlar limites, sem sobrecarregar o servidor). Não chama API nenhuma. */
(() => {
  if (window.__pkBot) return;
  const CFG = {
    ball: 'Ultra Ball', ballMin: 10, ballBuy: 100,
    potMin: 10, potBuy: 100,
    throwGapMs: 1400,        // intervalo mínimo entre arremessos
    buyCooldownMs: 60000,    // não tenta comprar o mesmo item de novo antes disso
    huntEvalMs: 10 * 60000,  // reavalia a cada 10 min (a leitura do Hunt Analyser é instantânea)
    huntGain: 1.10,          // só troca de hunt se a melhor render >10% mais que a atual
    minRatio: 0.5,           // descarta hunts em que (ataque amplificado / dano recebido amplificado) < 0.5
    captureRe: /captur(ou|ad[oa]|a!)|gotcha|foi capturad/i,
    dry: false,
  };
  // configurações editáveis no painel (salvas no navegador); potType 'auto' = repõe as poções em uso
  CFG.potType = 'auto';
  const CFG_KEY = 'pkbot-cfg', EDITABLE = ['ball', 'ballMin', 'ballBuy', 'potType', 'potMin', 'potBuy'];
  try { const o = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; EDITABLE.forEach(k => { if (k in o) CFG[k] = o[k]; }); } catch (e) {}
  const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(Object.fromEntries(EDITABLE.map(k => [k, CFG[k]])))); } catch (e) {} };
  const BALLS = ['Poke Ball', 'Great Ball', 'Super Ball', 'Ultra Ball'];
  const POTIONS = ['Small Potion', 'Great Potion', 'Ultra Potion', 'Hyper Potion', 'Ultimate Potion', 'Golden Potion'];
  const S = JSON.parse(localStorage.getItem('pkbot') || '{}');
  const st = Object.assign({ capture: false, eterna: false, potions: false, hunt: false }, S);
  const save = () => localStorage.setItem('pkbot', JSON.stringify(st));

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const num = t => parseInt(String(t).replace(/[^\d]/g, ''), 10) || 0;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ---------- log + painel ----------
  const logLines = [];
  let logEl;
  const log = (...a) => {
    const l = new Date().toLocaleTimeString() + ' ' + a.join(' ');
    logLines.push(l); if (logLines.length > 60) logLines.shift();
    console.log('[pkbot]', l); if (logEl) logEl.textContent = logLines.slice(-12).join('\n');
  };
  const huntState = { next: 0 };
  const ui = { refresh() {} };
  const UI_KEY = 'pkbot-ui';
  const loadUI = () => { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { return {}; } };
  /* Painel: arraste pelo cabeçalho; "—" (ou duplo clique) minimiza; "×" ou Alt+P esconde/mostra.
     Posição e estado ficam salvos. Fica semitransparente até o mouse chegar perto. */
  function buildPanel() {
    const u = Object.assign({ x: null, y: null, min: true, hidden: false }, loadUI());
    const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(u)); } catch (e) {} };
    const p = document.createElement('div');
    p.style.cssText = 'position:fixed;z-index:99999;background:#1b1f2acc;color:#fff;font:12px/1.35 monospace;border:1px solid #fff3;border-radius:8px;width:290px;box-shadow:0 2px 10px #0008;opacity:.5;transition:opacity .15s;user-select:none';
    p.onmouseenter = () => p.style.opacity = '1'; p.onmouseleave = () => p.style.opacity = '.5';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 8px;cursor:move;touch-action:none';
    const title = document.createElement('span'); title.style.cssText = 'flex:1;font-weight:bold'; head.append(title);
    const btn = (txt, tip, fn) => { const b = document.createElement('button'); b.textContent = txt; b.title = tip; b.style.cssText = 'all:unset;cursor:pointer;padding:0 5px;border-radius:4px;background:#fff2'; b.onpointerdown = e => e.stopPropagation(); b.onclick = fn; head.append(b); return b; };
    btn('—', 'Minimizar/expandir (duplo clique no título)', () => { u.min = !u.min; saveUI(); render(); });
    btn('×', 'Esconder (Alt+P mostra de novo)', () => { u.hidden = true; saveUI(); render(); });

    const body = document.createElement('div'); body.style.cssText = 'padding:2px 8px 8px';
    const mk = (key, label) => {
      const l = document.createElement('label'); l.style.cssText = 'display:block;cursor:pointer';
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!st[key]; c.id = 'pkbot-' + key;
      c.onchange = () => { st[key] = c.checked; save(); log(label, c.checked ? 'ON' : 'OFF'); if (key === 'hunt') huntState.next = 0; ui.refresh(); };
      l.append(c, ' ' + label); body.append(l);
    };
    mk('capture', '1 Captura (para ao capturar)');
    mk('potions', '2 Repor bolas/poções');
    mk('eterna', '3 Captura eterna');
    mk('hunt', '4 Gerenciador de hunt');
    // compras: tipo, mínimo para repor e quantidade por refill (bolas e poções)
    const box = document.createElement('div'); box.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid #fff3;display:grid;grid-template-columns:auto 1fr 52px 52px;gap:3px 5px;align-items:center';
    const fld = (el, key, tip) => { el.title = tip; el.style.cssText = 'width:100%;box-sizing:border-box;background:#0006;color:#fff;border:1px solid #fff3;border-radius:4px;font:11px monospace;padding:1px 2px'; el.value = CFG[key];
      el.onchange = () => { let v = el.value; if (el.type === 'number') { v = Math.max(el.min ? +el.min : 0, Math.min(+el.max || 9999, Math.floor(+v) || 0)); el.value = v; } CFG[key] = v; saveCfg(); log('config', key, '=', v); }; return el; };
    const sel = (opts, key, tip) => { const s = document.createElement('select'); opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.append(o); }); return fld(s, key, tip); };
    const nbr = (key, tip, min, max) => { const i = document.createElement('input'); i.type = 'number'; i.min = min; i.max = max; return fld(i, key, tip); };
    const cell = t => { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'font-size:10px;color:#aab'; return d; };
    box.append(cell(''), cell('item'), cell('mín.'), cell('comprar'),
      cell('Bola'), sel(BALLS.map(b => [b, b]), 'ball', 'Pokébola usada nos arremessos e reposta'), nbr('ballMin', 'Repor quando tiver este tanto ou menos', 0, 9999), nbr('ballBuy', 'Quantidade comprada por refill', 1, 9999),
      cell('Poção'), sel([['auto', 'auto (em uso)'], ...POTIONS.map(p => [p, p])], 'potType', 'auto = repõe as poções que você está usando'), nbr('potMin', 'Repor quando tiver este tanto ou menos', 0, 9999), nbr('potBuy', 'Quantidade comprada por refill', 1, 9999));
    body.append(box);
    logEl = document.createElement('pre'); logEl.style.cssText = 'margin:6px 0 0;white-space:pre-wrap;max-height:150px;overflow:auto;user-select:text;font-size:11px;color:#cfd';
    body.append(logEl); logEl.textContent = logLines.slice(-12).join('\n');
    p.append(head, body);

    const place = () => { // mantém dentro da janela
      const r = p.getBoundingClientRect();
      u.x = Math.min(Math.max(0, u.x ?? 8), Math.max(0, innerWidth - r.width));
      u.y = Math.min(Math.max(0, u.y ?? (innerHeight - r.height - 8)), Math.max(0, innerHeight - r.height));
      p.style.left = u.x + 'px'; p.style.top = u.y + 'px';
    };
    const render = () => {
      p.style.display = u.hidden ? 'none' : ''; body.style.display = u.min ? 'none' : '';
      const on = [['capture', 1], ['potions', 2], ['eterna', 3], ['hunt', 4]].filter(([k]) => st[k]).map(([, n]) => n);
      title.textContent = 'PokeIdle Helper' + (on.length ? ' · ativos: ' + on.join(',') : ' · parado');
      place();
    };
    ui.refresh = () => { for (const k of ['capture', 'potions', 'eterna', 'hunt']) { const c = $('#pkbot-' + k); if (c) c.checked = !!st[k]; } render(); };

    // arrastar
    head.onpointerdown = e => {
      const r = p.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top; head.setPointerCapture(e.pointerId);
      head.onpointermove = ev => { u.x = ev.clientX - dx; u.y = ev.clientY - dy; place(); };
      head.onpointerup = () => { head.onpointermove = head.onpointerup = null; saveUI(); };
    };
    head.ondblclick = () => { u.min = !u.min; saveUI(); render(); };
    addEventListener('keydown', e => { if (e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'p') { u.hidden = !u.hidden; saveUI(); render(); } });
    addEventListener('resize', place);
    document.body.append(p); render();
  }

  // ---------- helpers do jogo ----------
  const modalVisible = () => $$('.modal-caixa').find(m => m.offsetParent);
  async function closeModal() {
    const m = modalVisible(); if (!m) return;
    const x = $$('button', m).find(b => b.innerText.trim() === '×'); x && x.click(); await sleep(400);
  }
  const navBtn = name => $$('button').find(b => new RegExp('^' + name, 'i').test(b.innerText.trim()));
  const gold = () => num((($('#tr-gold') || {}).textContent) || 0);
  const ballQty = name => { const c = $$('#auto-ball-opts .auto-chip').find(b => (b.title || '').startsWith(name)); return c ? num($('.q', c).textContent) : null; };
  const potChips = () => $$('#auto-potion-opts .auto-chip').map(b => ({ name: (b.title || '').split(' — ')[0], qty: num($('.q', b).textContent), on: b.classList.contains('on') }));

  let busy = false; // uma ação de UI por vez
  const lastBuy = {};
  async function buy(category, item, qty) {
    const key = category + item;
    if (Date.now() - (lastBuy[key] || 0) < CFG.buyCooldownMs) return;
    lastBuy[key] = Date.now();
    if (busy) return; busy = true;
    try {
      if (CFG.dry) { log('[dry] compraria', qty, item); return; }
      await closeModal(); navBtn('Market').click(); await sleep(1200);
      const m = $('.modal-caixa[data-modal=market]'); if (!m) return log('Market não abriu');
      const cat = $$('.mk-cat', m).find(b => b.innerText.toLowerCase().includes(category.toLowerCase())); cat && cat.click(); await sleep(600);
      const card = $$('.mk-card', m).find(c => ($('.mk-nome', c) || {}).title === item);
      if (!card) return log('Item não achado no Market:', item);
      const price = num($('.mk-moeda', card).textContent), before = num((($('.mk-tem', card) || {}).dataset || {}).tem);
      if (gold() < price * qty) return log('Ouro insuficiente p/', qty, item, '(precisa', price * qty + ')');
      const btnQ = $$('button', card).find(b => b.innerText.trim() === '×' + qty);
      const input = $('input[type=number]', card);
      if (btnQ) btnQ.click(); else if (input) { input.value = qty; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
      await sleep(300);
      const b = $$('button', card).find(b => /^comprar/i.test(b.innerText.trim())); b.click(); await sleep(1200);
      const after = num((($('.mk-tem', card) || {}).dataset || {}).tem);
      log('Comprou', item, 'tinha', before, '->', after);
    } finally { await closeModal(); busy = false; }
  }

  // ---------- 2: reposição ----------
  const seenPot = {};
  function checkSupplies() {
    const bq = ballQty(CFG.ball);
    if (bq !== null && bq <= CFG.ballMin) buy('Pokebolas', CFG.ball, CFG.ballBuy);
    // poção: tipo escolhido, ou (auto) só as que estão em uso: chip ligado e com estoque já visto nesta sessão
    for (const p of potChips()) {
      seenPot[p.name] = Math.max(seenPot[p.name] || 0, p.qty);
      const alvo = CFG.potType === 'auto' ? (p.on && seenPot[p.name] > 0) : p.name === CFG.potType;
      if (alvo && p.qty <= CFG.potMin) { buy('Poç', p.name, CFG.potBuy); break; }
    }
  }

  // ---------- 1/3: captura ----------
  let lastThrow = 0, captured = false;
  function ensureBall() {
    const b = $$('#caidos-bolas .caidos-bola').find(x => (x.title || '').startsWith(CFG.ball));
    if (b && !b.classList.contains('on')) b.click();
  }
  function captureTick() {
    if (!(st.capture || st.eterna) || busy) return;
    if (st.capture && !st.eterna && captured) { st.capture = false; save(); ui.refresh(); log('Capturou! Modo captura parou.'); captured = false; return; }
    const list = $$('#caidos-lista .caido'); if (!list.length) return;
    if ((ballQty(CFG.ball) || 0) <= 0) return;
    if (Date.now() - lastThrow < CFG.throwGapMs) return;
    ensureBall(); lastThrow = Date.now();
    if (CFG.dry) return log('[dry] arremessaria em', list[0].innerText.replace(/\s+/g, ' '));
    list[0].click();
  }
  // detecta captura em toasts/log do jogo
  function watch() {
    const mo = new MutationObserver(ms => {
      for (const m of ms) for (const n of m.addedNodes) {
        const t = (n.textContent || '').trim(); if (!t) continue;
        if (m.target.id === 'toast' || n.id === 'toast' || (m.target.closest && m.target.closest('#toast'))) log('toast:', t.slice(0, 90));
        if (CFG.captureRe.test(t) && !/derrotado/.test(t)) { captured = true; log('captura detectada:', t.slice(0, 90)); }
        if (m.target.id === 'hud-log') xpEvent(t);
      }
    });
    const t = $('#toast'), h = $('#hud-log');
    t && mo.observe(t, { childList: true, subtree: true, characterData: true });
    h && mo.observe(h, { childList: true });
    mo.observe(document.body, { childList: true }); // toasts criados dinamicamente
  }

  // ---------- 4: hunt (usa o Hunt Analyser do próprio jogo; nada de testar hunt por hunt) ----------
  const xpEvents = []; // log real de xp, só para conferir a estimativa
  function xpEvent(text) {
    const m = text.match(/\+([\d.]+)\s*xp pokemon/i); if (m) xpEvents.push({ t: Date.now(), xp: num(m[1]) });
    if (xpEvents.length > 5000) xpEvents.splice(0, 1000);
  }
  const hover = el => ['mouseover', 'mouseenter'].forEach(ev => el.dispatchEvent(new MouseEvent(ev, { bubbles: true })));
  const readAnalyser = () => {
    const t = (($('#hunt-analyser-corpo') || {}).innerText || '').replace(/\n+/g, '|');
    const g = l => { const m = t.match(new RegExp(l + '\\|([\\d.]+)')); return m ? num(m[1]) : null; };
    // tipos do monstro = os .tipo que vêm antes da 1ª seção (Fraco a / Resiste a)
    const types = [];
    for (const e of $$('#hunt-analyser-corpo .tipo, #hunt-analyser-corpo .ha-sec')) { if (e.classList.contains('ha-sec')) break; types.push(e.textContent.trim().toUpperCase()); }
    return { xp: g('XP pokemon / hora'), gold: g('Ouro / hora'), types };
  };
  // tipo(s) do pokemon que está em campo (card "EM CAMPO")
  const myTypes = () => {
    const h = $$('*').find(e => e.children.length === 0 && /^EM CAMPO$/i.test(e.textContent.trim()));
    const card = h && h.parentElement && h.parentElement.parentElement;
    return card ? [...new Set($$('.tipo', card).map(t => t.textContent.trim().toUpperCase()))] : [];
  };
  const currentHuntName = () => ((($('#hud-hunt') || {}).innerText || '').split('·')[0] || '').trim().toLowerCase();
  const regionBtns = () => $$('button.mapa-reg-bt', modalVisible()).filter(b => !b.classList.contains('mapa-area-travada'));
  async function openMap() {
    await closeModal(); navBtn('Mapa').click(); await sleep(1000);
    const bt = $$('.mapa-modo-bt').find(b => /^mapa$/i.test(b.innerText.trim())); bt && !bt.classList.contains('on') && bt.click(); await sleep(800);
  }
  // lê xp/h de todas as hunts liberadas de todas as regiões abertas
  async function scanHunts() {
    await openMap();
    const regions = regionBtns(), all = {};
    for (const rb of (regions.length ? regions : [null])) {
      if (rb) { rb.click(); await sleep(700); }
      for (const mk of $$('#mapa-tela .marcador').filter(x => x.dataset.travado === '0')) {
        hover(mk); await sleep(120);
        const a = readAnalyser(); if (a.xp != null) all[mk.dataset.slug] = { ...a, nome: (mk.title || '').split(' — ')[0].toLowerCase() };
      }
    }
    return all;
  }
  async function findMarker(slug) {
    let mk = $$('#mapa-tela .marcador').find(x => x.dataset.slug === slug); if (mk) return mk;
    for (const rb of regionBtns()) { rb.click(); await sleep(700); mk = $$('#mapa-tela .marcador').find(x => x.dataset.slug === slug); if (mk) return mk; }
  }
  // troca de hunt respeitando "Em combate — espere Xs sem tomar nem dar dano"
  async function switchTo(slug, nome) {
    for (let i = 0; i < 8; i++) {
      await openMap();
      const mk = await findMarker(slug); if (!mk) return log('marcador não achado:', slug);
      if (CFG.dry) return log('[dry] trocaria p/', slug);
      mk.click(); await sleep(900);
      const toast = (($('#toast') || {}).innerText || '');
      const w = toast.match(/em combate.*?espere\s*([\d.,]+)\s*s/i);
      if (w) { const s = parseFloat(w[1].replace(',', '.')) + 0.6; log('em combate, aguardando', s.toFixed(1) + 's'); await closeModal(); await sleep(s * 1000); continue; }
      await closeModal(); await sleep(500);
      if (currentHuntName().startsWith(nome)) return log('hunt ->', nome);
      log('troca não confirmada (tentativa', i + 1 + ')'); await sleep(2000);
    }
    log('desisti de trocar p/', slug, '- tento no próximo ciclo');
  }
  async function huntTick() {
    if (!st.hunt || busy || Date.now() < huntState.next) return;
    busy = true; huntState.next = Date.now() + CFG.huntEvalMs;
    try {
      const all = await scanHunts(); await closeModal();
      const list = Object.entries(all); if (!list.length) return log('analyser sem dados');
      const cur = currentHuntName(), mine = myTypes();
      // O Analyser ignora o tipo (comprovado: Squirtle e Bulbasaur dão o mesmo xp/h p/ um Charmander).
      // Então: desconta hunts desfavoráveis (ratio<1) e descarta as ruins (ratio<minRatio, ou golpe imune).
      for (const [, v] of list) { v.m = PK_TYPES.matchup(mine, v.types); v.score = v.xp * Math.min(1, v.m.ratio); v.ok = v.m.off > 0 && v.m.ratio >= CFG.minRatio; }
      if (!mine.length) log('aviso: não li o tipo do pokemon em campo; ignorando tipos');
      const curE = list.find(([, v]) => v.nome === cur);
      const pool = list.some(([, v]) => v.ok) ? list.filter(([, v]) => v.ok) : list;
      pool.sort((a, b) => (b[1].score - a[1].score) || (b[1].m.ratio - a[1].m.ratio) || (b[1].gold - a[1].gold) || ((b[1].nome === cur) - (a[1].nome === cur)));
      const [slug, best] = pool[0];
      log('meus tipos:', mine.join('/') || '?', '| melhor:', best.nome, '(' + best.types.join('/') + ')', best.xp + ' xp/h ×' + best.m.ratio.toFixed(2),
        '| atual:', cur, curE ? curE[1].xp + ' xp/h ×' + curE[1].m.ratio.toFixed(2) : '?');
      if (curE && curE[1].ok && best.score <= curE[1].score * CFG.huntGain) return; // sem ganho relevante: fica onde está
      await switchTo(slug, best.nome);
    } finally { await closeModal(); busy = false; }
  }

  // ---------- loop (Worker evita throttle em aba em segundo plano) ----------
  let tickN = 0;
  async function tick() {
    try {
      captureTick(); tickN++;
      if (st.potions && tickN % 5 === 0 && !busy) checkSupplies();
      await huntTick();
    } catch (e) { log('erro:', e.message); }
  }
  function startTimer() {
    try {
      const w = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(1),1000)'], { type: 'text/javascript' })));
      w.onmessage = tick; log('timer: worker');
    } catch (e) { setInterval(tick, 1000); log('timer: setInterval (pode ser limitado em aba oculta)'); }
  }

  window.__pkBot = { CFG, st, log, buy, checkSupplies, captureTick, huntState, xpEvents, potChips, ballQty, scanHunts, switchTo, closeModal };
  const boot = () => { buildPanel(); watch(); startTimer(); log('PokeIdle Helper pronto', CFG.dry ? '(DRY-RUN)' : ''); };
  document.body ? boot() : addEventListener('DOMContentLoaded', boot);
})();
