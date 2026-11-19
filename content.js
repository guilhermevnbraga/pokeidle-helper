/* PokeIdle Helper — só cliques no DOM, com intervalos conservadores (Termos §5: automação ok, sem
   explorar falhas, sem burlar limites, sem sobrecarregar o servidor). Não chama API nenhuma. */
(() => {
  if (window.__pkBot) return;
  const CFG = {
    ball: 'Ultra Ball', ballMin: 10, ballBuy: 100,
    potMin: 10, potBuy: 100,
    throwGapMs: 1400,        // intervalo mínimo entre arremessos
    buyCooldownMs: 60000,    // não tenta comprar o mesmo item de novo antes disso
    ultraCheckMs: 3 * 60000, // no ULTRA, de quanto em quanto tempo sai para atualizar os estoques
    huntEvalMs: 10 * 60000,  // reavalia a cada 10 min (a leitura do Hunt Analyser é instantânea)
    huntRetryMs: 2 * 60000,  // se não houve brecha de 3s fora de combate, tenta de novo mais cedo
    combatWaitMs: 45000,     // tempo máximo esperando a brecha de 3s sem dano p/ ir ao Centro Pokémon
    huntGain: 1.10,          // só troca de hunt se a melhor render >10% mais que a atual
    minRatio: 0.5,           // descarta hunts em que (ataque amplificado / dano recebido amplificado) < 0.5
    captureRe: /captur(ou|ad[oa]|a!|ed)|caught|gotcha/i,
    dry: false,
  };
  // configurações editáveis no painel (salvas no navegador); potType 'auto' = repõe as poções em uso
  CFG.potType = 'auto';
  CFG.fps = 10; // quadros/s do jogo (0 = sem limite); aplicado por fps.js
  CFG.huntFocus = 'balanced'; // balanced | xp | lucro | shiny
  const CFG_KEY = 'pkbot-cfg', EDITABLE = ['ball', 'ballMin', 'ballBuy', 'potType', 'potMin', 'potBuy', 'fps', 'huntFocus'];
  const applyFps = () => document.dispatchEvent(new CustomEvent('pk-fps', { detail: +CFG.fps || 0 }));
  document.addEventListener('pk-stat', e => console.log('[pkbot]', new Date().toLocaleTimeString(), 'cena:', e.detail.fps + ' fps reais (limite ' + (e.detail.limite || 'nenhum') + '),', e.detail.ms + ' ms/s de JS'));
  try { const o = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; EDITABLE.forEach(k => { if (k in o) CFG[k] = o[k]; }); } catch (e) {}
  if (!['balanced', 'xp', 'lucro', 'shiny'].includes(CFG.huntFocus)) CFG.huntFocus = 'balanced';
  const saveCfg = () => { try { localStorage.setItem(CFG_KEY, JSON.stringify(Object.fromEntries(EDITABLE.map(k => [k, CFG[k]])))); } catch (e) {} };
  const BALLS = ['Poke Ball', 'Great Ball', 'Super Ball', 'Ultra Ball'];
  const POTIONS = ['Small Potion', 'Great Potion', 'Ultra Potion', 'Hyper Potion', 'Ultimate Potion', 'Golden Potion'];
  const S = JSON.parse(localStorage.getItem('pkbot') || '{}');
  const st = Object.assign({ capture: false, eterna: false, potions: false, hunt: false, keepalive: false }, S);
  const save = () => localStorage.setItem('pkbot', JSON.stringify(st));

  const _sleepPend = new Map();
  let _sleepSeq = 0, _timerWorker = null;
  const sleep = ms => {
    if (!_timerWorker) return new Promise(r => setTimeout(r, ms));
    return new Promise(r => {
      const id = ++_sleepSeq;
      _sleepPend.set(id, r);
      _timerWorker.postMessage({ id, ms: Math.max(0, ms | 0) });
    });
  };
  const num = t => parseInt(String(t).replace(/[^\d]/g, ''), 10) || 0;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ---------- log + painel ----------
  const logLines = [];
  let logEl, rmtOutEl, rmtBtnEl, ballOutEl, ballBtnEl, ballFocusEl, ballSelEl, huntOutEl, huntBtnEl, huntFocusEl;
  const log = (...a) => {
    const l = new Date().toLocaleTimeString() + ' ' + a.join(' ');
    logLines.push(l); if (logLines.length > 60) logLines.shift();
    console.log('[pkbot]', l); if (logEl) logEl.textContent = logLines.slice(-12).join('\n');
  };
  const HUNT_KEY = 'pkbot-hunt';
  const huntState = { next: 0, scanning: false, last: null };
  try { huntState.last = JSON.parse(localStorage.getItem(HUNT_KEY) || 'null'); } catch (e) {}
  const saveHunt = () => { try { localStorage.setItem(HUNT_KEY, JSON.stringify(huntState.last)); } catch (e) {} };
  const DEX_CACHE_KEY = 'pkbot-dex-cache';
  let dexCache = {};
  try { dexCache = JSON.parse(localStorage.getItem(DEX_CACHE_KEY) || '{}') || {}; } catch (e) { dexCache = {}; }
  const saveDexCache = () => {
    try {
      const keys = Object.keys(dexCache);
      if (keys.length > 600) {
        keys.sort((a, b) => (dexCache[a].ts || 0) - (dexCache[b].ts || 0))
          .slice(0, keys.length - 500)
          .forEach(k => delete dexCache[k]);
      }
      localStorage.setItem(DEX_CACHE_KEY, JSON.stringify(dexCache));
    } catch (e) {}
  };
  const RMT_KEY = 'pkbot-rmt';
  const rmtState = { scanning: false, last: null };
  try { rmtState.last = JSON.parse(localStorage.getItem(RMT_KEY) || 'null'); } catch (e) {}
  const saveRmt = () => { try { localStorage.setItem(RMT_KEY, JSON.stringify(rmtState.last)); } catch (e) {} };
  const BALL_KEY = 'pkbot-ball';
  const ballState = { scanning: false, focus: 'balanced', last: null };
  try {
    const savedBall = JSON.parse(localStorage.getItem(BALL_KEY) || 'null');
    if (savedBall && typeof savedBall === 'object') {
      if (['balanced', 'money', 'rare'].includes(savedBall.focus)) ballState.focus = savedBall.focus;
      if (savedBall.last) ballState.last = savedBall.last;
    }
  } catch (e) {}
  const saveBall = () => { try { localStorage.setItem(BALL_KEY, JSON.stringify({ focus: ballState.focus, last: ballState.last })); } catch (e) {} };
  const ui = { refresh() {} };
  const UI_KEY = 'pkbot-ui';
  const loadUI = () => { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { return {}; } };
  /* Painel: arraste pelo cabeçalho; "—" (ou duplo clique) minimiza; "×" ou Alt+P esconde/mostra.
     Posição e estado ficam salvos. Fica semitransparente até o mouse chegar perto. */
  function buildPanel() {
    const u = Object.assign({ x: null, y: null, min: true, hidden: false }, loadUI());
    const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(u)); } catch (e) {} };
    const p = document.createElement('div');
    p.id = 'pkbot-panel';
    p.style.cssText = 'position:fixed;z-index:2147483647;background:#1b1f2acc;color:#fff;font:12px/1.35 monospace;border:1px solid #fff3;border-radius:8px;width:316px;box-shadow:0 2px 10px #0008;opacity:.5;transition:opacity .15s;user-select:none';
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
      c.onchange = () => { st[key] = c.checked; save(); log(label, c.checked ? 'ON' : 'OFF'); if (key === 'hunt') huntState.next = 0; if (key === 'keepalive') applyKeepAlive(); ui.refresh(); };
      l.append(c, ' ' + label); body.append(l);
    };
    mk('capture', '1 Captura (para ao capturar)');
    mk('potions', '2 Repor bolas/poções');
    mk('eterna', '3 Captura eterna');
    mk('hunt', '4 Gerenciador de hunt');
    mk('keepalive', 'Manter ativo em 2º plano');
    // compras: tipo, mínimo para repor e quantidade por refill (bolas e poções)
    const box = document.createElement('div'); box.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid #fff3;display:grid;grid-template-columns:auto 1fr 52px 52px;gap:3px 5px;align-items:center';
    const fld = (el, key, tip) => { el.title = tip; el.style.cssText = 'width:100%;box-sizing:border-box;background:#0006;color:#fff;border:1px solid #fff3;border-radius:4px;font:11px monospace;padding:1px 2px'; el.value = CFG[key];
      el.onchange = () => { let v = el.value; if (el.type === 'number') { v = Math.max(el.min ? +el.min : 0, Math.min(+el.max || 9999, Math.floor(+v) || 0)); el.value = v; } CFG[key] = v; saveCfg(); log('config', key, '=', v); if (key === 'fps') applyFps(); }; return el; };
    const sel = (opts, key, tip) => { const s = document.createElement('select'); opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.append(o); }); return fld(s, key, tip); };
    const nbr = (key, tip, min, max) => { const i = document.createElement('input'); i.type = 'number'; i.min = min; i.max = max; return fld(i, key, tip); };
    const cell = t => { const d = document.createElement('div'); d.textContent = t; d.style.cssText = 'font-size:10px;color:#aab'; return d; };
    ballSelEl = sel(BALLS.map(b => [b, b]), 'ball', 'Pokébola usada nos arremessos e reposta');
    ballSelEl.id = 'pkbot-ball-sel';
    box.append(cell(''), cell('item'), cell('mín.'), cell('comprar'),
      cell('Bola'), ballSelEl, nbr('ballMin', 'Repor quando tiver este tanto ou menos', 0, 9999), nbr('ballBuy', 'Quantidade comprada por refill', 1, 9999),
      cell('Poção'), sel([['auto', 'auto (em uso)'], ...POTIONS.map(p => [p, p])], 'potType', 'auto = repõe as poções que você está usando'), nbr('potMin', 'Repor quando tiver este tanto ou menos', 0, 9999), nbr('potBuy', 'Quantidade comprada por refill', 1, 9999));
    const fpsSel = sel([[60, '60 (padrão do jogo)'], [30, '30'], [15, '15'], [10, '10 (recomendado)'], [5, '5'], [2, '2'], [0, 'sem limite']], 'fps', 'Quadros por segundo da cena do jogo. Menos quadros = bem menos CPU; a captura continua funcionando. Use "sem limite" se for jogar na mão.');
    fpsSel.style.gridColumn = '2 / 5'; box.append(cell('FPS'), fpsSel); body.append(box);
    // Gerenciador de Hunt v3 (simulação de combate/economia: XP/h real, lucro líquido, abates/h, poções, Outland e Shiny)
    const huntBox = document.createElement('div');
    huntBox.id = 'pkbot-hunt-box';
    huntBox.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid #fff3';
    const huntHead = document.createElement('div');
    huntHead.style.cssText = 'display:flex;align-items:center;gap:4px';
    const huntTit = document.createElement('span');
    huntTit.textContent = 'Gerenciador Hunt';
    huntTit.style.cssText = 'flex:1;font-size:11px;font-weight:bold;color:#8f9';
    huntFocusEl = document.createElement('select');
    huntFocusEl.id = 'pkbot-hunt-focus';
    huntFocusEl.title = 'Foco do Gerenciador de Hunt: Equilibrado (XP + Lucro + Abates/Outland), XP, Lucro/Outland ou Shiny/Caça';
    huntFocusEl.style.cssText = 'background:#0006;color:#fff;border:1px solid #fff3;border-radius:4px;font:10px monospace;padding:1px 2px';
    [['balanced', 'Equilibrado'], ['xp', 'XP'], ['lucro', 'Lucro/Out'], ['shiny', 'Shiny']].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t; huntFocusEl.append(o);
    });
    huntFocusEl.value = CFG.huntFocus;
    huntFocusEl.onchange = () => { CFG.huntFocus = huntFocusEl.value; saveCfg(); huntState.next = 0; log('hunt foco =', CFG.huntFocus); renderHunt(); };
    huntBtnEl = document.createElement('button');
    huntBtnEl.id = 'pkbot-hunt-scan';
    huntBtnEl.textContent = 'Analisar';
    huntBtnEl.title = 'Simula combate e lucro real das hunts liberadas (Kanto, Outland, Johto...) e mostra o Top 4';
    huntBtnEl.style.cssText = 'all:unset;cursor:pointer;padding:1px 6px;border-radius:4px;background:#8f93;border:1px solid #8f96;font-size:10px;color:#fff';
    huntBtnEl.onclick = () => analyzeHunts({ autoSwitch: false });
    huntHead.append(huntTit, huntFocusEl, huntBtnEl);
    huntOutEl = document.createElement('div');
    huntOutEl.id = 'pkbot-hunt-out';
    huntOutEl.style.cssText = 'margin:4px 0 0;font-size:10px;line-height:1.38;color:#dfe;max-height:210px;overflow:auto;user-select:text';
    huntBox.append(huntHead, huntOutEl);
    body.append(huntBox);
    // Analisador Otimizado de Pokébola (hunt atual: NPC + RMT + Shiny + ouro/h + taxa/preço)
    const ballBox = document.createElement('div');
    ballBox.id = 'pkbot-ball-box';
    ballBox.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid #fff3';
    const ballHead = document.createElement('div');
    ballHead.style.cssText = 'display:flex;align-items:center;gap:4px';
    const ballTit = document.createElement('span');
    ballTit.textContent = 'Analisador Pokébola';
    ballTit.style.cssText = 'flex:1;font-size:11px;font-weight:bold;color:#7cf';
    ballFocusEl = document.createElement('select');
    ballFocusEl.id = 'pkbot-ball-focus';
    ballFocusEl.title = 'Foco da recomendação: Equilibrado (lucro + Forte/Shiny), Dinheiro (máx lucro/h) ou Raro/Shiny';
    ballFocusEl.style.cssText = 'background:#0006;color:#fff;border:1px solid #fff3;border-radius:4px;font:10px monospace;padding:1px 2px';
    [['balanced', 'Equilibrado'], ['money', 'Dinheiro'], ['rare', 'Raro/Shiny']].forEach(([v, t]) => {
      const o = document.createElement('option'); o.value = v; o.textContent = t; ballFocusEl.append(o);
    });
    ballFocusEl.value = ballState.focus;
    ballFocusEl.onchange = () => { ballState.focus = ballFocusEl.value; saveBall(); renderBall(); };
    ballBtnEl = document.createElement('button');
    ballBtnEl.id = 'pkbot-ball-scan';
    ballBtnEl.textContent = 'Analisar';
    ballBtnEl.title = 'Lê a hunt atual no Mapa + ficha da espécie na Pokedex + preços RMT e recomenda a melhor Pokébola';
    ballBtnEl.style.cssText = 'all:unset;cursor:pointer;padding:1px 6px;border-radius:4px;background:#7cf3;border:1px solid #7cf6;font-size:10px;color:#fff';
    ballBtnEl.onclick = () => analyzeCurrentHuntBalls();
    ballHead.append(ballTit, ballFocusEl, ballBtnEl);
    ballOutEl = document.createElement('div');
    ballOutEl.id = 'pkbot-ball-out';
    ballOutEl.style.cssText = 'margin:4px 0 0;font-size:10px;line-height:1.38;color:#dfe;max-height:240px;overflow:auto;user-select:text';
    ballBox.append(ballHead, ballOutEl);
    body.append(ballBox);
    // Radar RMT (Ouro -> Gema): passivo ao abrir RMT->Itens ou scan sob demanda
    const rmtBox = document.createElement('div');
    rmtBox.id = 'pkbot-rmt-box';
    rmtBox.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid #fff3';
    const rmtHead = document.createElement('div');
    rmtHead.style.cssText = 'display:flex;align-items:center;gap:6px';
    const rmtTit = document.createElement('span');
    rmtTit.textContent = 'Radar RMT (Ouro→Gema)';
    rmtTit.style.cssText = 'flex:1;font-size:11px;font-weight:bold;color:#fd8';
    rmtBtnEl = document.createElement('button');
    rmtBtnEl.id = 'pkbot-rmt-scan';
    rmtBtnEl.textContent = 'Escanear';
    rmtBtnEl.title = 'Lê books livres dos 8 itens líquidos + Pokémon (Sacrifício, P5, Mega, Shiny) e gera instruções do que comprar e vender';
    rmtBtnEl.style.cssText = 'all:unset;cursor:pointer;padding:1px 6px;border-radius:4px;background:#fd83;border:1px solid #fd86;font-size:10px;color:#fff';
    rmtBtnEl.onclick = () => scanRmt();
    rmtHead.append(rmtTit, rmtBtnEl);
    rmtOutEl = document.createElement('div');
    rmtOutEl.id = 'pkbot-rmt-out';
    rmtOutEl.style.cssText = 'margin:4px 0 0;font-size:10px;line-height:1.38;color:#dfe;max-height:220px;overflow:auto;user-select:text';
    rmtBox.append(rmtHead, rmtOutEl);
    body.append(rmtBox);
    logEl = document.createElement('pre'); logEl.style.cssText = 'margin:6px 0 0;white-space:pre-wrap;max-height:150px;overflow:auto;user-select:text;font-size:11px;color:#cfd';
    body.append(logEl); logEl.textContent = logLines.slice(-12).join('\n');
    p.append(head, body);
    renderHunt();
    renderBall();
    renderRmt();

    const place = () => { // mantém dentro da janela
      const r = p.getBoundingClientRect();
      u.x = Math.min(Math.max(0, u.x ?? 8), Math.max(0, innerWidth - r.width));
      u.y = Math.min(Math.max(0, u.y ?? (innerHeight - r.height - 8)), Math.max(0, innerHeight - r.height));
      p.style.left = u.x + 'px'; p.style.top = u.y + 'px';
    };
    const render = () => {
      p.classList.toggle('pk-oculto', u.hidden); p.style.display = u.hidden ? 'none' : ''; body.style.display = u.min ? 'none' : '';
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
  const modalVisible = () => { const vis = $$('.modal-caixa').filter(m => m.offsetParent); return vis[vis.length - 1] || null; };
  async function closeModal() {
    for (let i = 0; i < 4; i++) {
      const m = modalVisible(); if (!m) return;
      const x = $$('button', m).find(b => b.innerText.trim() === '×') || $('#ficha-fechar', m);
      if (!x) return;
      x.click(); await sleep(320);
    }
  }
  // seletores estruturais (data-modal, classes): funcionam com o jogo em qualquer idioma
  const navBtn = key => $(`button[data-modal="${key}"]`);
  const gold = () => num((($('#tr-gold') || {}).textContent) || 0);
  const ballQty = name => { const c = $$('#auto-ball-opts .auto-chip').find(b => (b.title || '').startsWith(name)); return c ? num($('.q', c).textContent) : null; };
  const potChips = () => $$('#auto-potion-opts .auto-chip').map(b => ({ name: (b.title || '').split(' — ')[0], qty: num($('.q', b).textContent), on: b.classList.contains('on') }));

  // ---------- modos de tela do jogo (Configurações → Desempenho) ----------
  const energyNow = () => { const c = document.documentElement.classList; return c.contains('modo-ultra') ? 'ultra' : c.contains('modo-economia') ? 'economia' : 'normal'; };
  async function leaveUltra() { // o ULTRA esconde menus e bloqueia Market/Mapa: sai por um instante
    if (energyNow() !== 'ultra') return false;
    const b = $('#ultra-sair'); if (!b) return false;
    b.click(); await sleep(1500); return true;
  }
  // Só devolve o ULTRA ao estado em que o usuário o deixou (liga apenas o ULTRA; não mexe no Economia).
  // A extensão nunca escolhe o modo de tela por conta própria.
  async function reenterUltra() {
    if (energyNow() === 'ultra') return;
    await closeModal();
    const btn = $('#btn-config'); if (!btn) return log('botão de configurações não achado');
    btn.click(); await sleep(900);
    const m = modalVisible(), tab = m && $$('button', m).find(b => /desempenho|performance/i.test(b.innerText));
    tab && tab.click(); await sleep(400);
    const u = $('#cfg-ultra'); if (u && !u.classList.contains('on')) { u.click(); await sleep(800); }
    await closeModal();
  }

  let busy = false; // uma ação de UI por vez
  const lastBuy = {}, knownPrice = {};
  // catIdx: posição da categoria no Market (0 = pokebolas, 1 = poções), independente do idioma
  async function buy(catIdx, item, qty) {
    const key = catIdx + item;
    if (busy) return false;
    if (Date.now() - (lastBuy[key] || 0) < CFG.buyCooldownMs) return false;
    const estPrice = knownPrice[key];
    if (estPrice > 0 && gold() < estPrice) {
      lastBuy[key] = Date.now();
      log('Ouro insuficiente p/', item, '(mín.', estPrice + ')');
      return false;
    }
    lastBuy[key] = Date.now();
    busy = true;
    let voltarUltra = false;
    try {
      if (CFG.dry) { log('[dry] compraria', qty, item); return true; }
      voltarUltra = await leaveUltra();
      await closeModal(); const nav = navBtn('market'); if (!nav) { log('botão do Market não encontrado'); return false; } nav.click(); await sleep(1200);
      const m = $('.modal-caixa[data-modal=market]'); if (!m) { log('Market não abriu'); return false; }
      // garante a aba "Comprar" caso o Market tenha ficado em "Vender" (pokemons)
      const tabCompra = $('#mk-modos [data-aba="compra"]', m);
      if (tabCompra && !tabCompra.classList.contains('on')) { tabCompra.click(); await sleep(500); }
      const cat = $$('.mk-cat', m)[catIdx];
      if (cat && !cat.classList.contains('on')) { cat.click(); await sleep(600); }
      const findCard = () => $$('.mk-card', m).find(c => ($('.mk-nome', c) || {}).title === item);
      let card = findCard();
      if (!card) { log('Item não achado no Market:', item); return false; }
      const price = num(($('.mk-moeda', card) || {}).textContent), before = num((($('.mk-tem', card) || {}).dataset || {}).tem);
      if (price > 0) knownPrice[key] = price;
      const buyQty = price > 0 ? Math.min(qty, 9999, Math.floor(gold() / price)) : qty;
      if (buyQty < 1) { log('Ouro insuficiente p/', qty, item, '(precisa', price * qty + ', mín.', price + ')'); return false; }
      if (buyQty < qty) log('Saldo parcial: comprando', buyQty + '/' + qty, item);
      const btnQ = $(`.mk-atalho[data-q="${buyQty}"]`, card);
      const input = $('input[type=number]', card);
      if (btnQ && !btnQ.disabled) btnQ.click();
      else if (input) { input.value = buyQty; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }
      await sleep(300);
      // re-consulta o card: pintarMarket() recria #mk-corpo a cada mudança de ouro/bolas/itens
      card = findCard() || card;
      const freshInput = $('input[type=number]', card);
      if (freshInput && num(freshInput.value) !== buyQty) {
        freshInput.value = buyQty;
        freshInput.dispatchEvent(new Event('input', { bubbles: true }));
        freshInput.dispatchEvent(new Event('change', { bubbles: true }));
        await sleep(150);
      }
      const b = $('.mk-acao', card); if (!b) { log('botão de comprar não encontrado'); return false; }
      if (b.disabled) { log('botão Comprar desabilitado p/', buyQty, item); return false; }
      b.click(); await sleep(1500);
      card = findCard() || card;
      const afterCard = num((($('.mk-tem', card) || {}).dataset || {}).tem);
      const afterHud = catIdx === 0 ? ballQty(item) : (potChips().find(p => p.name === item)?.qty ?? null);
      const after = Math.max(afterCard, afterHud ?? 0);
      log(after > before ? 'Comprou' : 'COMPRA NÃO CONFIRMADA:', buyQty, item, 'tinha', before, '->', after);
      return after > before;
    } catch (e) { log('erro na compra:', e.message); return false; }
    finally { await closeModal(); if (voltarUltra) await reenterUltra(); busy = false; }
  }

  // ---------- 2: reposição ----------
  const seenPot = {};
  // O que precisa ser reposto agora: [[categoria, item, quantidade], ...]
  function supplyNeeds() {
    const needs = [], bq = ballQty(CFG.ball);
    if (bq !== null && bq <= CFG.ballMin) needs.push([0, CFG.ball, CFG.ballBuy]);
    // poção: tipo escolhido, ou (auto) só as que estão em uso: chip ligado e com estoque já visto nesta sessão
    for (const p of potChips()) {
      seenPot[p.name] = Math.max(seenPot[p.name] || 0, p.qty);
      const alvo = CFG.potType === 'auto' ? (p.on && seenPot[p.name] > 0) : p.name === CFG.potType;
      if (alvo && p.qty <= CFG.potMin) { needs.push([1, p.name, CFG.potBuy]); break; }
    }
    return needs;
  }
  async function checkSupplies() { for (const n of supplyNeeds()) await buy(...n); }

  // No ULTRA Economia o HUD (ouro, bolas, poções) congela, então os estoques lidos ficam velhos.
  // Aqui o bot sai do ULTRA de tempos em tempos (ou quando o log mostra muitas poções usadas),
  // deixa o HUD atualizar, repõe o que faltar e volta ao ULTRA.
  let potUsed = 0, lastUltraRefresh = Date.now(), potUsedAtRefresh = 0;
  async function ultraSupplyTick() {
    const due = Date.now() - lastUltraRefresh >= CFG.ultraCheckMs || potUsed - potUsedAtRefresh >= 15;
    if (!due || busy) return;
    lastUltraRefresh = Date.now(); potUsedAtRefresh = potUsed;
    busy = true; let saiu = false;
    try {
      log('ULTRA: saindo por instantes para atualizar os estoques');
      saiu = await leaveUltra(); await sleep(2500);
      const needs = supplyNeeds();
      busy = false; for (const n of needs) await buy(...n); busy = true;
    } catch (e) { log('erro no ULTRA:', e.message); }
    finally { try { if (saiu) await reenterUltra(); } finally { busy = false; } }
  }

  // ---------- 1/3: captura ----------
  let lastThrow = 0, captured = false, lastNoBallLog = 0;
  function ensureBall() {
    const b = $$('#caidos-bolas .caidos-bola').find(x => (x.title || '').startsWith(CFG.ball));
    if (b && !b.classList.contains('on')) b.click();
  }
  function captureTick() {
    if (!(st.capture || st.eterna) || busy) return;
    if (st.capture && !st.eterna && captured) { st.capture = false; save(); ui.refresh(); log('Capturou! Modo captura parou.'); captured = false; return; }
    const now = Date.now();
    // ignora entradas "fantasma" (o jogo às vezes deixa na lista um pokemon que já sumiu do chão)
    const list = $$('#caidos-lista .caido').filter(e => (badSlots[e.dataset.slot] || 0) < now); if (!list.length) return;
    const q = ballQty(CFG.ball);
    if ((q || 0) <= 0) {
      if (now - lastNoBallLog >= 60000) { lastNoBallLog = now; log('captura parada: sem', CFG.ball, '(0) no estoque'); }
      return;
    }
    lastNoBallLog = 0;
    if (now - lastThrow < CFG.throwGapMs) return;
    const pick = list[0], slot = pick.dataset.slot;
    if (slot === lastSlot && q === lastQty) { // mesmo alvo e nenhuma bola gasta desde o último clique
      if (now - lastThrow < 3000) return;     // dá tempo do contador atualizar
      badSlots[slot] = now + 60000; lastSlot = null; return log('alvo', slot, 'não está mais no chão; ignorando por 60s');
    }
    ensureBall(); lastThrow = now; lastSlot = slot; lastQty = q;
    if (CFG.dry) return log('[dry] arremessaria em', pick.innerText.replace(/\s+/g, ' '));
    pick.click();
  }
  const badSlots = {}; let lastSlot = null, lastQty = null;
  // detecta captura em toasts/log do jogo
  function watch() {
    const mo = new MutationObserver(ms => {
      for (const m of ms) for (const n of m.addedNodes) {
        const t = (n.textContent || '').trim(); if (!t) continue;
        if (m.target.id === 'toast' || n.id === 'toast' || (m.target.closest && m.target.closest('#toast'))) log('toast:', t.slice(0, 90));
        if (CFG.captureRe.test(t) && !/derrotado|defeated/i.test(t)) { captured = true; log('captura detectada:', t.slice(0, 90)); }
        if (m.target.id === 'hud-log') { xpEvent(t); if (/poção usada|potion used/i.test(t)) potUsed++; }
      }
    });
    const t = $('#toast'), h = $('#hud-log');
    t && mo.observe(t, { childList: true, subtree: true, characterData: true });
    h && mo.observe(h, { childList: true });
    mo.observe(document.body, { childList: true }); // toasts criados dinamicamente
  }

  // ---------- 4: hunt v3 (simulação real de combate/economia da Wiki + 4 focos + cache Pokedex) ----------
  const xpEvents = []; // log real de xp, só para conferir a estimativa
  function xpEvent(text) {
    const m = text.match(/\+([\d.,]+)\s*(?:xp\s*pokemon|pokemon\s*xp)/i); if (m) xpEvents.push({ t: Date.now(), xp: num(m[1]) });
    if (xpEvents.length > 5000) xpEvents.splice(0, 1000);
  }
  const hover = el => ['mouseover', 'mouseenter'].forEach(ev => el.dispatchEvent(new MouseEvent(ev, { bubbles: true })));
  const readAnalyser = () => {
    // números do analyser em ordem: XP treinador/h, XP pokemon/h, Ouro/h (sem depender do texto dos rótulos)
    const nums = $$('#hunt-analyser-corpo *').filter(e => e.children.length === 0 && /^[\d.,]+$/.test(e.textContent.trim())).map(e => num(e.textContent));
    const g = l => (l === 'xp' ? nums[1] : nums[2]) ?? null;
    const types = [];
    for (const e of $$('#hunt-analyser-corpo .tipo, #hunt-analyser-corpo .ha-sec')) { if (e.classList.contains('ha-sec')) break; types.push(e.textContent.trim().toUpperCase()); }
    return { xp: g('xp'), gold: g('gold'), types };
  };
  // tipo(s) do pokemon em campo: prefere #ativo-card (ordem exata: 1º tipo = Investida), fallback geral
  const myTypes = () => {
    const card = $('#ativo-card');
    if (card) {
      const t = $$('.tipo', card).map(e => e.textContent.trim().toUpperCase()).filter(Boolean);
      if (t.length) return [...new Set(t)];
    }
    const els = $$('.tipo').filter(e => !e.closest('.modal-caixa,#hunt-analyser,#ficha,#caidos,#palco'));
    if (!els.length) return [];
    return [...new Set($$('.tipo', els[0].parentElement).map(t => t.textContent.trim().toUpperCase()))];
  };
  const trainerLevel = () => num((($('#tr-level') || {}).textContent) || 0);
  const currentHuntName = () => PK_HUNT.normalizeHuntName((($('#hud-hunt') || $('#eco-onde') || {}).innerText) || '');
  const inSafari = () => !!($('#palco') && $('#palco').classList.contains('safari-ativo'));
  const inHunt = () => !!($('#palco') && $('#palco').classList.contains('hunt-ativa')) && !inSafari();
  const inCenter = () => [$('#centro-curar'), $('#eco-curar')].some(b => b && !b.classList.contains('hidden'));
  const centerGoBtn = () => energyNow() === 'economia'
    ? { btn: $('#eco-ir-centro'), conta: $('#eco-ir-centro-conta') }
    : { btn: $('#ir-centro'), conta: $('#ir-centro-conta') };
  const centerHealBtn = () => (energyNow() === 'economia' ? $('#eco-curar') : $('#centro-curar'));
  const regionBtns = () => $$('button.mapa-reg-bt', modalVisible()).filter(b => !b.classList.contains('mapa-area-travada'));

  function selectBestOutlandTier() {
    const sel = $('.mapa-outland select') || $('select[id*="outland"]');
    if (!sel) return null;
    const enabled = [...sel.options].filter(o => !o.disabled);
    const bestOpt = enabled[enabled.length - 1];
    if (bestOpt && sel.value !== bestOpt.value) {
      sel.value = bestOpt.value;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return bestOpt ? bestOpt.textContent.trim() : null;
  }

  async function openMap(mode = 'mapa') {
    await closeModal(); const nav = navBtn('mapa'); if (!nav) throw new Error('botão do Mapa não encontrado'); nav.click(); await sleep(900);
    const bts = $$('.mapa-modo-bt');
    const idx = mode === 'lista' ? 1 : 0;
    if (bts[idx] && !bts[idx].classList.contains('on')) { bts[idx].click(); await sleep(500); }
  }

  // Lê perfil completo do Pokémon ativo (stats atuais, IV SPD, base SPD e golpes reais com cache)
  let activeProfileCache = null;
  async function readActivePokemonProfile() {
    const cardEl = $('#ativo-card');
    const card = PK_HUNT.parseActiveCard({
      text: cardEl ? (cardEl.innerText || '') : '',
      types: myTypes(),
    });
    const cacheKey = `${card.name}|${card.level}|${card.hpMax}|${card.types.join('/')}`;
    if (activeProfileCache && activeProfileCache.key === cacheKey && activeProfileCache.profile.atk > 0) {
      return activeProfileCache.profile;
    }

    let sheet = { hpMax: card.hpMax, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0, ivSpd: 16, baseSpd: 75 };
    let attacks = null;
    const dexKey = card.name ? normTxt(card.name) : '';
    if (dexKey && dexCache[dexKey] && Array.isArray(dexCache[dexKey].attacks) && dexCache[dexKey].attacks.length) {
      attacks = dexCache[dexKey].attacks;
    }

    const infoBtn = $('#time-corpo .pl-ficha');
    if (infoBtn) {
      await closeModal();
      infoBtn.click();
      const box = await waitForSelector('.caixa-ficha', () => document, 1500);
      if (box) {
        await sleep(180);
        const statLines = $$('.fi-stat', box).map(e => (e.textContent || '').replace(/\s+/g, ' ').trim());
        sheet = PK_HUNT.parseActiveSheet(statLines, box.innerText || '');
        // Se ainda não temos os golpes desta espécie em cache, abre a ficha da espécie ali mesmo
        if (!attacks) {
          const verEsp = $$('button', box).find(b => /esp[eé]cie|species/i.test(b.textContent || ''));
          if (verEsp) {
            verEsp.click();
            const hasTable = await waitForSelector('#ficha-corpo .fi-tabela', () => document, 1800);
            if (hasTable) {
              await sleep(150);
              const parsed = parsePokedexSheetBody($('#ficha-corpo'), card.name);
              if (parsed.attacks && parsed.attacks.length) attacks = parsed.attacks;
              if (dexKey) {
                dexCache[dexKey] = { ...parsed, ts: Date.now() };
                saveDexCache();
              }
            }
          }
        }
      }
      await closeModal();
    }

    const profile = {
      name: card.name || 'Ativo',
      level: card.level || Math.max(1, trainerLevel()),
      types: card.types.length ? card.types : myTypes(),
      hpMax: sheet.hpMax || card.hpMax || 0,
      atk: sheet.atk,
      def: sheet.def,
      spAtk: sheet.spAtk,
      spDef: sheet.spDef,
      baseSpd: sheet.baseSpd,
      ivSpd: sheet.ivSpd,
      attacks,
    };
    activeProfileCache = { key: cacheKey, profile };
    return profile;
  }

  function readAutoContext(hpMax) {
    const pChips = $$('#auto-potion-opts .auto-chip').map(b => ({
      title: (b.title || '').split(' — ')[0],
      stock: num(($('.q', b) || b).textContent),
      on: b.classList.contains('on'),
    }));
    const bChips = $$('#auto-ball-opts .auto-chip').map(b => ({
      title: (b.title || '').split(' — ')[0],
      stock: num(($('.q', b) || b).textContent),
      on: b.classList.contains('on'),
    }));
    const vipBallOn = $$('#auto-corpo input[type="checkbox"]').slice(0, 2).some(c => c.checked);
    const capturing = !!(st.capture || st.eterna || vipBallOn);
    const potion = PK_HUNT.resolvePotion({ activeChips: pChips, hpMax, preferredName: CFG.potType });
    const ball = PK_HUNT.resolveBall({ activeChips: bChips, cfgBall: CFG.ball, capturing });
    const trLv = trainerLevel();
    const outlandTier = PK_HUNT.bestOutlandTierForLevel(trLv);
    return { potion, ball, capturing, trLv, outlandTier };
  }

  // Lê todas as hunts liberadas pelo modo Lista (~2s), pré-filtra top candidatas, lê Analyser e Pokedex (com cache!)
  async function scanHunts({ player = null, focus = CFG.huntFocus, curName = '', autoCtx = null } = {}) {
    await closeModal();
    const nav = navBtn('mapa');
    if (!nav) throw new Error('botão do Mapa não encontrado');
    nav.click();
    await sleep(900);

    const modoBts = $$('.mapa-modo-bt');
    const wasMapMode = !!(modoBts[0] && modoBts[0].classList.contains('on'));
    if (modoBts[1] && !modoBts[1].classList.contains('on')) {
      modoBts[1].click();
      await sleep(450);
    }

    const regions = regionBtns();
    const all = {};
    const byRegion = new Map();

    // Estágio 1: coleta rápida no modo Lista de todas as regiões liberadas
    for (const rb of (regions.length ? regions : [null])) {
      const regId = rb ? (rb.dataset.regiao || '') : '';
      if (rb) { rb.click(); await sleep(420); }
      if (regId === 'outland') { selectBestOutlandTier(); await sleep(150); }
      const rows = $$('#mapa-lista .ml-linha, #mapa-lista [data-slug]');
      for (const r of rows) {
        const travado = r.dataset.travado === '1' || r.getAttribute('aria-disabled') === 'true'
          || r.classList.contains('travada') || r.classList.contains('ml-travada');
        if (travado) continue;
        const slug = r.dataset.slug;
        if (!slug) continue;
        const nomeRaw = ($('.ml-nome', r)?.textContent || r.textContent || slug).trim();
        const nome = PK_HUNT.normalizeHuntName(nomeRaw);
        const level = PK_HUNT.parseIntStrict($('.ml-nv', r)?.textContent || '');
        const types = $$('.tipo', r).map(t => t.textContent.trim().toUpperCase()).filter(Boolean);
        const active = r.classList.contains('on') || r.classList.contains('ativa');
        const cached = dexCache[normTxt(nome)] || null;
        all[slug] = {
          slug,
          nome,
          displayName: nomeRaw,
          regiao: regId,
          isOutland: regId === 'outland',
          level,
          types,
          active,
          xp: null,
          gold: null,
          ...(cached ? {
            baseStats: cached.baseStats,
            baseNpcPrice: cached.baseNpcPrice,
            captureLevel: cached.captureLevel,
            shinyChance: cached.shinyChance,
            canShiny: regId === 'outland' ? false : (cached.shinyChance > 0 ? true : undefined),
            balls: cached.balls,
            stoneProbSum: cached.stoneProbSum,
          } : {}),
        };
        if (!byRegion.has(regId)) byRegion.set(regId, []);
        byRegion.get(regId).push(slug);
      }
    }

    // Estágio 2: seleciona candidatas promissoras (+ atual) e lê Hunt Analyser real (com boosts da conta!)
    const activeEntry = Object.entries(all).find(([, v]) => v.active);
    const curSlug = activeEntry ? activeEntry[0] : null;
    const candSlugs = player
      ? PK_HUNT.selectCandidatesForDetail({
          hunts: all,
          player,
          focus,
          potion: autoCtx?.potion,
          ball: autoCtx?.ball,
          outlandMult: autoCtx?.outlandTier?.mult || 1,
          capturing: !!autoCtx?.capturing,
          curSlug,
          curName,
          maxCandidates: 16,
        })
      : Object.keys(all).slice(0, 20);
    const candSet = new Set(candSlugs);

    for (const rb of (regions.length ? regions : [null])) {
      const regId = rb ? (rb.dataset.regiao || '') : '';
      const regSlugs = (byRegion.get(regId) || []).filter(s => candSet.has(s));
      if (!regSlugs.length) continue;
      if (rb) { rb.click(); await sleep(380); }
      for (const slug of regSlugs) {
        const row = $(`#mapa-lista [data-slug="${CSS.escape(slug)}"]`);
        if (!row) continue;
        hover(row);
        await sleep(95);
        const a = readAnalyser();
        if (a.xp != null) all[slug].xp = a.xp;
        if (a.gold != null) all[slug].gold = a.gold;
        if (!all[slug].types.length && a.types.length) all[slug].types = a.types;
      }
    }

    // Restaura modo Mapa se o usuário estava nele antes
    const restoreBts = $$('.mapa-modo-bt');
    if (wasMapMode && restoreBts[0] && !restoreBts[0].classList.contains('on')) {
      restoreBts[0].click();
      await sleep(250);
    }
    await closeModal();

    // Estágio 3: enriquece na Pokedex (1 única abertura, em lote) apenas candidatas ausentes do cache permanente
    const missingNames = [];
    const seenMissing = new Set();
    for (const slug of candSlugs) {
      const h = all[slug];
      if (!h || h.baseStats) continue;
      const k = normTxt(h.nome);
      if (seenMissing.has(k)) continue;
      seenMissing.add(k);
      missingNames.push({ key: k, query: h.displayName || h.nome });
    }
    if (missingNames.length) {
      const fetched = await batchReadPokedexSpecies(missingNames);
      for (const slug of candSlugs) {
        const h = all[slug];
        const k = normTxt(h.nome);
        const info = fetched[k] || dexCache[k];
        if (info) {
          h.baseStats = info.baseStats;
          h.baseNpcPrice = info.baseNpcPrice;
          h.captureLevel = info.captureLevel;
          h.shinyChance = info.shinyChance;
          h.canShiny = h.isOutland ? false : (info.shinyChance > 0 ? true : undefined);
          h.balls = info.balls;
          h.stoneProbSum = info.stoneProbSum;
        }
      }
    }

    // Retorna apenas o conjunto detalhado (ou tudo se vazio) para decisão exata
    const detailed = {};
    for (const slug of candSlugs) {
      if (all[slug]) detailed[slug] = all[slug];
    }
    return { all, detailed, curSlug };
  }

  async function findMarker(slug, regiao = '') {
    if (regiao) {
      const rb = regionBtns().find(b => b.dataset.regiao === regiao);
      if (rb) {
        if (!rb.classList.contains('on')) { rb.click(); await sleep(600); }
        if (regiao === 'outland') { selectBestOutlandTier(); await sleep(200); }
      }
    }
    let mk = $$('#mapa-tela .marcador').find(x => x.dataset.slug === slug); if (mk) return mk;
    for (const rb of regionBtns()) {
      rb.click(); await sleep(600);
      if (rb.dataset.regiao === 'outland') { selectBestOutlandTier(); await sleep(200); }
      mk = $$('#mapa-tela .marcador').find(x => x.dataset.slug === slug);
      if (mk) return mk;
    }
  }
  // Sai da hunt respeitando o cooldown de 3s sem tomar/dar dano (nunca clica em "Desistir do Combate"),
  // vai ao Centro Pokémon e cura a equipe antes de entrar na nova hunt.
  async function goToCenterAndHeal({ checkStop = () => false } = {}) {
    await closeModal();
    if (!inCenter()) {
      if (!inHunt()) return { ok: false, reason: 'not-in-hunt' };
      const deadline = Date.now() + CFG.combatWaitMs;
      let loggedWait = false;
      while (Date.now() < deadline) {
        if (checkStop()) return { ok: false, reason: 'cancelled' };
        if (inCenter()) break;
        const { btn, conta } = centerGoBtn();
        const ready = PK_HUNT.isCenterButtonReady({
          exists: !!btn,
          hidden: !btn || !!btn.closest('.hidden'),
          disabled: !btn || btn.disabled,
          countdownText: conta ? conta.textContent : '',
        });
        if (ready) {
          log('saindo da hunt -> Centro Pokemon');
          btn.click();
          const confirmUntil = Date.now() + 1600;
          while (Date.now() < confirmUntil) {
            if (inCenter()) break;
            await sleep(150);
          }
          if (inCenter()) break;
          loggedWait = false; // outro mob atacou no instante do clique; aguarda próxima brecha
        } else if (!loggedWait) {
          const sec = PK_HUNT.parseCenterCountdownSec(conta ? conta.textContent : '');
          log('em combate, aguardando 3s sem dano p/ ir ao Centro Pokemon' + (sec > 0 ? ' (' + sec.toFixed(1) + 's)' : ''));
          loggedWait = true;
        }
        await sleep(100);
      }
      if (!inCenter()) {
        log('sem brecha de 3s fora de combate p/ ir ao Centro Pokemon; tento novamente em breve');
        return { ok: false, reason: 'combat-timeout' };
      }
    }
    const heal = centerHealBtn();
    if (heal && !heal.classList.contains('hidden')) {
      log('curando equipe no Centro Pokemon');
      heal.click();
      await sleep(900);
    }
    return { ok: true };
  }
  // Entra na hunt alvo estando fora de combate (no Centro Pokémon), respeitando eventual cooldown de porta
  async function enterHunt(slug, nome, { checkStop = () => false, regiao = '' } = {}) {
    const targetName = PK_HUNT.normalizeHuntName(nome || slug);
    for (let i = 0; i < 5; i++) {
      if (checkStop()) return false;
      await openMap('mapa');
      const mk = await findMarker(slug, regiao); if (!mk) { log('marcador não achado:', slug); return false; }
      mk.click(); await sleep(900);
      const toast = (($('#toast') || {}).innerText || '');
      const w = PK_HUNT.parseWaitToast(toast);
      if (w) {
        const s = w.sec + 0.6;
        log(w.kind === 'combat' ? 'em combate, aguardando' : 'cooldown de troca, aguardando', s.toFixed(1) + 's');
        await closeModal(); await sleep(s * 1000); continue;
      }
      await closeModal(); await sleep(500);
      if (inHunt() && PK_HUNT.isSameHunt({ inHunt: true, curSlug: null, curName: currentHuntName(), targetSlug: slug, targetName })) {
        log('hunt ->', targetName);
        return true;
      }
      log('entrada na hunt não confirmada (tentativa', i + 1 + ')'); await sleep(1500);
    }
    log('desisti de entrar em', slug, '- tento no próximo ciclo');
    return false;
  }
  // Troca de hunt com segurança: nunca troca p/ o mapa atual; volta ao Centro Pokémon, cura e entra no novo mapa.
  async function switchTo(slug, nome, curSlug = null, opts = {}) {
    const targetName = PK_HUNT.normalizeHuntName(nome || slug);
    if (PK_HUNT.isSameHunt({ inHunt: inHunt(), curSlug, curName: currentHuntName(), targetSlug: slug, targetName })) {
      log('já estou na hunt', targetName, '- sem troca');
      return true;
    }
    if (CFG.dry) { log('[dry] iria ao Centro Pokemon, curaria e trocaria p/', slug); return true; }
    const cp = await goToCenterAndHeal(opts);
    if (!cp.ok) {
      if (cp.reason === 'combat-timeout') huntState.next = Date.now() + Math.min(CFG.huntEvalMs, CFG.huntRetryMs);
      return false;
    }
    return enterHunt(slug, targetName, opts);
  }

  function renderHunt(statusMsg) {
    if (!huntOutEl || typeof PK_HUNT === 'undefined') return;
    if (huntBtnEl) huntBtnEl.textContent = huntState.scanning ? 'Lendo...' : 'Analisar';
    if (huntFocusEl && huntFocusEl.value !== CFG.huntFocus) huntFocusEl.value = CFG.huntFocus;
    huntOutEl.textContent = '';
    const mk = (tag, css, txt) => {
      const el = document.createElement(tag);
      if (css) el.style.cssText = css;
      if (txt != null) el.textContent = txt;
      return el;
    };
    if (statusMsg) {
      huntOutEl.append(mk('div', 'color:#fd8', statusMsg));
      return;
    }
    const last = huntState.last;
    if (!last || !last.detailed || !Object.keys(last.detailed).length) {
      huntOutEl.append(mk('div', 'color:#9ab', 'Clique "Analisar" ou ative o modo 4 para simular as melhores hunts (XP/h, lucro, abates e poções).'));
      return;
    }
    // Recalcula instantaneamente ao trocar o seletor de foco!
    const dec = PK_HUNT.pickBestHunt({
      hunts: last.detailed,
      player: last.player,
      focus: CFG.huntFocus,
      potion: last.potion,
      ball: last.ball,
      outlandMult: last.outlandMult || 1,
      capturing: !!last.capturing,
      curSlug: last.curSlug,
      curName: last.curName,
      inHunt: true,
      huntGain: CFG.huntGain,
    });
    const top = (dec.ranked || []).slice(0, 4);
    const ageMin = last.ts ? Math.max(0, Math.round((Date.now() - last.ts) / 60000)) : 0;
    const pl = last.player || {};
    huntOutEl.append(mk('div', 'color:#9be;font-size:9px;margin-bottom:2px',
      `${pl.name || 'Ativo'} Nv${pl.level || '?'} (${(pl.types || []).join('/') || '?'}) · ${PK_HUNT.FOCUS_LABELS[CFG.huntFocus] || CFG.huntFocus} · há ${ageMin}m`));

    if (dec.current && top.every(x => x.slug !== dec.current.slug)) {
      const cs = dec.current.sim || {};
      huntOutEl.append(mk('div', 'color:#faa;font-size:9px;margin-bottom:2px',
        `Atual: ${dec.current.displayName || dec.current.nome} Nv${dec.current.level || '?'} · ${PK_HUNT.formatCompact(cs.xpH)} xp/h · ${PK_HUNT.formatCompact(cs.netGoldH)}/h · ${cs.kph || 0}/h · ${Math.round(cs.potionsH || 0)} pot/h`));
    }

    const fmt = PK_HUNT.formatCompact;
    for (let i = 0; i < top.length; i++) {
      const h = top[i];
      const s = h.sim || {};
      const isCur = !!(last.curSlug && h.slug === last.curSlug);
      const row = mk('div', `display:flex;align-items:center;gap:4px;padding:2px 0;${i ? 'border-top:1px solid #fff1;' : ''}`);
      const info = mk('div', 'flex:1;min-width:0');
      const badge = h.isOutland ? ' [OUT]' : '';
      const curTag = isCur ? ' ★' : '';
      info.append(mk('div', `color:${i === 0 ? '#8f9' : '#dfe'};font-weight:${i === 0 ? 'bold' : 'normal'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`,
        `${i + 1}. ${h.displayName || h.nome} Nv${h.level || '?'}${badge}${curTag}`));
      const potTxt = (s.potionsH || 0) >= 1 ? ` · ${Math.round(s.potionsH)}pot` : '';
      info.append(mk('div', 'color:#9ab;font-size:9px',
        `${fmt(s.xpH)} xp · ${fmt(s.netGoldH)} líq · ${s.kph || 0}/h${potTxt}`));
      row.append(info);
      if (!isCur) {
        const go = mk('button', 'all:unset;cursor:pointer;padding:1px 5px;border-radius:3px;background:#8f93;border:1px solid #8f96;font-size:9px;color:#fff;flex-shrink:0', 'Ir');
        go.title = `Ir para ${h.displayName || h.nome} (passa no Centro Pokémon e cura)`;
        go.onclick = async () => {
          if (busy) { log('aguarde a ação atual terminar'); return; }
          busy = true;
          let voltarUltra = false;
          try {
            voltarUltra = await leaveUltra();
            const ok = await switchTo(h.slug, h.nome, last.curSlug, { regiao: h.regiao });
            if (ok && huntState.last) { huntState.last.curSlug = h.slug; huntState.last.curName = h.nome; saveHunt(); renderHunt(); }
          } finally { await closeModal(); if (voltarUltra) await reenterUltra(); busy = false; }
        };
        row.append(go);
      }
      huntOutEl.append(row);
    }
  }

  async function analyzeHunts({ autoSwitch = false } = {}) {
    if (huntState.scanning) return null;
    if (busy) { if (!autoSwitch) renderHunt('Aguarde a ação atual terminar e tente de novo.'); return null; }
    huntState.scanning = true; busy = true;
    renderHunt('Simulando hunts (ativo + Mapa + Pokedex)...');
    let voltarUltra = false;
    try {
      voltarUltra = await leaveUltra();
      const onHunt = inHunt(), onCenter = inCenter();
      if (!onHunt && !onCenter) {
        const msg = 'Fora de hunt/Centro (Safari/Boss/Casa) — aguardando.';
        if (autoSwitch) log('hunt:', msg); else renderHunt(msg);
        return null;
      }
      const player = await readActivePokemonProfile();
      const autoCtx = readAutoContext(player.hpMax);
      const cur = currentHuntName();
      const { detailed, curSlug } = await scanHunts({
        player,
        focus: CFG.huntFocus,
        curName: cur,
        autoCtx,
      });
      if (!Object.keys(detailed).length) {
        huntState.next = Date.now() + 30000;
        renderHunt('Nenhuma hunt liberada encontrada (tento em 30s).');
        return null;
      }
      const effCurSlug = onHunt ? curSlug : null;
      const dec = PK_HUNT.pickBestHunt({
        hunts: detailed,
        player,
        focus: CFG.huntFocus,
        potion: autoCtx.potion,
        ball: autoCtx.ball,
        outlandMult: autoCtx.outlandTier.mult,
        capturing: autoCtx.capturing,
        curSlug: effCurSlug,
        curName: cur,
        inHunt: onHunt,
        huntGain: CFG.huntGain,
      });
      huntState.last = {
        ts: Date.now(),
        player,
        potion: autoCtx.potion,
        ball: autoCtx.ball,
        capturing: autoCtx.capturing,
        outlandMult: autoCtx.outlandTier.mult,
        curSlug: effCurSlug,
        curName: cur,
        detailed,
      };
      saveHunt();
      const { best, current } = dec;
      const fmt = PK_HUNT.formatCompact;
      if (best) {
        const bs = best.sim || {}, cs = current?.sim || {};
        log(`hunt[${CFG.huntFocus}] ${player.name} Nv${player.level} | melhor: ${best.displayName || best.nome} Nv${best.level} (${fmt(bs.xpH)} xp/h, ${fmt(bs.netGoldH)} líq/h, ${bs.kph}/h, ${Math.round(bs.potionsH || 0)} pot/h)`
          + ` | atual: ${onCenter ? 'Centro' : (cur || '?')}${current ? ` (${fmt(cs.xpH)} xp/h, ${fmt(cs.netGoldH)} líq/h, ${cs.kph}/h)` : ''}`);
      }
      renderHunt();
      if (autoSwitch && dec.action === 'switch' && best) {
        const ok = await switchTo(best.slug, best.nome, effCurSlug, { checkStop: () => !st.hunt, regiao: best.regiao });
        if (ok && huntState.last) { huntState.last.curSlug = best.slug; huntState.last.curName = best.nome; saveHunt(); renderHunt(); }
      }
      return dec;
    } catch (e) {
      log('hunt erro:', e.message);
      renderHunt('Erro ao analisar hunts: ' + e.message);
      return null;
    } finally {
      await closeModal();
      if (voltarUltra) await reenterUltra();
      huntState.scanning = false;
      busy = false;
      if (huntBtnEl) huntBtnEl.textContent = 'Analisar';
    }
  }

  async function huntTick() {
    if (!st.hunt || busy || Date.now() < huntState.next) return;
    huntState.next = Date.now() + CFG.huntEvalMs;
    await analyzeHunts({ autoSwitch: true });
  }

  // ---------- 5: Radar RMT (Ouro -> Gema, passivo + scan sob demanda com plano de ação) ----------
  let lastRmtGold = -1;
  let rmtRankingOpen = false;
  function renderRmt(statusMsg) {
    if (!rmtOutEl || typeof PK_RMT === 'undefined') return;
    if (rmtBtnEl) rmtBtnEl.textContent = rmtState.scanning ? 'Lendo...' : 'Escanear';
    rmtOutEl.textContent = '';
    const mk = (tag, css, txt) => {
      const el = document.createElement(tag);
      if (css) el.style.cssText = css;
      if (txt != null) el.textContent = txt;
      return el;
    };
    if (statusMsg) {
      rmtOutEl.append(mk('div', 'color:#fd8', statusMsg));
      return;
    }
    const d = rmtState.last;
    if (!d || !d.routes || !d.routes.length) {
      rmtOutEl.append(mk('div', 'color:#aab', 'Clique em Escanear para receber instruções do que comprar e vender (itens + Pokémon).'));
      return;
    }
    const curGold = gold();
    lastRmtGold = curGold;
    const plan = PK_RMT.buildActionPlan({ routes: d.routes, gold: curGold, source: d.source });
    if (!plan) {
      rmtOutEl.append(mk('div', 'color:#aab', 'Sem rotas válidas no último scan.'));
      return;
    }
    const ageMin = Math.max(0, Math.round((Date.now() - d.at) / 60000));
    const tag = d.source === 'book' ? 'books livres' : '~estimado (clique Escanear)';

    const renderStepCard = (title, inst, accent, bg) => {
      const box = mk('div', `margin-top:4px;padding:4px 6px;border-radius:5px;background:${bg};border:1px solid ${accent}55`);
      box.append(mk('div', `font-weight:bold;color:${accent};margin-bottom:2px`, title));
      const row = (lbl, val, valCss = 'color:#fff') => {
        const line = mk('div', 'margin-top:1px;word-break:break-word');
        line.append(mk('span', 'color:#aab;font-weight:bold', lbl + ' '), mk('span', valCss, val));
        return line;
      };
      box.append(row('ONDE:', inst.where, 'color:#bde'));
      box.append(row('COMPRAR:', inst.buyText, 'color:#fff'));
      box.append(row('VENDER:', inst.sellText, 'color:#bfa'));
      if (inst.note) box.append(mk('div', 'margin-top:2px;color:#fc9;font-size:9px', '⚠ ' + inst.note));
      return box;
    };

    const headColor = plan.verdict === 'BUY_NOW' ? '#6f9' : '#fd8';
    rmtOutEl.append(mk('div', `font-weight:bold;color:${headColor}`, plan.headline));
    rmtOutEl.append(mk('div', 'color:#bcd;font-size:9.5px', `${plan.summary} · ${tag}, ${ageMin}m`));

    if (plan.verdict === 'BUY_NOW' && plan.primary) {
      rmtOutEl.append(renderStepCard(`PLANO COM SEUS ${PK_RMT.formatCoins(curGold)}`, plan.primary, '#6f9', '#16332288'));
      if (plan.goal) {
        rmtOutEl.append(mk('div', 'margin-top:3px;color:#aab;font-size:9px',
          `Topo absoluto: ${plan.goal.label} (${PK_RMT.formatCoins(plan.goal.coinsPerGem)}/G · falta ${PK_RMT.formatCoins(plan.goal.missingCoins)})`));
      }
    } else if (plan.verdict === 'SAVE_OR_BUY') {
      if (plan.primary) {
        rmtOutEl.append(renderStepCard(
          `META RECOMENDADA (falta +${PK_RMT.formatCoins(plan.primary.missingCoins)})`,
          plan.primary, '#fd8', '#332b1488'
        ));
      }
      if (plan.bestOverall) {
        rmtOutEl.append(mk('div', 'margin-top:3px;color:#aab;font-size:9px',
          `Topo absoluto: ${plan.bestOverall.label} (${PK_RMT.formatCoins(plan.bestOverall.coinsPerGem)}/G · falta +${PK_RMT.formatCoins(plan.bestOverall.missingCoins)})`));
      }
      if (plan.fallback) {
        rmtOutEl.append(renderStepCard(
          `SE QUISER CONVERTER JÁ (${PK_RMT.formatCoins(curGold)} · -${plan.lossPct}% gemas)`,
          plan.fallback, '#7cf', '#14263688'
        ));
      }
    } else if (plan.verdict === 'SAVE_ONLY') {
      if (plan.fallback) {
        rmtOutEl.append(renderStepCard(
          `1ª ENTRADA (falta +${PK_RMT.formatCoins(plan.fallback.missingCoins)})`,
          plan.fallback, '#7cf', '#14263688'
        ));
      }
      if (plan.primary) {
        rmtOutEl.append(renderStepCard(
          `META ÓTIMA (falta +${PK_RMT.formatCoins(plan.primary.missingCoins)})`,
          plan.primary, '#fd8', '#332b1488'
        ));
      }
    }

    // Ranking completo dobrável (itens + categorias de Pokémon)
    const det = document.createElement('details');
    det.open = rmtRankingOpen;
    det.style.cssText = 'margin-top:4px;border-top:1px solid #fff2;padding-top:3px';
    det.ontoggle = () => { rmtRankingOpen = det.open; };
    const sum = mk('summary', 'cursor:pointer;color:#aab;font-size:9.5px', `Ver ranking completo (${plan.ranked.length} rotas)`);
    det.append(sum);
    for (const r of plan.ranked) {
      const ok = curGold >= r.buyCoins ? '✓' : '○';
      const extra = r.kind === 'pokemon' && r.bestPoke?.name ? ` [${r.bestPoke.name}]` : '';
      const warn = r.warnings && r.warnings.length ? ' !' + r.warnings[0] : '';
      det.append(mk('div', `color:${ok === '✓' ? '#cfd' : '#9aa'};font-size:9.5px;margin-top:1px`,
        `${ok} ${r.label}${extra}: ${PK_RMT.formatCoins(r.coinsPerGem)}/G (${PK_RMT.formatCoins(r.buyCoins)}→${r.sellGems}G)${warn}`));
    }
    rmtOutEl.append(det);
  }

  // Leitura passiva (0 cliques): só lê .cmi-linha já visíveis quando o usuário abre RMT → Itens
  let lastPassiveRmt = 0;
  function readRmtListPassive() {
    if (typeof PK_RMT === 'undefined' || rmtState.scanning) return;
    const now = Date.now();
    if (now - lastPassiveRmt < 3000) return;
    // Não sobrescrever um scan completo de book feito nos últimos 2 min
    if (rmtState.last && rmtState.last.source === 'book' && now - rmtState.last.at < 120000) return;
    const m = $('.modal-caixa[data-modal="community"]');
    if (!m || !m.offsetParent) return;
    const rows = $$('.cmi-linha', m);
    if (!rows.length) return;
    lastPassiveRmt = now;
    const curGold = gold();
    const routes = [];
    for (const row of rows) {
      const name = ($('.cmi-nome b', row) || {}).textContent?.trim();
      const item = PK_RMT.matchLiquidItem(name);
      if (!item) continue;
      const prices = $$('.cmi-precos .cmi-de', row);
      if (prices.length < 2) continue;
      const cVal = prices[0].classList.contains('nada') ? null : PK_RMT.parseCompactNum(prices[0].textContent);
      const gVal = prices[1].classList.contains('nada') ? null : PK_RMT.parseCompactNum(prices[1].textContent);
      if (!cVal || !gVal) continue;
      const r = PK_RMT.evaluateItemRoute({
        item,
        coinsOffer: { bestPrice: cVal, unitsAtBest: 0, totalFreeUnits: 0, skippedTroll: 0 },
        gemasOffer: { bestPrice: gVal, unitsAtBest: 0, totalFreeUnits: 0 },
        gold: curGold,
        source: 'list',
      });
      if (r) routes.push(r);
    }
    const ranked = PK_RMT.rankRoutes(routes);
    if (ranked.length) {
      rmtState.last = { at: now, gold: curGold, source: 'list', routes: ranked };
      saveRmt();
      renderRmt();
    }
  }

  function parseRmtItemBook(painel) {
    if (!painel) return [];
    // Só lê cards de oferta; jamais clica nos botões Comprar/Retido
    const btns = $$('button', painel).filter(b => /^(comprar|buy|retido|held)/i.test(b.textContent.trim()));
    const seen = new Set(), out = [];
    for (const b of btns) {
      const card = b.closest('li, div[class]');
      if (!card || seen.has(card) || $('.cmi-linha', card)) continue;
      seen.add(card);
      const t = (card.innerText || card.textContent || '').replace(/\s+/g, ' ').trim();
      const qm = t.match(/(\d+(?:\.\d+)*)\s*×\s*un\./i);
      const qty = qm ? (PK_RMT.parseCompactNum(qm[1]) || 1) : 1;
      const pm = t.match(/(\d+(?:\.\d+)*)\s*(?:por unidade|per unit|💬|comprar|retido|buy|held)/i);
      const price = pm ? PK_RMT.parseCompactNum(pm[1]) : null;
      const sm = t.match(/^([^\s#][^#]{0,28}?)\s*#\d+/);
      const seller = sm ? sm[1].trim() : '';
      const held = /retido|held/i.test(t);
      if (price) out.push({ price, qty, held, seller });
    }
    return out;
  }

  async function waitForItemBook(wantGems, prevSig, maxMs = 2400) {
    const t0 = Date.now();
    const wantRe = wantGems ? /gema|gem/i : /coins/i;
    const sigOf = arr => arr.slice(0, 3).map(o => `${o.price}:${o.qty}:${o.held ? 1 : 0}`).join('|');
    while (Date.now() - t0 < maxMs) {
      const m = $('.modal-caixa[data-modal="community"]');
      const corpo = m && ($('#modal-corpo', m) || m);
      const painel = corpo && $('.cmi-painel', corpo);
      if (painel) {
        const opOn = $$('button.cmp-op.on', painel).some(b => wantRe.test(b.textContent));
        const list = parseRmtItemBook(painel);
        const sig = sigOf(list);
        if (opOn && list.length && (!prevSig || sig !== prevSig || Date.now() - t0 >= 850)) return list;
        if (opOn && list.length === 0 && !/carregando|loading/i.test(painel.textContent || '') && Date.now() - t0 >= 900) return [];
      }
      await sleep(200);
    }
    const m = $('.modal-caixa[data-modal="community"]');
    const painel = m && $('.cmi-painel', $('#modal-corpo', m) || m);
    return parseRmtItemBook(painel);
  }

  function parseRmtPokeCards(corpo, wantGems) {
    const cards = $$('.cm-card', corpo).slice(0, 15);
    const out = [];
    for (const c of cards) {
      const priceEl = $('.cm-preco', c);
      if (!priceEl) continue;
      const isOrb = priceEl.classList.contains('orb');
      if (typeof wantGems === 'boolean' && isOrb !== wantGems) continue;
      const rawPrice = priceEl.getAttribute('title') || priceEl.textContent;
      const price = PK_RMT.parseCompactNum(rawPrice);
      const held = /retido|held/i.test(c.innerText || c.textContent || '');
      const name = ($('.cm-nome-txt', c) || $('.cm-nome', c))?.textContent?.trim() || '';
      const level = $('.cm-sub', c)?.textContent?.trim() || '';
      const pot = $('.cm-pot', c)?.textContent?.trim() || '';
      const nota = $('.pk-selo-n', c)?.textContent?.trim() || '';
      const seller = $('.cm-vend b', c)?.textContent?.trim() || '';
      const favId = $('.cm-fav[data-fav]', c)?.getAttribute('data-fav') || '';
      if (price) out.push({ price, qty: 1, held, name, level, pot, nota, seller, favId });
    }
    return out;
  }

  function pokeCardsSignature(corpo) {
    if (!corpo) return '';
    return $$('.cm-card', corpo).slice(0, 4).map(c => {
      const id = $('.cm-fav[data-fav]', c)?.getAttribute('data-fav') || '';
      const p = $('.cm-preco', c);
      return `${id}:${p?.classList.contains('orb') ? 'G' : 'C'}:${p?.getAttribute('title') || p?.textContent?.trim() || ''}`;
    }).join('|');
  }

  async function waitForPokeResults(wantGems, prevSig, maxMs = 2600) {
    const t0 = Date.now();
    const wantRe = wantGems ? /gema|gem/i : /coins/i;
    while (Date.now() - t0 < maxMs) {
      const m = $('.modal-caixa[data-modal="community"]');
      const corpo = m && ($('#modal-corpo', m) || m);
      if (corpo) {
        const moedaOn = $$('button.cm-moeda.on', corpo).some(b => wantRe.test(b.textContent));
        const allCards = $$('.cm-card', corpo);
        const list = parseRmtPokeCards(corpo, wantGems);
        const sig = pokeCardsSignature(corpo);
        if (list.length && (!prevSig || sig !== prevSig || Date.now() - t0 >= 900)) return list;
        if (moedaOn && allCards.length === 0 && Date.now() - t0 >= 750) return [];
      }
      await sleep(220);
    }
    const m = $('.modal-caixa[data-modal="community"]');
    const corpo = m && ($('#modal-corpo', m) || m);
    return corpo ? parseRmtPokeCards(corpo, wantGems) : [];
  }

  async function scanRmt() {
    if (typeof PK_RMT === 'undefined') return log('RMT: módulo PK_RMT indisponível');
    if (rmtState.scanning) return;
    if (energyNow() === 'ultra') {
      renderRmt('Saia do modo ULTRA para escanear o RMT.');
      return log('RMT: em modo ULTRA (não sai sozinho)');
    }
    if (busy) { renderRmt('Aguarde: outra ação em andamento.'); return; }
    busy = true; rmtState.scanning = true;
    const wasOpen = !!($('.modal-caixa[data-modal="community"]') && $('.modal-caixa[data-modal="community"]').offsetParent);
    const getCorpo = () => { const m = $('.modal-caixa[data-modal="community"]'); return (m && m.offsetParent) ? ($('#modal-corpo', m) || m) : null; };
    renderRmt('Escaneando books livres do RMT...');
    try {
      if (!wasOpen) {
        await closeModal();
        const nav = navBtn('community');
        if (!nav) { renderRmt('Botão RMT não encontrado.'); return; }
        nav.click(); await sleep(1000);
      }
      let corpo = getCorpo();
      if (!corpo) { renderRmt('Modal RMT não abriu.'); return; }
      const closeLeaf = $('.cm-folha .cm-fechar'); closeLeaf && closeLeaf.click();
      await sleep(300);

      // 1) Aba Itens -> Categoria Todas (re-consultando nós a cada clique pois o modal re-renderiza)
      const btnItens = $$('button.cm-filtro', corpo).find(b => /^(itens|items)$/i.test(b.textContent.trim()));
      if (btnItens && !btnItens.classList.contains('on')) { btnItens.click(); await sleep(900); }
      corpo = getCorpo(); if (!corpo) return;
      const btnTodas = $$('button.cm-filtro', corpo).find(b => /^(todas|all)$/i.test(b.textContent.trim()));
      if (btnTodas && !btnTodas.classList.contains('on')) { btnTodas.click(); await sleep(900); }

      const curGold = gold();
      const routes = [];
      corpo = getCorpo(); if (!corpo) return;
      const targetNames = $$('.cmi-linha', corpo)
        .map(row => ($('.cmi-nome b', row) || {}).textContent?.trim())
        .filter(name => PK_RMT.matchLiquidItem(name));

      const pokeCats = PK_RMT.POKE_CATEGORIES || [];
      const totalSteps = targetNames.length + pokeCats.length;

      for (let i = 0; i < targetNames.length; i++) {
        const name = targetNames[i];
        const item = PK_RMT.matchLiquidItem(name);
        corpo = getCorpo(); if (!corpo) break;
        const row = $$('.cmi-linha', corpo).find(el => ($('.cmi-nome b', el) || {}).textContent?.trim() === name);
        if (!row) continue;
        renderRmt(`Lendo (${i + 1}/${totalSteps}): ${item.label}...`);
        const beforeItemSig = parseRmtItemBook($('.cmi-painel', corpo)).slice(0, 3).map(o => `${o.price}:${o.qty}:${o.held ? 1 : 0}`).join('|');
        row.click(); await sleep(700);

        let coinsOffer = null, gemasOffer = null;
        corpo = getCorpo();
        let painel = corpo && $('.cmi-painel', corpo);
        const btnC = $$('button.cmp-op', painel || corpo || document).find(b => /coins/i.test(b.textContent));
        const btnG = $$('button.cmp-op', painel || corpo || document).find(b => /gema|gem/i.test(b.textContent));
        const gemsFirst = !!(btnG && btnG.classList.contains('on'));

        if (gemsFirst) {
          const gList = await waitForItemBook(true, beforeItemSig);
          gemasOffer = PK_RMT.pickBestFreeOffer(gList, 2);
          const gSig = gList.slice(0, 3).map(o => `${o.price}:${o.qty}:${o.held ? 1 : 0}`).join('|');
          const bC2 = $$('button.cmp-op', $('.cmi-painel', getCorpo() || document) || document).find(b => /coins/i.test(b.textContent));
          if (bC2) {
            bC2.click();
            const cList = await waitForItemBook(false, gSig);
            coinsOffer = PK_RMT.pickBestFreeOffer(cList, item.minSanityCoins);
          }
        } else {
          if (btnC) {
            if (!btnC.classList.contains('on')) btnC.click();
            const cList = await waitForItemBook(false, beforeItemSig);
            coinsOffer = PK_RMT.pickBestFreeOffer(cList, item.minSanityCoins);
            const cSig = cList.slice(0, 3).map(o => `${o.price}:${o.qty}:${o.held ? 1 : 0}`).join('|');
            const bG2 = $$('button.cmp-op', $('.cmi-painel', getCorpo() || document) || document).find(b => /gema|gem/i.test(b.textContent));
            if (bG2) {
              bG2.click();
              const gList = await waitForItemBook(true, cSig);
              gemasOffer = PK_RMT.pickBestFreeOffer(gList, 2);
            }
          }
        }
        const r = PK_RMT.evaluateItemRoute({ item, coinsOffer, gemasOffer, gold: curGold, source: 'book' });
        if (r) routes.push(r);
      }

      // 2) Aba Pokémon -> Categorias com liquidez real (Sacrifício, P5, Mega, Shiny)
      corpo = getCorpo();
      const btnPoke = corpo && $$('button.cm-filtro', corpo).find(b => /^pok[eé]mon$/i.test(b.textContent.trim()));
      if (btnPoke) {
        btnPoke.click(); await sleep(900);

        const setLowestOrder = async () => {
          const c = getCorpo();
          const sel = c && $('#cm-ordem', c);
          if (sel) {
            const opt = [...sel.options].find(o => o.value === 'baratos' || /menor pre[çc]o|lowest price/i.test(o.textContent));
            if (opt && sel.value !== opt.value) {
              sel.value = opt.value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              await sleep(850);
            }
            return;
          }
          const ordMenor = c && $$('button, option', c).find(el => /menor pre[çc]o|lowest price/i.test(el.textContent));
          if (ordMenor) { ordMenor.click(); await sleep(850); }
        };

        for (let k = 0; k < pokeCats.length; k++) {
          const cat = pokeCats[k];
          renderRmt(`Lendo (${targetNames.length + k + 1}/${totalSteps}): ${cat.label}...`);
          corpo = getCorpo(); if (!corpo) break;

          const limpar = $('#cm-limpar', corpo);
          if (limpar) { limpar.click(); await sleep(600); }
          await setLowestOrder();

          corpo = getCorpo(); if (!corpo) break;
          if (cat.filterId) {
            const flt = $(cat.filterId, corpo);
            if (!flt) continue;
            const beforeSig = pokeCardsSignature(corpo);
            if (!flt.classList.contains('on')) { flt.click(); await sleep(800); }
            // Garante moeda Coins após ativar filtro
            corpo = getCorpo(); if (!corpo) break;
            const mCoins = $$('button.cm-moeda', corpo).find(b => /coins/i.test(b.textContent));
            if (mCoins && !mCoins.classList.contains('on')) mCoins.click();
            const cList = await waitForPokeResults(false, beforeSig);
            const pCoins = PK_RMT.pickBestFreeOffer(cList, cat.minSanityCoins);
            // Só consulta Gemas se houver ao menos 1 Pokémon livre em Coins nesta categoria
            if (!pCoins.bestPrice) continue;

            corpo = getCorpo(); if (!corpo) break;
            const sigCoins = pokeCardsSignature(corpo);
            const mGemas = $$('button.cm-moeda', corpo).find(b => /gema|gem/i.test(b.textContent));
            let pGemas = null;
            if (mGemas) {
              mGemas.click();
              const gList = await waitForPokeResults(true, sigCoins);
              pGemas = PK_RMT.pickBestFreeOffer(gList, 2);
            }
            const rPoke = PK_RMT.evaluatePokeRoute({ category: cat, coinsOffer: pCoins, gemasOffer: pGemas, gold: curGold });
            if (rPoke) routes.push(rPoke);
          } else {
            // Sacrifício (sem filtro)
            const sigBefore = pokeCardsSignature(corpo);
            const mCoins = $$('button.cm-moeda', corpo).find(b => /coins/i.test(b.textContent));
            if (mCoins && !mCoins.classList.contains('on')) mCoins.click();
            const cList = await waitForPokeResults(false, sigBefore);
            const pCoins = PK_RMT.pickBestFreeOffer(cList, cat.minSanityCoins);
            if (!pCoins.bestPrice) continue;

            corpo = getCorpo(); if (!corpo) break;
            const sigCoins = pokeCardsSignature(corpo);
            const mGemas = $$('button.cm-moeda', corpo).find(b => /gema|gem/i.test(b.textContent));
            let pGemas = null;
            if (mGemas) {
              mGemas.click();
              const gList = await waitForPokeResults(true, sigCoins);
              pGemas = PK_RMT.pickBestFreeOffer(gList, 2);
            }
            const rPoke = PK_RMT.evaluatePokeRoute({ category: cat, coinsOffer: pCoins, gemasOffer: pGemas, gold: curGold });
            if (rPoke) routes.push(rPoke);
          }
        }
        // Limpa filtros ao finalizar aba Pokémon
        const limparFim = getCorpo() && $('#cm-limpar', getCorpo());
        limparFim && limparFim.click();
      }

      const ranked = PK_RMT.rankRoutes(routes);
      rmtState.last = { at: Date.now(), gold: curGold, source: 'book', routes: ranked };
      saveRmt();
      if (ranked.length) {
        const plan = PK_RMT.buildActionPlan({ routes: ranked, gold: curGold, source: 'book' });
        log('RMT:', plan.headline, '|', plan.primary?.buyText || ranked[0].label);
      } else {
        log('RMT: nenhuma rota válida lida');
      }
    } catch (e) {
      log('RMT erro:', e.message);
      renderRmt('Erro no scan RMT: ' + e.message);
      return;
    } finally {
      if (!wasOpen) await closeModal();
      rmtState.scanning = false; busy = false;
      renderRmt();
      if (ballState.last) renderBall();
    }
  }

  // ---------- Analisador Otimizado de Pokébola (hunt atual) ----------
  let ballTableOpen = false;
  const normTxt = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  function detectActiveBoosts() {
    const items = $$('#tr-ativos .tr-ativo, #tr-ativos > *').filter(el => !el.classList.contains('pausado'));
    let catchBoostActive = false, shinyLureActive = false;
    for (const el of items) {
      const txt = `${el.textContent || ''} ${el.title || ''}`;
      if (/captura|catch/i.test(txt)) catchBoostActive = true;
      if (/shiny.*lure|isca.*shiny|lure.*shiny/i.test(txt)) shinyLureActive = true;
    }
    return { catchBoostActive, shinyLureActive };
  }

  function applyRecommendedBall(ballName) {
    if (!BALLS.includes(ballName)) return;
    CFG.ball = ballName;
    if (ballSelEl) ballSelEl.value = ballName;
    saveCfg();
    log('analisador: bola configurada para', ballName);
    renderBall();
  }

  function renderBall(statusMsg) {
    if (!ballOutEl || typeof PK_BALL === 'undefined') return;
    if (ballBtnEl) ballBtnEl.textContent = ballState.scanning ? 'Lendo...' : 'Analisar';
    if (ballFocusEl && ballFocusEl.value !== ballState.focus) ballFocusEl.value = ballState.focus;
    ballOutEl.textContent = '';
    const mk = (tag, css, txt) => {
      const el = document.createElement(tag);
      if (css) el.style.cssText = css;
      if (txt != null) el.textContent = txt;
      return el;
    };
    if (statusMsg) {
      ballOutEl.append(mk('div', 'color:#7cf', statusMsg));
      return;
    }
    const raw = ballState.last;
    if (!raw || !raw.balls || !raw.balls.length) {
      ballOutEl.append(mk('div', 'color:#aab', 'Clique em Analisar para calcular a melhor Pokébola da hunt atual (ouro/h, NPC, RMT e Shiny).'));
      return;
    }

    const rmtMarket = PK_BALL.extractRmtMarketData(rmtState.last?.routes || []);
    const boosts = detectActiveBoosts();
    const res = PK_BALL.analyzeHuntBalls({
      huntName: raw.huntName,
      huntLevel: raw.huntLevel,
      captureLevel: raw.captureLevel,
      goldPerHour: raw.goldPerHour,
      xpPerHour: raw.xpPerHour,
      baseNpcPrice: raw.baseNpcPrice,
      baseStats: raw.baseStats,
      shinyChance: raw.shinyChance,
      balls: raw.balls,
      rmtMarket,
      catchBoostActive: boosts.catchBoostActive || !!raw.catchBoostActive,
      shinyLureActive: boosts.shinyLureActive || !!raw.shinyLureActive,
      focus: ballState.focus,
    });

    const curHunt = currentHuntName();
    const huntChanged = curHunt && raw.huntName && PK_HUNT.normalizeHuntName(raw.huntName) !== curHunt;
    const ageMin = Math.max(0, Math.round((Date.now() - (raw.at || Date.now())) / 60000));
    const rec = res.recommended;
    const fc = PK_BALL.formatCoins;
    const fh = PK_BALL.formatHours;
    const fp = PK_BALL.formatPct;

    // Cabeçalho da hunt analisada
    const boostTags = [
      res.boosts.catchBoostActive ? 'Boost Cap ×2' : '',
      res.boosts.shinyLureActive ? 'Shiny Lure ×2' : '',
    ].filter(Boolean).join(' · ');
    ballOutEl.append(mk('div', 'color:#bcd;font-size:9.5px',
      `${raw.huntName} · Nv ${res.huntLevel} (cap Nv ${res.captureLevel}) · ${fc(res.pace.goldPerHour)}/h abates (~${Math.round(res.pace.killsPerHour)}/h) · ${ageMin}m`
      + (boostTags ? ` · ${boostTags}` : '')));
    if (huntChanged) {
      ballOutEl.append(mk('div', 'color:#fd8;font-size:9px', `⚠ Você mudou de hunt (${curHunt}) — clique Analisar p/ atualizar.`));
    }

    // Card da recomendação
    const accent = rec.id === 'none' ? '#fd8' : (rec.ballProfitPerKill >= 0 ? '#6f9' : '#7cf');
    const bg = rec.id === 'none' ? '#332b1488' : (rec.ballProfitPerKill >= 0 ? '#16332288' : '#14263688');
    const card = mk('div', `margin-top:4px;padding:4px 6px;border-radius:5px;background:${bg};border:1px solid ${accent}55`);
    const topRow = mk('div', 'display:flex;align-items:center;gap:6px');
    const titleEl = mk('div', `flex:1;font-weight:bold;color:${accent}`, `MELHOR: ${rec.name}`);
    topRow.append(titleEl);
    if (BALLS.includes(rec.name)) {
      const already = CFG.ball === rec.name;
      const useBtn = mk('button',
        `all:unset;cursor:pointer;padding:1px 6px;border-radius:4px;font-size:9.5px;border:1px solid ${accent}88;background:${already ? '#fff2' : accent + '33'};color:#fff`,
        already ? 'Em uso' : 'Usar');
      useBtn.title = `Configurar ${rec.name} como Pokébola padrão do bot`;
      useBtn.onclick = () => applyRecommendedBall(rec.name);
      topRow.append(useBtn);
    }
    card.append(topRow);

    const netBallTxt = rec.id === 'none'
      ? 'gasto em bolas: 0'
      : `bolas: ${rec.ballNetPerHour >= 0 ? '+' : ''}${fc(rec.ballNetPerHour)}/h (${rec.priceGold}/un)`;
    card.append(mk('div', 'color:#fff;margin-top:2px',
      `Lucro total: ${fc(rec.totalProfitPerHour)}/h · ${netBallTxt}`));

    if (rec.id !== 'none') {
      const rareTxt = Number.isFinite(rec.hoursPerRare) ? `1 raro/${fh(rec.hoursPerRare)}` : 'raro: —';
      const shinyTxt = Number.isFinite(rec.hoursPerShiny) ? `1 shiny/${fh(rec.hoursPerShiny)}` : 'sem shiny';
      card.append(mk('div', 'color:#cfe;font-size:9.5px',
        `Taxa ${fp(rec.catchChance)} (~${rec.capturesPerHour.toFixed(1)} cap/h · ${fc(rec.costPerCapture)}/cap) · ${rareTxt} · ${shinyTxt}`));
    }
    if (res.focus === 'balanced' && res.balancedReason) {
      card.append(mk('div', 'color:#9df;font-size:9px;margin-top:1px', res.balancedReason));
    }

    // Decomposição do EV por Pokémon capturado
    const v = res.value;
    card.append(mk('div', 'color:#aab;font-size:9px;margin-top:2px',
      `EV/captura: ${fc(v.evTotal)} (NPC ${fc(v.evNpc)} + RMT N≥3,5 ${fc(v.evStrong)} + P5 ${fc(v.evP5)} + Shiny ${fc(v.evShiny)})`));

    // Comparativo rápido dos 3 focos quando diferem
    const fNames = `Dinheiro: ${res.byFocus.money.name} | Equil.: ${res.byFocus.balanced.name} | Raro: ${res.byFocus.rare.name}`;
    card.append(mk('div', 'color:#bcd;font-size:9px;margin-top:2px', fNames));
    ballOutEl.append(card);

    // Avisos + atalho para escanear RMT se sem dados RMT
    for (const w of res.warnings) {
      const line = mk('div', 'margin-top:2px;color:#fc9;font-size:9px;display:flex;align-items:center;gap:4px');
      line.append(mk('span', 'flex:1', '⚠ ' + w));
      if (/Radar RMT/i.test(w)) {
        const bRmt = mk('button', 'all:unset;cursor:pointer;padding:0 5px;border-radius:3px;background:#fd83;border:1px solid #fd86;color:#fff;font-size:9px', 'Ler RMT');
        bRmt.onclick = () => scanRmt();
        line.append(bRmt);
      }
      ballOutEl.append(line);
    }

    // Tabela dobrável comparando todas as Pokébolas
    const det = document.createElement('details');
    det.open = ballTableOpen;
    det.style.cssText = 'margin-top:4px;border-top:1px solid #fff2;padding-top:3px';
    det.ontoggle = () => { ballTableOpen = det.open; };
    det.append(mk('summary', 'cursor:pointer;color:#aab;font-size:9.5px', `Comparar todas as bolas (${res.options.length})`));
    for (const o of res.options) {
      const mark = o.id === rec.id ? '★' : (o.diamondOnly ? '◆' : '·');
      const color = o.id === rec.id ? '#6f9' : (o.diamondOnly ? '#c9f' : '#cfd');
      if (o.diamondOnly) {
        const sh = Number.isFinite(o.hoursPerShiny) ? `1 shiny/${fh(o.hoursPerShiny)}` : 'sem shiny';
        det.append(mk('div', `color:${color};font-size:9px;margin-top:1px`,
          `${mark} ${o.name} (só Diamante): ${fp(o.catchChance)} · ${o.capturesPerHour.toFixed(1)} cap/h · ${sh}`));
      } else if (o.id === 'none') {
        det.append(mk('div', `color:${color};font-size:9px;margin-top:1px`,
          `${mark} ${o.name}: total ${fc(o.totalProfitPerHour)}/h · 0 cap/h`));
      } else {
        const bSign = o.ballNetPerHour >= 0 ? '+' : '';
        const sh = Number.isFinite(o.hoursPerShiny) ? ` · sh/${fh(o.hoursPerShiny)}` : '';
        det.append(mk('div', `color:${color};font-size:9px;margin-top:1px`,
          `${mark} ${o.name} (${o.priceGold}): ${fp(o.catchChance)} · total ${fc(o.totalProfitPerHour)}/h (bola ${bSign}${fc(o.ballNetPerHour)}/h)${sh}`));
      }
    }
    ballOutEl.append(det);
  }

  async function waitForSelector(sel, rootFn = () => document, maxMs = 1500) {
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline) {
      const el = $(sel, rootFn() || document);
      if (el) return el;
      await sleep(100);
    }
    return null;
  }

  function parsePokedexSheetBody(corpo, fallbackName = '') {
    const placas = $$('.fi-placa', corpo).map(p => ({
      label: normTxt($('small', p)?.textContent || ''),
      val: ($('b', p)?.textContent || '').trim(),
      full: p.textContent.replace(/\s+/g, ' ').trim(),
    }));

    let baseNpcPrice = 0, captureLevel = 0, shinyChance = 0;
    for (const pl of placas) {
      if (/npc/i.test(pl.label)) baseNpcPrice = PK_BALL.parseIntStrict(pl.val);
      else if (/capturar|capture.*level|level.*captur/i.test(pl.label)) captureLevel = PK_BALL.parseCaptureLevel(pl.val);
      else if (/tentativa|throw|shiny/i.test(pl.label) && !/lure|isca|b[oô]nus|bonus/i.test(pl.label)) {
        const p = PK_BALL.parseOneInN(pl.full) || PK_BALL.parsePercent(pl.full);
        if (p > 0 && p < 0.1) shinyChance = p;
      }
    }

    // Stats-base (HP, ATK, DEF, SP.ATK, SP.DEF, SPD)
    const statsText = $$('.fi-stat, [class*="stat"]', corpo).map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
    const statOf = re => { const m = statsText.match(re); return m ? parseInt(m[1], 10) : 0; };
    const baseStats = [
      statOf(/\bHP\s*(\d+)/i),
      statOf(/\bATK\s*(\d+)/i),
      statOf(/\bDEF\s*(\d+)/i),
      statOf(/\bSP\.?\s*ATK\s*(\d+)/i),
      statOf(/\bSP\.?\s*DEF\s*(\d+)/i),
      statOf(/\bSPD\s*(\d+)/i),
    ];
    const validStats = baseStats.every(n => n > 0) ? baseStats : null;

    // Tabelas da ficha: golpes, drops de pedras, captura normal e shiny
    const tables = $$('.fi-tabela', corpo).map(t =>
      $$('tr', t).map(tr => [...tr.children].map(td => td.textContent.trim()))
    );
    const ballTable = tables.find(rows => rows.some(r => r.length >= 5 && /poke\s*ball|great\s*ball|ultra\s*ball/i.test(r[0] || '')))
      || tables.find(rows => rows.some(r => r.length >= 4 && /poke\s*ball/i.test(r[0] || '')));
    const balls = PK_BALL.parsePokedexBallRows(ballTable || []);

    const attackTable = tables.find(rows => rows !== ballTable && rows.some(r => r.length >= 5 && /esp|spec|fis|f[ií]s|phys/i.test(r[2] || '')));
    const attacks = PK_HUNT.parsePokedexAttacks(attackTable || []);

    const stoneTable = tables.find(rows => rows !== ballTable && rows !== attackTable && rows.some(r => r.length >= 2 && /stone|pedra/i.test(r[0] || '')));
    const { stoneProbSum, stoneCount } = PK_HUNT.parsePokedexStones(stoneTable || []);

    // Fallback para chanceShiny via tabela "Captura do shiny" (4 colunas)
    if (!shinyChance) {
      const shinyTable = tables.find(rows => rows !== ballTable && rows.some(r => r.length === 4 && /poke\s*ball/i.test(r[0] || '')));
      if (shinyTable) {
        const row = shinyTable.find(r => /poke\s*ball/i.test(r[0] || ''));
        if (row) {
          const cap = PK_BALL.parsePercent(row[2]);
          const both = PK_BALL.parseOneInN(row[3]);
          if (cap > 0 && both > 0) shinyChance = both / cap;
        }
      }
    }

    return {
      name: $('#ficha-titulo')?.textContent?.trim() || fallbackName,
      baseNpcPrice,
      captureLevel,
      baseStats: validStats,
      shinyChance,
      balls,
      attacks,
      stoneProbSum,
      stoneCount,
    };
  }

  async function batchReadPokedexSpecies(items) {
    const out = {};
    if (!items || !items.length) return out;
    await closeModal();
    const nav = navBtn('pokedex');
    if (!nav) return out;
    nav.click();
    const inp = await waitForSelector('#f-dex', () => $('#modal-corpo'), 1800);
    if (!inp) { await closeModal(); return out; }

    for (const item of items) {
      const key = item.key || normTxt(item.query);
      if (dexCache[key] && dexCache[key].baseStats) { out[key] = dexCache[key]; continue; }
      inp.value = item.query;
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      await sleep(240);
      const target = normTxt(item.query);
      const cards = $$('#modal-corpo .dex-card');
      const cleanCardName = el => normTxt((el.textContent || '').replace(/^#\d+\s*/, ''));
      const card = cards.find(c => cleanCardName(c) === target)
        || cards.find(c => cleanCardName(c).includes(target))
        || cards[0];
      if (!card) continue;
      card.click();
      const hasTable = await waitForSelector('#ficha-corpo .fi-tabela', () => document, 1500);
      if (hasTable) {
        await sleep(120);
        const parsed = parsePokedexSheetBody($('#ficha-corpo'), item.query);
        dexCache[key] = { ...parsed, ts: Date.now() };
        out[key] = dexCache[key];
      }
      const fichaClose = $('#ficha-fechar');
      if (fichaClose && fichaClose.offsetParent) { fichaClose.click(); await sleep(140); }
    }
    saveDexCache();
    await closeModal();
    return out;
  }

  async function readPokedexSpecies(speciesName) {
    await closeModal();
    const nav = navBtn('pokedex');
    if (!nav) throw new Error('botão da Pokedex não encontrado');
    nav.click();
    const inp = await waitForSelector('#f-dex', () => $('#modal-corpo'), 1800);
    if (!inp) throw new Error('busca da Pokedex não abriu');
    inp.value = speciesName;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300);

    const target = normTxt(speciesName);
    const cards = $$('#modal-corpo .dex-card');
    const cleanCardName = el => normTxt((el.textContent || '').replace(/^#\d+\s*/, ''));
    const card = cards.find(c => cleanCardName(c) === target)
      || cards.find(c => cleanCardName(c).includes(target))
      || cards[0];
    if (!card) throw new Error(`espécie "${speciesName}" não encontrada na Pokedex`);

    card.click();
    const hasTable = await waitForSelector('#ficha-corpo .fi-tabela', () => document, 1800);
    if (!hasTable) throw new Error(`ficha de "${speciesName}" não carregou`);
    await sleep(150);

    const parsed = parsePokedexSheetBody($('#ficha-corpo'), speciesName);
    const key = normTxt(speciesName);
    if (key && parsed.baseStats) { dexCache[key] = { ...parsed, ts: Date.now() }; saveDexCache(); }

    const fichaClose = $('#ficha-fechar');
    if (fichaClose && fichaClose.offsetParent) { fichaClose.click(); await sleep(150); }
    return parsed;
  }

  async function analyzeCurrentHuntBalls() {
    if (typeof PK_BALL === 'undefined') return;
    if (ballState.scanning) return;
    if (busy) { renderBall('Aguarde a ação atual terminar e tente de novo.'); return; }
    if (!inHunt()) { renderBall('Entre em uma hunt ativa primeiro (não funciona no Centro/Safari).'); return; }

    ballState.scanning = true; busy = true;
    const wasUltra = energyNow() === 'ultra';
    const wasOpen = !!modalVisible();
    try {
      const boosts = detectActiveBoosts();
      const hudRaw = (($('#hud-hunt') || $('#eco-onde') || {}).innerText) || '';
      const hudLevelMatch = hudRaw.match(/(?:n[ií]vel|level|nv\.?)\s*(\d+)/i);
      let huntLevel = hudLevelMatch ? parseInt(hudLevelMatch[1], 10) : 1;
      let huntName = hudRaw.split(/\s*[·—]\s*/)[0].trim() || currentHuntName();
      let goldPerHour = 0, xpPerHour = 0;
      let speciesList = [];

      renderBall('Lendo hunt atual no Mapa...');
      if (wasUltra) await leaveUltra();
      await openMap();

      // Localiza o marcador da hunt atual (.on) na região atual ou nas demais regiões
      let mk = $('#mapa-tela .marcador.on');
      if (!mk) {
        for (const rb of regionBtns()) {
          rb.click(); await sleep(500);
          mk = $('#mapa-tela .marcador.on');
          if (mk) break;
        }
      }
      if (!mk && huntName) {
        const targetNorm = PK_HUNT.normalizeHuntName(huntName);
        mk = $$('#mapa-tela .marcador').find(x => PK_HUNT.normalizeHuntName((x.title || '').split(' — ')[0]) === targetNorm);
      }
      if (mk) {
        hover(mk); await sleep(200);
        const a = readAnalyser();
        goldPerHour = a.gold || 0;
        xpPerHour = a.xp || 0;
        const areaTxt = ($('#hunt-analyser-corpo .ha-area')?.textContent || '').trim();
        const lvlTxt = ($('#hunt-analyser-corpo .ha-nivel')?.textContent || '').trim();
        if (areaTxt) huntName = areaTxt;
        const lvlNum = PK_BALL.parseIntStrict(lvlTxt);
        if (lvlNum > 0) huntLevel = lvlNum;
        // 2ª linha de mk.title lista as espécies da hunt ("Diglett" ou "Mr. Mime, Abra")
        const lines = String(mk.title || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (lines[1] && !/^[✓✔]/.test(lines[1])) {
          speciesList = lines[1].split(',').map(s => s.trim()).filter(Boolean).slice(0, 3);
        }
      }
      if (!speciesList.length && huntName) speciesList = [huntName];
      if (!speciesList.length) throw new Error('não foi possível identificar o Pokémon da hunt atual');

      // Lê a ficha na Pokedex (suporta 1 ou mais espécies na mesma hunt)
      const fetched = [];
      for (let i = 0; i < speciesList.length; i++) {
        renderBall(`Lendo Pokedex (${i + 1}/${speciesList.length}): ${speciesList[i]}...`);
        try {
          fetched.push(await readPokedexSpecies(speciesList[i]));
        } catch (e) {
          log('analisador: falha na Pokedex p/', speciesList[i], '-', e.message);
        }
      }
      if (!fetched.length) throw new Error('não foi possível ler a ficha na Pokedex');

      // Agrega (média simples entre as espécies da hunt quando houver > 1)
      const avg = arr => arr.reduce((s, x) => s + x, 0) / arr.length;
      const baseNpcPrice = Math.round(avg(fetched.map(f => f.baseNpcPrice || 0)));
      const captureLevel = Math.round(avg(fetched.map(f => f.captureLevel || Math.min(100, huntLevel))));
      const shinyChance = avg(fetched.map(f => f.shinyChance || 0));
      const validStatsList = fetched.map(f => f.baseStats).filter(Boolean);
      const baseStats = validStatsList.length
        ? [0, 1, 2, 3, 4, 5].map(i => Math.round(avg(validStatsList.map(s => s[i]))))
        : null;

      // Média das taxas de captura por bola entre as espécies lidas
      const ballMap = new Map();
      for (const f of fetched) {
        for (const b of (f.balls || [])) {
          const k = b.name.toLowerCase();
          if (!ballMap.has(k)) ballMap.set(k, { ...b, _chances: [b.catchChance] });
          else ballMap.get(k)._chances.push(b.catchChance);
        }
      }
      const balls = [...ballMap.values()].map(b => ({
        name: b.name,
        catchRate: b.catchRate,
        catchChance: avg(b._chances),
        avgKills: Math.ceil(1 / avg(b._chances)),
        priceGold: b.priceGold,
        diamondOnly: b.diamondOnly,
      }));
      if (!balls.length) throw new Error('tabela de Pokébolas não encontrada na Pokedex');

      ballState.last = {
        at: Date.now(),
        huntName,
        species: fetched.map(f => f.name),
        huntLevel,
        captureLevel,
        goldPerHour,
        xpPerHour,
        baseNpcPrice,
        baseStats,
        shinyChance,
        balls,
        catchBoostActive: boosts.catchBoostActive,
        shinyLureActive: boosts.shinyLureActive,
      };
      saveBall();

      const rmtMarket = PK_BALL.extractRmtMarketData(rmtState.last?.routes || []);
      const res = PK_BALL.analyzeHuntBalls({ ...ballState.last, rmtMarket, focus: ballState.focus });
      log('analisador:', `${huntName} Nv${huntLevel} -> melhor (${ballState.focus}): ${res.recommended.name} (${PK_BALL.formatCoins(res.recommended.totalProfitPerHour)}/h)`);
    } catch (e) {
      log('analisador erro:', e.message);
      renderBall('Erro: ' + e.message);
      return;
    } finally {
      if (!wasOpen) await closeModal();
      if (wasUltra) await reenterUltra();
      ballState.scanning = false; busy = false;
      renderBall();
    }
  }

  // ---------- loop (Worker evita throttle em aba em segundo plano) ----------
  let lastTick = Date.now(), lastSupply = 0, warnedCapture = false;
  async function tick() {
    if (document.hidden) document.dispatchEvent(new CustomEvent('pk-pump'));
    try {
      const now = Date.now(), gap = now - lastTick; lastTick = now;
      if (gap > 8000) { log('relógio ficou parado', Math.round(gap / 1000) + 's (aba oculta/freada?) - checando estoque já'); lastSupply = 0; }
      captureTick();
      readRmtListPassive();
      if (!rmtState.scanning && rmtState.last && Math.abs(gold() - lastRmtGold) >= Math.max(1e6, lastRmtGold * 0.01)) renderRmt();
      if (st.potions && !busy && now - lastSupply >= 5000) { lastSupply = now; energyNow() === 'ultra' ? ultraSupplyTick() : checkSupplies(); }
      if ((st.capture || st.eterna) && energyNow() !== 'normal' && !warnedCapture) { warnedCapture = true; log('aviso: captura não funciona em Economia/ULTRA (a lista de corpos não atualiza)'); }
      if (energyNow() === 'normal') warnedCapture = false;
      await huntTick();
    } catch (e) { log('erro:', e.message); }
  }
  // 2º relógio: o service worker (alarme de 30 s) cutuca a aba, que roda a mesma rotina
  try { chrome.runtime.onMessage.addListener(m => { if (m && m.type === 'pk-tick') tick(); }); } catch (e) {}

  // Mantém a aba "viva" quando oculta: um Web Lock eterno e um áudio inaudível (sem isso o Chrome
  // limita os timers a ~1/min e pode congelar a aba). O áudio só liga depois de um clique na página.
  let audioCtx;
  function startAudio() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        g.gain.value = 0.00001; o.frequency.value = 20; o.connect(g).connect(audioCtx.destination); o.start();
      }
      audioCtx.resume().then(() => log('keep-alive: áudio mudo', audioCtx.state === 'running' ? 'ativo' : 'aguardando clique na página'));
    } catch (e) { log('keep-alive áudio falhou:', e.message); }
  }
  function applyKeepAlive() {
    if (!st.keepalive) { audioCtx && audioCtx.suspend(); return; }
    startAudio();
  }
  try { navigator.locks.request('pkbot-keepalive', () => new Promise(() => {})); } catch (e) {}
  addEventListener('pointerdown', () => { if (st.keepalive && (!audioCtx || audioCtx.state !== 'running')) startAudio(); }, true);
  function startTimer() {
    try {
      const code = 'setInterval(()=>postMessage({tick:1}),1000);onmessage=e=>{const d=e.data;if(d&&d.id)setTimeout(()=>postMessage({id:d.id}),d.ms);};';
      const w = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      w.onmessage = e => {
        const d = e.data;
        if (d && d.id) { const fn = _sleepPend.get(d.id); if (fn) { _sleepPend.delete(d.id); fn(); } return; }
        tick();
      };
      _timerWorker = w;
      log('timer: worker');
    } catch (e) { setInterval(tick, 1000); log('timer: setInterval (pode ser limitado em aba oculta)'); }
  }

  const rmtPlan = () => (rmtState.last && typeof PK_RMT !== 'undefined')
    ? PK_RMT.buildActionPlan({ routes: rmtState.last.routes, gold: gold(), source: rmtState.last.source })
    : null;
  window.__pkBot = { CFG, st, log, buy, checkSupplies, captureTick, huntState, analyzeHunts, rmtState, rmtPlan, scanRmt, ballState, analyzeCurrentHuntBalls, xpEvents, potChips, ballQty, scanHunts, switchTo, closeModal };
  const boot = () => {
    // o painel continua visível no ULTRA Economia (que esconde o resto do jogo)
    const css = document.createElement('style'); css.textContent = 'html.modo-ultra body #pkbot-panel:not(.pk-oculto){display:block!important;visibility:visible!important}'; document.head.append(css);
    buildPanel(); applyFps(); watch(); startTimer(); log('PokeIdle Helper pronto', CFG.dry ? '(DRY-RUN)' : ''); };
  document.body ? boot() : addEventListener('DOMContentLoaded', boot);
})();
