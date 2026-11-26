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
    huntGain: 1.06,          // só troca de hunt se a melhor render >6% mais que a atual (acima da banda de empate de 3%)
    minRatio: 0.5,           // descarta hunts em que (ataque amplificado / dano recebido amplificado) < 0.5
    captureRe: /captur(ou|ad[oa]|a!|ed)|caught|gotcha/i,
    dry: false,
  };
  // configurações editáveis no painel (salvas no navegador); potType 'auto' = repõe as poções em uso
  CFG.potType = 'auto';
  CFG.fps = globalThis.__pkServer ? 0.2 : 10; // quadros/s só do mapa (0 = sem limite); UI sempre fica em 60 FPS
  CFG.huntFocus = 'balanced'; // balanced | xp | lucro | shiny
  CFG.rmtDir = 'both'; // both | gold-to-gem | gem-to-gold | trading
  CFG.lite = !!globalThis.__pkServer; // modo servidor: desativa animações CSS/transições/sombras que forçam repintura a 60 Hz
  const CFG_KEY = 'pkbot-cfg', EDITABLE = ['ball', 'ballMin', 'ballBuy', 'potType', 'potMin', 'potBuy', 'fps', 'huntFocus', 'rmtDir', 'lite'];
  const applyFps = () => document.dispatchEvent(new CustomEvent('pk-fps', { detail: +CFG.fps || 0 }));
  const LITE_CSS = '*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}body *:not(#pkbot-panel):not(#pkbot-panel *){box-shadow:none!important;text-shadow:none!important}';
  const applyLite = () => {
    let el = document.getElementById('pkbot-lite-css');
    if (CFG.lite) {
      if (!el) { el = document.createElement('style'); el.id = 'pkbot-lite-css'; el.textContent = LITE_CSS; document.head.append(el); }
    } else if (el) el.remove();
  };
  document.addEventListener('pk-stat', e => console.log('[pkbot]', new Date().toLocaleTimeString(), 'cena:', e.detail.fps + ' fps reais (limite ' + (e.detail.limite || 'nenhum') + '),', e.detail.ms + ' ms/s de JS'));
  try { const o = JSON.parse(localStorage.getItem(CFG_KEY)) || {}; EDITABLE.forEach(k => { if (k in o) CFG[k] = o[k]; }); } catch (e) {}
  if (!['balanced', 'xp', 'lucro', 'shiny'].includes(CFG.huntFocus)) CFG.huntFocus = 'balanced';
  if (!['both', 'gold-to-gem', 'gem-to-gold', 'trading'].includes(CFG.rmtDir)) CFG.rmtDir = 'both';
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
  let logEl, rmtOutEl, rmtBtnEl, rmtDirEl, stonesOutEl, stonesPlanBtnEl, stonesSellBtnEl, sellOutEl, sellLoadBtnEl, sellScanBtnEl, sellSelEl, sellQtyEl, ballOutEl, ballBtnEl, ballFocusEl, ballSelEl, ballMinEl, ballBuyEl, huntOutEl, huntFocusEl, huntBtnEl;
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
  // Histórico de preços do RMT (um snapshot por scan) para a análise temporal "agir agora x esperar"
  const RMT_HIST_KEY = 'pkbot-rmt-hist';
  let rmtHist = null;
  try { rmtHist = PK_TIMING.normalizeHistory(JSON.parse(localStorage.getItem(RMT_HIST_KEY) || 'null')); } catch (e) { rmtHist = null; }
  const saveRmtHist = () => { try { localStorage.setItem(RMT_HIST_KEY, JSON.stringify(rmtHist)); } catch (e) {} };
  const STONES_KEY = 'pkbot-stones';
  const stoneState = { running: false, last: null };
  try { stoneState.last = JSON.parse(localStorage.getItem(STONES_KEY) || 'null'); } catch (e) {}
  const saveStones = () => { try { localStorage.setItem(STONES_KEY, JSON.stringify(stoneState.last)); } catch (e) {} };
  const SELL_KEY = 'pkbot-sell';
  const sellState = { loading: false, scanning: false, inventory: { at: 0, items: [], pokemons: [] }, selectedKey: '', qtyOverride: null, last: null };
  try {
    const savedSell = JSON.parse(localStorage.getItem(SELL_KEY) || 'null');
    if (savedSell && typeof savedSell === 'object') {
      if (savedSell.inventory && Array.isArray(savedSell.inventory.items) && Array.isArray(savedSell.inventory.pokemons)) {
        sellState.inventory = savedSell.inventory;
      }
      if (typeof savedSell.selectedKey === 'string') sellState.selectedKey = savedSell.selectedKey;
      if (savedSell.last) sellState.last = savedSell.last;
    }
  } catch (e) {}
  const saveSell = () => {
    try {
      localStorage.setItem(SELL_KEY, JSON.stringify({
        inventory: sellState.inventory,
        selectedKey: sellState.selectedKey,
        last: sellState.last,
      }));
    } catch (e) {}
  };
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
  /* Painel: arraste pelo cabeçalho; "—" (ou duplo clique) recolhe em pílula; "×" ou Alt+P esconde/mostra.
     Posição, aba ativa e estado ficam salvos. Fica levemente transparente até o mouse chegar perto.
     Visual: tema em um <style> (#pkbot-style) com variáveis --pkb-* e classes pkb-*. */
  const PANEL_CSS = `
#pkbot-panel{--pkb-bg:rgba(14,17,27,.96);--pkb-card:rgba(255,255,255,.045);--pkb-line:rgba(255,255,255,.09);--pkb-text:#e8ebf4;--pkb-mute:#8b93a9;--pkb-accent:#7c8cff;--pkb-ok:#4ade80;--pkb-warn:#fbbf24;--pkb-bad:#f87171;
position:fixed;z-index:2147483647;display:flex;flex-direction:column;box-sizing:border-box;width:340px;background:var(--pkb-bg);color:var(--pkb-text);font:12.5px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;border:1px solid var(--pkb-line);border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.55);opacity:.94;transition:opacity .15s;user-select:none}
#pkbot-panel input[type=checkbox]{appearance:auto;-webkit-appearance:checkbox;background:none;border:0;box-shadow:none;border-radius:0;padding:0;margin:0;outline:0}
#pkbot-panel input[type=checkbox]::before,#pkbot-panel input[type=checkbox]::after{content:none;display:none}
#pkbot-panel:hover{opacity:1}
#pkbot-panel *{box-sizing:border-box;font-family:inherit}
#pkbot-panel.pkb-min{width:auto;min-width:210px}
#pkbot-panel.pkb-min .pkb-strip,#pkbot-panel.pkb-min .pkb-tabs,#pkbot-panel.pkb-min .pkb-body{display:none}
#pkbot-panel .pkb-head{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:9px 10px;cursor:move;touch-action:none}
#pkbot-panel .pkb-dot{width:9px;height:9px;border-radius:50%;background:var(--pkb-mute);flex:0 0 auto}
#pkbot-panel .pkb-dot.pkb-on{background:var(--pkb-ok);box-shadow:0 0 8px var(--pkb-ok)}
#pkbot-panel .pkb-title{font-weight:650;font-size:13px;letter-spacing:.2px;white-space:nowrap}
#pkbot-panel .pkb-sub{flex:1;min-width:0;color:var(--pkb-mute);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#pkbot-panel .pkb-ibtn{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:24px;padding:0 6px;border-radius:7px;color:var(--pkb-text);background:var(--pkb-card);font-size:12px}
#pkbot-panel .pkb-ibtn:hover{background:rgba(255,255,255,.12)}
#pkbot-panel .pkb-ibtn:disabled{opacity:.35;cursor:default}
#pkbot-panel .pkb-strip{flex:0 0 auto;display:flex;flex-wrap:wrap;gap:5px;padding:0 10px 8px}
#pkbot-panel .pkb-chip{display:inline-flex;align-items:center;gap:4px;padding:1px 8px;border-radius:99px;font-size:11px;background:var(--pkb-card);border:1px solid var(--pkb-line);color:var(--pkb-mute)}
#pkbot-panel .pkb-chip.pkb-ok{color:var(--pkb-ok);border-color:rgba(74,222,128,.35)}
#pkbot-panel .pkb-chip.pkb-warn{color:var(--pkb-warn);border-color:rgba(251,191,36,.35)}
#pkbot-panel .pkb-tabs{flex:0 0 auto;display:flex;gap:2px;padding:0 6px;border-bottom:1px solid var(--pkb-line);overflow-x:auto;scrollbar-width:none}
#pkbot-panel .pkb-tab{all:unset;box-sizing:border-box;cursor:pointer;position:relative;padding:6px 8px;font-size:12px;color:var(--pkb-mute);border-bottom:2px solid transparent;white-space:nowrap}
#pkbot-panel .pkb-tab:hover{color:var(--pkb-text)}
#pkbot-panel .pkb-tab.pkb-active{color:var(--pkb-text);border-bottom-color:var(--pkb-accent)}
#pkbot-panel .pkb-tab.pkb-live::after{content:"";position:absolute;top:5px;right:2px;width:5px;height:5px;border-radius:50%;background:var(--pkb-ok)}
#pkbot-panel .pkb-body{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:thin;padding:10px}
#pkbot-panel .pkb-pane[hidden]{display:none}
#pkbot-panel .pkb-pane{display:flex;flex-direction:column;gap:8px}
#pkbot-panel .pkb-card{background:var(--pkb-card);border:1px solid var(--pkb-line);border-radius:10px;padding:8px 10px}
#pkbot-panel .pkb-h{font-weight:650;font-size:12.5px}
#pkbot-panel .pkb-desc{color:var(--pkb-mute);font-size:11px;margin-top:1px}
#pkbot-panel .pkb-bar{display:flex;align-items:center;gap:6px}
#pkbot-panel .pkb-bar>.pkb-grow{flex:1;min-width:0}
#pkbot-panel .pkb-row{display:flex;align-items:center;gap:8px;padding:5px 2px;cursor:pointer}
#pkbot-panel .pkb-row+.pkb-row{border-top:1px solid var(--pkb-line)}
#pkbot-panel .pkb-row input[type=checkbox]{accent-color:var(--pkb-accent);width:15px;height:15px;margin:0;flex:0 0 auto;cursor:pointer}
#pkbot-panel .pkb-num{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;background:rgba(124,140,255,.18);color:var(--pkb-accent);font-size:11px;font-weight:650;flex:0 0 auto}
#pkbot-panel .pkb-btn{all:unset;box-sizing:border-box;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:4px 11px;border-radius:7px;font-size:12px;font-weight:600;color:var(--pkb-text);background:var(--pkb-card);border:1px solid var(--pkb-line);white-space:nowrap}
#pkbot-panel .pkb-btn:hover{background:rgba(255,255,255,.11)}
#pkbot-panel .pkb-btn.pkb-primary{background:var(--pkb-accent);border-color:var(--pkb-accent);color:#0b0e1a}
#pkbot-panel .pkb-btn.pkb-primary:hover{filter:brightness(1.1)}
#pkbot-panel .pkb-btn.pkb-go{background:rgba(74,222,128,.18);border-color:rgba(74,222,128,.5);color:var(--pkb-ok)}
#pkbot-panel .pkb-btn:disabled{opacity:.4;cursor:default;filter:none}
#pkbot-panel .pkb-in{width:100%;min-width:0;background:rgba(0,0,0,.35);color:var(--pkb-text);border:1px solid var(--pkb-line);border-radius:7px;font-size:12px;padding:3px 6px;height:26px}
#pkbot-panel .pkb-in:focus{outline:1px solid var(--pkb-accent)}
#pkbot-panel select.pkb-in option{background:#12151f;color:var(--pkb-text)}
#pkbot-panel .pkb-grid{display:grid;grid-template-columns:auto 1fr 56px 62px;gap:5px 6px;align-items:center}
#pkbot-panel .pkb-cell{font-size:11px;color:var(--pkb-mute)}
#pkbot-panel .pkb-out{margin-top:6px;font-size:11.5px;line-height:1.45;color:var(--pkb-text);user-select:text}
#pkbot-panel .pkb-out:empty{display:none}
#pkbot-panel .pkb-log{margin:0;white-space:pre-wrap;max-height:130px;overflow:auto;user-select:text;font:11px/1.4 ui-monospace,Consolas,monospace;color:#b8c4d8}
#pkbot-panel details>summary{cursor:pointer;color:var(--pkb-mute);font-size:11.5px}
`;
  function buildPanel() {
    const u = Object.assign({ x: null, y: null, min: true, hidden: false, tab: 'auto', resume: [] }, loadUI());
    const saveUI = () => { try { localStorage.setItem(UI_KEY, JSON.stringify(u)); } catch (e) {} };
    if (!$('#pkbot-style')) { const s = document.createElement('style'); s.id = 'pkbot-style'; s.textContent = PANEL_CSS; document.head.append(s); }
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const opt = (s, list) => { list.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; s.append(o); }); return s; };
    const MODES = ['capture', 'potions', 'eterna', 'hunt'];
    const p = el('div'); p.id = 'pkbot-panel';

    // ----- cabeçalho (arrastável): status + pausa/retoma + minimizar + esconder -----
    const head = el('div', 'pkb-head');
    const dot = el('span', 'pkb-dot');
    const title = el('span', 'pkb-title', 'PokeIdle Helper');
    const sub = el('span', 'pkb-sub');
    head.append(dot, title, sub);
    const ibtn = (txt, tip, fn) => { const b = el('button', 'pkb-ibtn', txt); b.title = tip; b.onpointerdown = e => e.stopPropagation(); b.onclick = fn; head.append(b); return b; };
    const setModes = (keys, val) => keys.forEach(k => { const c = $('#pkbot-' + k); if (c && c.checked !== val) { c.checked = val; c.onchange(); } });
    const pauseBtn = ibtn('⏸', 'Pausar todos os modos', () => {
      const on = MODES.filter(k => st[k]);
      if (on.length) { u.resume = on; saveUI(); setModes(on, false); } else { setModes(u.resume || [], true); }
      render();
    });
    ibtn('—', 'Recolher/expandir (duplo clique no título)', () => { u.min = !u.min; saveUI(); render(); });
    ibtn('×', 'Esconder (Alt+P mostra de novo)', () => { u.hidden = true; saveUI(); render(); });

    // ----- faixa de status (tela, aba oculta, dry-run) -----
    const strip = el('div', 'pkb-strip');
    const chipScreen = el('span', 'pkb-chip'), chipHidden = el('span', 'pkb-chip pkb-warn', 'aba oculta'), chipDry = el('span', 'pkb-chip pkb-warn', 'dry-run');
    strip.append(chipScreen, chipHidden, chipDry);

    // ----- abas -----
    const tabsEl = el('div', 'pkb-tabs');
    const body = el('div', 'pkb-body');
    const TABS = [['auto', 'Auto'], ['hunt', 'Hunt'], ['ball', 'Bola'], ['rmt', 'RMT'], ['stones', 'Pedras'], ['sell', 'Venda']];
    const panes = {}, tabBtns = {};
    for (const [key, label] of TABS) {
      const b = el('button', 'pkb-tab', label); b.onclick = () => { u.tab = key; saveUI(); render(); };
      tabBtns[key] = b; tabsEl.append(b);
      const pane = el('div', 'pkb-pane'); pane.dataset.tab = key; panes[key] = pane; body.append(pane);
    }
    // componentes
    const card = () => el('div', 'pkb-card');
    const bar = (...kids) => { const d = el('div', 'pkb-bar'); d.append(...kids); return d; };
    const secHead = (name, desc) => { const d = el('div', 'pkb-grow'); d.append(el('div', 'pkb-h', name)); if (desc) d.append(el('div', 'pkb-desc', desc)); return d; };
    const btn = (id, txt, tip, kind, fn) => { const b = el('button', 'pkb-btn' + (kind ? ' pkb-' + kind : ''), txt); if (id) b.id = id; b.title = tip; b.onclick = fn; return b; };
    const sel = (id, tip, list, cls) => { const s = el('select', cls || 'pkb-in'); if (id) s.id = id; s.title = tip; opt(s, list); s.style.width = 'auto'; return s; };
    const out = id => { const d = el('div', 'pkb-out'); d.id = id; return d; };

    // ===== aba Auto =====
    const modesCard = card();
    const mk = (key, num, label) => {
      const l = el('label', 'pkb-row');
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!st[key]; c.id = 'pkbot-' + key;
      c.onchange = () => { st[key] = c.checked; save(); log(label, c.checked ? 'ON' : 'OFF'); if (key === 'hunt') huntState.next = 0; if (key === 'keepalive') applyKeepAlive(); ui.refresh(); };
      l.append(c); if (num) l.append(el('span', 'pkb-num', num)); l.append(el('span', null, label)); modesCard.append(l);
    };
    mk('capture', '1', 'Captura (para ao capturar)');
    mk('potions', '2', 'Repor bolas/poções');
    mk('eterna', '3', 'Captura eterna');
    mk('keepalive', '', 'Manter ativo em 2º plano');
    const liteLbl = el('label', 'pkb-row');
    liteLbl.title = 'Desliga animações CSS, transições e sombras do jogo (corta repintura a 60 Hz; ideal para servidor/multi-conta)';
    const liteChk = document.createElement('input'); liteChk.type = 'checkbox'; liteChk.checked = !!CFG.lite; liteChk.id = 'pkbot-lite';
    liteChk.onchange = () => { CFG.lite = liteChk.checked; saveCfg(); applyLite(); log('Modo servidor (sem animações)', CFG.lite ? 'ON' : 'OFF'); };
    liteLbl.append(liteChk, el('span', null, 'Modo servidor (sem animações)')); modesCard.append(liteLbl);
    panes.auto.append(modesCard);

    // compras: tipo, mínimo para repor e quantidade por refill (bolas e poções)
    const supCard = card();
    supCard.append(el('div', 'pkb-h', 'Reposição'));
    const grid = el('div', 'pkb-grid'); grid.style.marginTop = '6px';
    const fld = (e, key, tip) => { e.className = 'pkb-in'; e.title = tip; e.value = CFG[key];
      e.onchange = () => { let v = e.value; if (e.type === 'number') { v = Math.max(e.min ? +e.min : 0, Math.min(+e.max || 9999, Math.floor(+v) || 0)); e.value = v; } CFG[key] = v; saveCfg(); log('config', key, '=', v); if (key === 'fps') applyFps(); if ((key === 'ball' || key === 'ballMin' || key === 'ballBuy') && ballState.last) renderBall(); }; return e; };
    const fsel = (list, key, tip) => fld(opt(document.createElement('select'), list), key, tip);
    const nbr = (key, tip, min, max) => { const i = document.createElement('input'); i.type = 'number'; i.min = min; i.max = max; return fld(i, key, tip); };
    const cell = t => el('div', 'pkb-cell', t);
    ballSelEl = fsel(BALLS.map(b => [b, b]), 'ball', 'Pokébola usada nos arremessos e reposta');
    ballSelEl.id = 'pkbot-ball-sel';
    ballMinEl = nbr('ballMin', 'Repor quando tiver este tanto ou menos', 0, 9999);
    ballMinEl.id = 'pkbot-ball-min';
    ballBuyEl = nbr('ballBuy', 'Quantidade comprada por refill', 1, 9999);
    ballBuyEl.id = 'pkbot-ball-buy';
    grid.append(cell(''), cell('item'), cell('mín.'), cell('comprar'),
      cell('Bola'), ballSelEl, ballMinEl, ballBuyEl,
      cell('Poção'), fsel([['auto', 'auto (em uso)'], ...POTIONS.map(p => [p, p])], 'potType', 'auto = repõe as poções que você está usando'), nbr('potMin', 'Repor quando tiver este tanto ou menos', 0, 9999), nbr('potBuy', 'Quantidade comprada por refill', 1, 9999));
    const fpsSel = fsel([[60, '60 (padrão do jogo)'], [30, '30'], [15, '15'], [10, '10 (recomendado)'], [5, '5'], [2, '2 (leve)'], [1, '1 (servidor)'], [0.2, '0.2 (mapa quase parado · captura ON)'], [0, 'sem limite']], 'fps', 'Limita apenas o desenho do mapa (canvas). A interface, cliques, combate, XP e captura ficam sempre em velocidade normal (60 FPS).');
    fpsSel.style.gridColumn = '2 / 5'; grid.append(cell('FPS'), fpsSel);
    supCard.append(grid); panes.auto.append(supCard);

    const logCard = el('details', 'pkb-card');
    logCard.append(el('summary', null, 'Registro'));
    logEl = el('pre', 'pkb-log'); logEl.style.marginTop = '6px';
    logCard.append(logEl); logEl.textContent = logLines.slice(-12).join('\n');
    panes.auto.append(logCard);

    // ===== aba Hunt (Modo 4: checkbox + foco + verificação manual; encadeia Hunt -> RMT -> Pokébola) =====
    const huntCard = card();
    const huntLbl = el('label', 'pkb-row');
    huntLbl.title = '4 Gerenciador de hunt (automático a cada 10 min; cada verificação também roda RMT e Analisador de Pokébola)';
    const huntChk = document.createElement('input');
    huntChk.type = 'checkbox'; huntChk.checked = !!st.hunt; huntChk.id = 'pkbot-hunt';
    huntChk.onchange = () => { st.hunt = huntChk.checked; save(); log('4 Gerenciador de hunt', huntChk.checked ? 'ON' : 'OFF'); if (huntChk.checked) huntState.next = 0; renderHunt(); ui.refresh(); };
    huntLbl.append(huntChk, el('span', 'pkb-num', '4'), el('span', 'pkb-h', 'Gerenciador de hunt'));
    huntFocusEl = sel('pkbot-hunt-focus', 'Foco automático do Gerenciador de Hunt: Equilibrado (XP + Lucro + Abates/Outland), XP, Lucro/Outland ou Shiny',
      [['balanced', 'Equilibrado'], ['xp', 'XP'], ['lucro', 'Lucro/Out'], ['shiny', 'Shiny']]);
    huntFocusEl.value = CFG.huntFocus;
    huntFocusEl.onchange = () => {
      CFG.huntFocus = huntFocusEl.value; saveCfg();
      log('hunt foco =', CFG.huntFocus);
      if (st.hunt) huntState.next = 0; // reavalia e troca automaticamente na hora
      renderHunt();
    };
    huntBtnEl = btn('pkbot-hunt-scan', 'Verificar', 'Roda verificação manual do Gerenciador de Hunt agora (+ Radar RMT e Analisador de Pokébola)', 'primary', () => runHuntCheck({ manual: true }));
    const huntCtl = bar(el('span', 'pkb-cell', 'Foco'), huntFocusEl, el('span', 'pkb-grow'), huntBtnEl);
    huntOutEl = out('pkbot-hunt-out');
    huntCard.append(huntLbl, huntCtl, huntOutEl); panes.hunt.append(huntCard);

    // ===== aba Bola: Analisador Otimizado de Pokébola =====
    const ballCard = card(); ballCard.id = 'pkbot-ball-box';
    ballFocusEl = sel('pkbot-ball-focus', 'Foco da recomendação: Equilibrado (lucro + Forte/Shiny), Dinheiro (máx lucro/h) ou Raro/Shiny',
      [['balanced', 'Equilibrado'], ['money', 'Dinheiro'], ['rare', 'Raro/Shiny']]);
    ballFocusEl.value = ballState.focus;
    ballFocusEl.onchange = () => { ballState.focus = ballFocusEl.value; saveBall(); renderBall(); };
    ballBtnEl = btn('pkbot-ball-scan', 'Analisar', 'Lê a hunt atual no Mapa + ficha da espécie na Pokedex + preços RMT e recomenda a melhor Pokébola', 'primary', () => analyzeCurrentHuntBalls());
    ballOutEl = out('pkbot-ball-out');
    ballCard.append(bar(secHead('Analisador Pokébola', 'Hunt atual: NPC + RMT + Shiny + ouro/h'), ballFocusEl, ballBtnEl), ballOutEl);
    panes.ball.append(ballCard);

    // ===== aba RMT: Radar (Ouro <-> Gema), passivo ao abrir RMT->Itens ou scan sob demanda =====
    const rmtCard = card(); rmtCard.id = 'pkbot-rmt-box';
    rmtDirEl = sel('pkbot-rmt-dir', 'Sentido do Radar RMT: Tudo (Ouro→Gema, Gema→Ouro e Trading), só Ouro→Gema, só Gema→Ouro ou só Trading',
      [['both', 'Tudo'], ['gold-to-gem', 'Ouro→Gema'], ['gem-to-gold', 'Gema→Ouro'], ['trading', 'Trading']]);
    rmtDirEl.value = CFG.rmtDir;
    rmtDirEl.onchange = () => { CFG.rmtDir = rmtDirEl.value; saveCfg(); renderRmt(); };
    rmtBtnEl = btn('pkbot-rmt-scan', 'Escanear', 'Lê books livres + média 7d dos 8 itens líquidos e analisa Ouro→Gema, Gema→Ouro e Trading', 'primary', () => scanRmt());
    rmtOutEl = out('pkbot-rmt-out');
    rmtCard.append(bar(secHead('Radar RMT', 'Ouro ⇄ Gema e trading'), rmtDirEl, rmtBtnEl), rmtOutEl);
    panes.rmt.append(rmtCard);

    // ===== aba Pedras: venda em Coins pelo máximo comprovado =====
    const stonesCard = card(); stonesCard.id = 'pkbot-stones-box';
    stonesPlanBtnEl = btn('pkbot-stones-plan', 'Simular', 'Lê suas pedras, o book livre e o histórico de vendas comprovadas sem anunciar', '', () => sellAllStones({ dryRun: true }));
    stonesSellBtnEl = btn('pkbot-stones-sell', 'Vender', 'Anuncia todas as pedras do inventário em Coins pelo melhor preço comprovado no mercado', 'go', () => sellAllStones({ dryRun: false }));
    stonesOutEl = out('pkbot-stones-out');
    stonesCard.append(bar(secHead('Venda de Pedras', 'RMT em Coins, pelo máximo comprovado'), stonesPlanBtnEl, stonesSellBtnEl), stonesOutEl);
    panes.stones.append(stonesCard);

    // ===== aba Venda: Analisador de Inventário (Gold vs Gema) =====
    const sellCard = card(); sellCard.id = 'pkbot-sell-box';
    sellLoadBtnEl = btn('pkbot-sell-load', 'Carregar', 'Lê os itens do inventário e Pokémons (RMT + Equipe) para escolher qual analisar', '', () => loadSellInventory());
    sellScanBtnEl = btn('pkbot-sell-scan', 'Analisar', 'Analisa o item ou Pokémon escolhido em Gold e em Gemas no RMT e indica qual vale mais a pena', 'primary', () => analyzeSelectedSale());
    sellSelEl = el('select', 'pkb-in'); sellSelEl.id = 'pkbot-sell-sel';
    sellSelEl.title = 'Escolha um item ou Pokémon do seu inventário para analisar';
    sellSelEl.onchange = () => {
      sellState.selectedKey = sellSelEl.value;
      sellState.qtyOverride = null;
      syncSellQtyInput();
      saveSell();
    };
    sellQtyEl = el('input', 'pkb-in'); sellQtyEl.id = 'pkbot-sell-qty';
    sellQtyEl.type = 'number'; sellQtyEl.min = 1; sellQtyEl.max = 999999;
    sellQtyEl.title = 'Quantidade do item a simular (padrão: todo o estoque)';
    sellQtyEl.style.cssText = 'width:64px;flex:0 0 64px;display:none';
    sellQtyEl.onchange = () => {
      const v = Math.max(1, Math.floor(+sellQtyEl.value) || 1);
      sellQtyEl.value = v;
      sellState.qtyOverride = v;
    };
    const sellCtrl = bar(sellSelEl, sellQtyEl); sellCtrl.style.marginTop = '6px';
    sellOutEl = out('pkbot-sell-out');
    sellCard.append(bar(secHead('Analisador de Venda', 'Gold × Gema'), sellLoadBtnEl, sellScanBtnEl), sellCtrl, sellOutEl);
    panes.sell.append(sellCard);

    p.append(head, strip, tabsEl, body);
    renderHunt();
    renderBall();
    renderRmt();
    renderStones();
    renderSell();

    const place = () => { // mantém inteiro dentro da janela sem cortar embaixo nem nas laterais
      p.style.maxHeight = Math.max(120, innerHeight - 16) + 'px';
      p.style.maxWidth = Math.max(200, innerWidth - 16) + 'px';
      const r = p.getBoundingClientRect();
      const maxX = Math.max(8, innerWidth - r.width - 8);
      const maxY = Math.max(8, innerHeight - r.height - 8);
      u.x = Math.min(Math.max(8, u.x ?? 8), maxX);
      u.y = Math.min(Math.max(8, u.y ?? maxY), maxY);
      p.style.left = u.x + 'px'; p.style.top = u.y + 'px';
    };
    const renderStatus = () => {
      const on = MODES.filter(k => st[k]).map(k => MODES.indexOf(k) + 1);
      dot.classList.toggle('pkb-on', on.length > 0);
      sub.textContent = on.length ? 'modos ' + on.join(' · ') : 'parado';
      pauseBtn.textContent = on.length ? '⏸' : '▶';
      pauseBtn.title = on.length ? 'Pausar todos os modos' : ((u.resume || []).length ? 'Retomar os modos pausados' : 'Nenhum modo para retomar');
      pauseBtn.disabled = !on.length && !(u.resume || []).length;
      const scr = energyNow();
      chipScreen.textContent = 'tela: ' + scr; chipScreen.classList.toggle('pkb-ok', scr === 'normal');
      chipHidden.style.display = document.hidden ? '' : 'none';
      chipDry.style.display = CFG.dry ? '' : 'none';
      tabBtns.hunt.classList.toggle('pkb-live', !!st.hunt);
      tabBtns.auto.classList.toggle('pkb-live', !!(st.capture || st.potions || st.eterna));
    };
    const render = () => {
      if (!panes[u.tab]) u.tab = 'auto';
      p.classList.toggle('pk-oculto', u.hidden); p.classList.toggle('pkb-min', u.min); p.style.display = u.hidden ? 'none' : 'flex';
      for (const [key] of TABS) { panes[key].hidden = key !== u.tab; tabBtns[key].classList.toggle('pkb-active', key === u.tab); }
      renderStatus();
      place();
    };
    ui.refresh = () => { for (const k of MODES) { const c = $('#pkbot-' + k); if (c) c.checked = !!st[k]; } render(); };
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => { if (!u.hidden) place(); }).observe(p);
    }
    setInterval(() => { if (!u.hidden) renderStatus(); }, 3000);

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
  const gems = () => num((($('#tr-gemas') || {}).textContent) || 0);
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
          maxCandidates: 24,
        })
      : Object.keys(all).slice(0, 24);
    const candSet = new Set(candSlugs);

    for (const rb of (regions.length ? regions : [null])) {
      const regId = rb ? (rb.dataset.regiao || '') : '';
      const regSlugs = (byRegion.get(regId) || []).filter(s => candSet.has(s));
      if (!regSlugs.length) continue;
      if (rb) { rb.click(); await sleep(380); }
      if (regId === 'outland') { selectBestOutlandTier(); await sleep(150); }
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
    if (huntFocusEl && huntFocusEl.value !== CFG.huntFocus) huntFocusEl.value = CFG.huntFocus;
    if (huntBtnEl) huntBtnEl.textContent = huntState.scanning ? 'Lendo...' : 'Verificar';
    huntOutEl.textContent = '';
    const mk = (tag, css, txt) => {
      const el = document.createElement(tag);
      if (css) el.style.cssText = css;
      if (txt != null) el.textContent = txt;
      return el;
    };
    if (statusMsg) {
      huntOutEl.style.display = '';
      huntOutEl.append(mk('div', 'color:#fd8', statusMsg));
      return;
    }
    const last = huntState.last;
    if (!st.hunt && (!last || !last.detailed)) {
      huntOutEl.style.display = 'none';
      return;
    }
    huntOutEl.style.display = '';
    if (!last || !last.detailed || !Object.keys(last.detailed).length) {
      huntOutEl.append(mk('div', 'color:#9ab', 'Aguardando avaliação automática...'));
      return;
    }
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
    const top = (dec.ranked || []).slice(0, 3);
    const best = top[0];
    if (!best) return;
    const fmt = PK_HUNT.formatCompact;
    const bs = best.sim || {};
    const badge = best.isOutland ? ' [OUT]' : '';
    const tieTag = dec.tieBroken ? ' · desempate' : '';
    const potTxt = (bs.potionsH || 0) >= 1 ? ` · ${Math.round(bs.potionsH)}pot` : '';
    huntOutEl.append(mk('div', 'color:#8f9',
      `${st.hunt ? 'Auto' : 'Melhor'}: ${best.displayName || best.nome} Nv${best.level || '?'}${badge}${tieTag}`));
    huntOutEl.append(mk('div', 'color:#bcd;font-size:9px',
      `${fmt(bs.xpH)} xp/h · ${fmt(bs.netGoldH)} líq/h · ${bs.kph || 0}/h${potTxt}`));
    if (top.length > 1) {
      const alts = top.slice(1).map(h => `${h.displayName || h.nome} (${fmt(h.sim?.xpH)} xp, ${fmt(h.sim?.netGoldH)} líq)`).join(' · ');
      huntOutEl.append(mk('div', 'color:#89a;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis', `Alt: ${alts}`));
    }
  }

  async function analyzeHunts({ autoSwitch = true, manual = false, includeFollowUps = true } = {}) {
    if (huntState.scanning) return null;
    if (busy) {
      if (manual) renderHunt('Aguarde: outra ação em andamento.');
      return null;
    }
    huntState.scanning = true; busy = true;
    renderHunt(manual ? 'Verificando hunts manualmente...' : 'Avaliando hunts automaticamente...');
    let voltarUltra = false;
    try {
      voltarUltra = await leaveUltra();
      const onHunt = inHunt(), onCenter = inCenter();
      if (!onHunt && !onCenter) {
        huntState.next = Date.now() + 15000; // jogo ainda conectando ou em Safari/Boss/Casa: recheca em 15s
        log('hunt: fora de hunt/Centro (Safari/Boss/Casa) — aguardando');
        renderHunt();
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
        renderHunt('Sem dados do Mapa (tento em 30s).');
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
        trainerLevel: autoCtx.trLv,
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
        const tieNote = dec.tieBroken ? ' [desempate]' : '';
        log(`hunt[${CFG.huntFocus}] ${player.name} Nv${player.level} | melhor: ${best.displayName || best.nome} Nv${best.level}${tieNote} (${fmt(bs.xpH)} xp/h, ${fmt(bs.netGoldH)} líq/h, ${bs.kph}/h, ${Math.round(bs.potionsH || 0)} pot/h)`
          + ` | atual: ${onCenter ? 'Centro' : (cur || '?')}${current ? ` (${fmt(cs.xpH)} xp/h, ${fmt(cs.netGoldH)} líq/h, ${cs.kph}/h)` : ''}`);
      }
      renderHunt();
      if (autoSwitch && dec.action === 'switch' && best) {
        const ok = await switchTo(best.slug, best.nome, effCurSlug, { checkStop: () => !manual && !st.hunt, regiao: best.regiao });
        if (ok && huntState.last) { huntState.last.curSlug = best.slug; huntState.last.curName = best.nome; saveHunt(); renderHunt(); }
      }
      if (includeFollowUps) {
        renderHunt('Atualizando Radar RMT...');
        await scanRmt({ nested: true });
        if (inHunt()) {
          renderHunt('Analisando Pokébola da hunt...');
          await analyzeCurrentHuntBalls({ nested: true });
        } else {
          log('analisador: pulado pós-hunt (fora de hunt ativa)');
        }
      }
      return dec;
    } catch (e) {
      log('hunt erro:', e.message);
      renderHunt('Erro na avaliação: ' + e.message);
      return null;
    } finally {
      await closeModal();
      if (voltarUltra) await reenterUltra();
      huntState.scanning = false;
      busy = false;
      renderHunt();
      renderRmt();
      renderBall();
    }
  }

  async function runHuntCheck({ manual = true, autoSwitch = true } = {}) {
    if (st.hunt) huntState.next = Date.now() + CFG.huntEvalMs;
    return analyzeHunts({ autoSwitch, manual, includeFollowUps: true });
  }

  async function huntTick() {
    if (!st.hunt || busy) return;
    // Monitor passivo (custo zero): dispara reavaliação imediata se trocou ativo, evoluiu, subiu patamar ou está no Centro
    if (Date.now() < huntState.next && huntState.last && energyNow() !== 'ultra') {
      const cardEl = $('#ativo-card');
      const card = PK_HUNT.parseActiveCard({ text: cardEl ? (cardEl.innerText || '') : '', types: myTypes() });
      const prev = {
        name: huntState.last.player?.name || '',
        types: huntState.last.player?.types || [],
        trainerLevel: huntState.last.trainerLevel || 0,
      };
      const cur = { name: card.name, types: card.types, trainerLevel: trainerLevel() };
      const check = PK_HUNT.shouldAutoReeval({ prev, cur, inCenter: inCenter() });
      if (check.reeval) {
        log('hunt auto-reavaliação:', check.reason);
        huntState.next = 0;
      }
    }
    if (Date.now() < huntState.next) return;
    huntState.next = Date.now() + CFG.huntEvalMs;
    await analyzeHunts({ autoSwitch: true, manual: false, includeFollowUps: true });
  }

  // ---------- 5: Radar RMT (Ouro <-> Gema, passivo + scan sob demanda com plano de ação) ----------
  let lastRmtGold = -1;
  let lastRmtGems = -1;
  let rmtRankingOpen = false;
  let rmtReverseRankingOpen = false;
  let rmtTradeListOpen = false;
  function renderRmt(statusMsg) {
    if (!rmtOutEl || typeof PK_RMT === 'undefined') return;
    if (rmtBtnEl) rmtBtnEl.textContent = rmtState.scanning ? 'Lendo...' : 'Escanear';
    if (rmtDirEl && rmtDirEl.value !== CFG.rmtDir) rmtDirEl.value = CFG.rmtDir;
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
      rmtOutEl.append(mk('div', 'color:#aab', 'Clique em Escanear para ver Ouro→Gema, Gema→Ouro e oportunidades de Trading (itens fungíveis).'));
      return;
    }
    const curGold = gold();
    const curGems = gems();
    lastRmtGold = curGold;
    lastRmtGems = curGems;
    const showG2Gem = CFG.rmtDir === 'both' || CFG.rmtDir === 'gold-to-gem';
    const showGem2G = CFG.rmtDir === 'both' || CFG.rmtDir === 'gem-to-gold';
    const showTrade = CFG.rmtDir === 'both' || CFG.rmtDir === 'trading';
    const plan = showG2Gem ? PK_RMT.buildActionPlan({ routes: d.routes, gold: curGold, source: d.source }) : null;
    const revPlan = showGem2G ? PK_RMT.buildGemToGoldActionPlan({ routes: d.routes, gems: curGems, source: d.source }) : null;
    const tradePlanRaw = showTrade ? PK_RMT.buildTradingPlan({ routes: d.routes, gold: curGold, gems: curGems, source: d.source }) : null;
    const tradePlan = tradePlanRaw && typeof PK_TIMING !== 'undefined' ? PK_TIMING.annotateTrading(tradePlanRaw, d.routes, rmtHist, { currentAt: d.at }) : tradePlanRaw;
    if (!plan && !revPlan && !tradePlan) {
      rmtOutEl.append(mk('div', 'color:#aab', 'Sem rotas válidas no último scan.'));
      return;
    }
    const ageMin = Math.max(0, Math.round((Date.now() - d.at) / 60000));
    const tag = d.source === 'book' ? 'books livres' : '~estimado (clique Escanear)';
    const both = CFG.rmtDir === 'both';

    const renderTimingBanner = (parent, dir, focusId) => {
      if (typeof PK_TIMING === 'undefined') return null;
      const adv = PK_TIMING.adviseTiming(d.routes, rmtHist, dir, { currentAt: d.at, focusId });
      const color = adv.verdict === 'NOW' ? '#6f9' : (adv.verdict === 'WAIT' ? '#f96' : (adv.verdict === 'NEUTRAL' ? '#8ef' : '#aab'));
      const icon = adv.verdict === 'NOW' ? '▲' : (adv.verdict === 'WAIT' ? '⏳' : (adv.verdict === 'NEUTRAL' ? '●' : '?'));
      const box = mk('div', `margin-top:3px;padding:3px 6px;border-radius:5px;border:1px solid ${color}77;background:${color}18`);
      box.append(mk('div', `font-weight:bold;color:${color}`, `${icon} TIMING: ${adv.headline}`));
      const extra = [];
      if (adv.best && adv.best.reasons && adv.best.reasons.length) extra.push(adv.best.reasons.join(' · '));
      if (adv.bestWindow) extra.push(`melhor janela do dia: ${adv.bestWindow}`);
      const nHist = adv.focus && adv.best ? (adv.best.n || 0) : Math.max(0, ...Object.values(adv.byId).map(a => a.n || 0));
      extra.push(`histórico: ${nHist} leitura(s)`);
      box.append(mk('div', 'color:#bcd;font-size:9px;margin-top:1px', extra.join(' · ')));
      parent.append(box);
      return adv;
    };

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

    if (both) {
      rmtOutEl.append(mk('div', 'color:#9ab;font-size:9px;margin-bottom:3px', `${tag}, ${ageMin}m · Saldo: ${PK_RMT.formatCoins(curGold)} · ${PK_RMT.formatGems(curGems)}`));
    }

    if (plan) {
      const wrap = mk('div', both ? 'padding-bottom:5px' : '');
      if (both) wrap.append(mk('div', 'font-weight:bold;color:#fd8;font-size:10px;letter-spacing:.3px;margin-bottom:1px', 'OURO → GEMA (menor Coins/Gema)'));
      const headColor = plan.verdict === 'BUY_NOW' ? '#6f9' : '#fd8';
      wrap.append(mk('div', `font-weight:bold;color:${headColor}`, plan.headline));
      wrap.append(mk('div', 'color:#bcd;font-size:9.5px', both ? plan.summary : `${plan.summary} · ${tag}, ${ageMin}m`));
      const advG = renderTimingBanner(wrap, 'gold-to-gem', plan.primary && plan.primary.routeId);

      if (plan.verdict === 'BUY_NOW' && plan.primary) {
        wrap.append(renderStepCard(`PLANO COM SEUS ${PK_RMT.formatCoins(curGold)}`, plan.primary, '#6f9', '#16332288'));
        if (plan.goal) {
          wrap.append(mk('div', 'margin-top:3px;color:#aab;font-size:9px',
            `Taxa bruta maior (outra opção): ${plan.goal.label} (${PK_RMT.formatCoins(plan.goal.coinsPerGem)}/G · falta ${PK_RMT.formatCoins(plan.goal.missingCoins)})`));
        }
      } else if (plan.verdict === 'SAVE_OR_BUY') {
        if (plan.primary) {
          wrap.append(renderStepCard(
            `META RECOMENDADA (falta +${PK_RMT.formatCoins(plan.primary.missingCoins)})`,
            plan.primary, '#fd8', '#332b1488'
          ));
        }
        if (plan.bestOverall) {
          wrap.append(mk('div', 'margin-top:3px;color:#aab;font-size:9px',
            `Taxa bruta maior (outra opção): ${plan.bestOverall.label} (${PK_RMT.formatCoins(plan.bestOverall.coinsPerGem)}/G · falta +${PK_RMT.formatCoins(plan.bestOverall.missingCoins)})`));
        }
        if (plan.fallback) {
          wrap.append(renderStepCard(
            `SE QUISER CONVERTER JÁ (${PK_RMT.formatCoins(curGold)} · -${plan.lossPct}% gemas)`,
            plan.fallback, '#7cf', '#14263688'
          ));
        }
      } else if (plan.verdict === 'SAVE_ONLY') {
        if (plan.primary) {
          wrap.append(renderStepCard(
            `META ÓTIMA (falta +${PK_RMT.formatCoins(plan.primary.missingCoins)})`,
            plan.primary, '#fd8', '#332b1488'
          ));
        }
        if (plan.bestOverall) {
          wrap.append(mk('div', 'margin-top:3px;color:#aab;font-size:9px',
            `Taxa bruta maior (outra opção): ${plan.bestOverall.label} (${PK_RMT.formatCoins(plan.bestOverall.coinsPerGem)}/G · falta +${PK_RMT.formatCoins(plan.bestOverall.missingCoins)})`));
        }
        if (plan.fallback) {
          wrap.append(renderStepCard(
            `1ª ENTRADA (falta +${PK_RMT.formatCoins(plan.fallback.missingCoins)})`,
            plan.fallback, '#7cf', '#14263688'
          ));
        }
      }

      const det = document.createElement('details');
      det.open = rmtRankingOpen;
      det.style.cssText = 'margin-top:4px;border-top:1px solid #fff2;padding-top:3px';
      det.ontoggle = () => { rmtRankingOpen = det.open; };
      det.append(mk('summary', 'cursor:pointer;color:#aab;font-size:9.5px', `Ranking Ouro→Gema (${plan.ranked.length} itens)`));
      for (const r of plan.ranked) {
        const ok = curGold >= r.buyCoins ? '✓' : '○';
        const warn = r.warnings && r.warnings.length ? ' !' + r.warnings[0] : '';
        const tb = advG ? PK_TIMING.badge(advG.byId[r.id]) : '';
        det.append(mk('div', `color:${ok === '✓' ? '#cfd' : '#9aa'};font-size:9.5px;margin-top:1px`,
          `${ok} ${r.label}: ${PK_RMT.formatCoins(r.coinsPerGem)}/G (${PK_RMT.formatCoins(r.buyCoins)}→${r.sellGems}G)${tb ? ' ' + tb : ''}${warn}`));
      }
      wrap.append(det);
      rmtOutEl.append(wrap);
    }

    if (revPlan) {
      const wrap = mk('div', both ? 'margin-top:5px;padding-top:5px;border-top:1px dashed #8ef5' : '');
      if (both) wrap.append(mk('div', 'font-weight:bold;color:#8ef;font-size:10px;letter-spacing:.3px;margin-bottom:1px', 'GEMA → OURO (maior Coins/Gema líq.)'));
      const headColor = revPlan.verdict === 'BUY_NOW' ? '#6f9' : '#8ef';
      wrap.append(mk('div', `font-weight:bold;color:${headColor}`, revPlan.headline));
      wrap.append(mk('div', 'color:#bcd;font-size:9.5px', both ? revPlan.summary : `${revPlan.summary} · ${tag}, ${ageMin}m`));
      const advR = renderTimingBanner(wrap, 'gem-to-gold', revPlan.primary && revPlan.primary.routeId);

      if (revPlan.verdict === 'BUY_NOW' && revPlan.primary) {
        wrap.append(renderStepCard(`PLANO COM SUAS ${PK_RMT.formatGems(curGems)}`, revPlan.primary, '#6f9', '#16332288'));
        if (revPlan.goal) {
          wrap.append(mk('div', 'margin-top:3px;color:#aab;font-size:9px',
            `Taxa bruta maior (outra opção): ${revPlan.goal.label} (${PK_RMT.formatCoins(revPlan.goal.netCoinsPerGem)}/G · falta ${PK_RMT.formatGems(revPlan.goal.missingGems)})`));
        }
      } else if (revPlan.verdict === 'SAVE_OR_BUY') {
        if (revPlan.primary) {
          wrap.append(renderStepCard(
            `META RECOMENDADA (falta +${PK_RMT.formatGems(revPlan.primary.missingGems)})`,
            revPlan.primary, '#8ef', '#142a3688'
          ));
        }
        if (revPlan.bestOverall) {
          wrap.append(mk('div', 'margin-top:3px;color:#aab;font-size:9px',
            `Taxa bruta maior (outra opção): ${revPlan.bestOverall.label} (${PK_RMT.formatCoins(revPlan.bestOverall.netCoinsPerGem)}/G · falta +${PK_RMT.formatGems(revPlan.bestOverall.missingGems)})`));
        }
        if (revPlan.fallback) {
          wrap.append(renderStepCard(
            `SE QUISER CONVERTER JÁ (${PK_RMT.formatGems(curGems)} · -${revPlan.lossPct}% ouro)`,
            revPlan.fallback, '#fd8', '#332b1488'
          ));
        }
      } else if (revPlan.verdict === 'SAVE_ONLY') {
        if (revPlan.primary) {
          wrap.append(renderStepCard(
            `META ÓTIMA (falta +${PK_RMT.formatGems(revPlan.primary.missingGems)})`,
            revPlan.primary, '#8ef', '#142a3688'
          ));
        }
        if (revPlan.bestOverall) {
          wrap.append(mk('div', 'margin-top:3px;color:#aab;font-size:9px',
            `Taxa bruta maior (outra opção): ${revPlan.bestOverall.label} (${PK_RMT.formatCoins(revPlan.bestOverall.netCoinsPerGem)}/G · falta +${PK_RMT.formatGems(revPlan.bestOverall.missingGems)})`));
        }
        if (revPlan.fallback) {
          wrap.append(renderStepCard(
            `1ª ENTRADA (falta +${PK_RMT.formatGems(revPlan.fallback.missingGems)})`,
            revPlan.fallback, '#fd8', '#332b1488'
          ));
        }
      }

      const det = document.createElement('details');
      det.open = rmtReverseRankingOpen;
      det.style.cssText = 'margin-top:4px;border-top:1px solid #fff2;padding-top:3px';
      det.ontoggle = () => { rmtReverseRankingOpen = det.open; };
      det.append(mk('summary', 'cursor:pointer;color:#aab;font-size:9.5px', `Ranking Gema→Ouro (${revPlan.ranked.length} itens)`));
      for (const r of revPlan.ranked) {
        const ok = curGems >= r.buyGems ? '✓' : '○';
        const warn = r.reverseWarnings && r.reverseWarnings.length ? ' !' + r.reverseWarnings[0] : '';
        const tb = advR ? PK_TIMING.badge(advR.byId[r.id]) : '';
        det.append(mk('div', `color:${ok === '✓' ? '#cef' : '#9aa'};font-size:9.5px;margin-top:1px`,
          `${ok} ${r.label}: ${PK_RMT.formatCoins(r.netCoinsPerGem)}/G (${r.buyGems}G→${PK_RMT.formatCoins(r.netCoinsUnit)} líq.)${tb ? ' ' + tb : ''}${warn}`));
      }
      wrap.append(det);
      rmtOutEl.append(wrap);
    }

    if (tradePlan) {
      const wrap = mk('div', both ? 'margin-top:5px;padding-top:5px;border-top:1px dashed #c9f5' : '');
      if (both) wrap.append(mk('div', 'font-weight:bold;color:#d9f;font-size:10px;letter-spacing:.3px;margin-bottom:1px', 'TRADING (arbitragem & flip)'));
      const headColor = tradePlan.verdict === 'PROFITABLE' ? '#6f9' : (tradePlan.verdict === 'WAIT' ? '#f96' : (tradePlan.verdict === 'RISKY' ? '#fd8' : '#aab'));
      wrap.append(mk('div', `font-weight:bold;color:${headColor}`, tradePlan.headline));
      wrap.append(mk('div', 'color:#bcd;font-size:9.5px', both ? tradePlan.summary : `${tradePlan.summary} · ${tag}, ${ageMin}m`));

      if (tradePlan.best) {
        const b = tradePlan.best;
        const accent = tradePlan.verdict === 'PROFITABLE' ? '#6f9' : (tradePlan.verdict === 'WAIT' ? '#f96' : '#fd8');
        const bg = tradePlan.verdict === 'PROFITABLE' ? '#16332288' : '#332b1488';
        const box = mk('div', `margin-top:4px;padding:4px 6px;border-radius:5px;background:${bg};border:1px solid ${accent}55`);
        const capTag = b.affordable ? b.capitalText : `${b.capitalText} (${b.missingText})`;
        box.append(mk('div', `font-weight:bold;color:${accent};margin-bottom:2px`, `${b.subtitle} · ${capTag}`));
        const row = (lbl, val, valCss = 'color:#fff') => {
          const line = mk('div', 'margin-top:1px;word-break:break-word');
          line.append(mk('span', 'color:#aab;font-weight:bold', lbl + ' '), mk('span', valCss, val));
          return line;
        };
        box.append(row('1:', b.step1, 'color:#fff'));
        box.append(row('2:', b.step2, 'color:#bfa'));
        box.append(row('LUCRO:', b.profitText + (b.roiAtAvg7dPct != null ? ` · média 7d: ${b.roiAtAvg7dPct >= 0 ? '+' : ''}${b.roiAtAvg7dPct.toFixed(1).replace('.', ',')}%` : ''), `color:${accent};font-weight:bold`));
        if (b.timing && b.timing.scorePct != null) {
          const tc = b.timing.verdict === 'NOW' ? '#6f9' : (b.timing.verdict === 'WAIT' ? '#f96' : '#8ef');
          box.append(mk('div', `margin-top:2px;color:${tc};font-size:9px`, `${PK_TIMING.badge(b.timing)} TIMING: ${b.timing.reasons.join(' · ')}`));
        }
        if (b.risks && b.risks.length) {
          box.append(mk('div', 'margin-top:2px;color:#fc9;font-size:9px', '⚠ ' + b.risks.join(' · ')));
        }
        wrap.append(box);
      }

      if (tradePlan.opportunities && tradePlan.opportunities.length > 1) {
        const det = document.createElement('details');
        det.open = rmtTradeListOpen;
        det.style.cssText = 'margin-top:4px;border-top:1px solid #fff2;padding-top:3px';
        det.ontoggle = () => { rmtTradeListOpen = det.open; };
        det.append(mk('summary', 'cursor:pointer;color:#aab;font-size:9.5px', `Outras rotas de trading (${tradePlan.opportunities.length})`));
        for (const op of tradePlan.opportunities) {
          const badge = op.confidence === 'high' ? '●' : (op.confidence === 'medium' ? '◐' : '○');
          const c = op.confidence === 'low' ? '#9aa' : '#dfd';
          det.append(mk('div', `color:${c};font-size:9.5px;margin-top:1px`,
            `${badge} ${op.title}: ${op.profitText}${op.timing && op.timing.scorePct != null ? ' ' + PK_TIMING.badge(op.timing) : ''}${op.risks.length ? ' !' + op.risks[0] : ''}`));
        }
        wrap.append(det);
      }
      rmtOutEl.append(wrap);
    }
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
    const curGems = gems();
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
        gemasOffer: { bestPrice: gVal, unitsAtBest: 0, totalFreeUnits: 0, skippedTroll: 0 },
        gold: curGold,
        gems: curGems,
        source: 'list',
      });
      if (r) routes.push(r);
    }
    const ranked = PK_RMT.rankRoutes(routes);
    if (ranked.length) {
      rmtState.last = { at: now, gold: curGold, gems: curGems, source: 'list', routes: ranked };
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

  function parseRmtItemMedia(painel) {
    if (!painel || typeof PK_RMT === 'undefined' || !PK_RMT.parseAvg7d) return { avg7d: null, vol7d: null };
    const mediaText = ($('.cmp-media', painel) || {}).textContent || '';
    return PK_RMT.parseAvg7d(mediaText);
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
        const media = parseRmtItemMedia(painel);
        const sig = sigOf(list);
        if (opOn && list.length && (!prevSig || sig !== prevSig || Date.now() - t0 >= 850)) return { list, ...media };
        if (opOn && list.length === 0 && !/carregando|loading/i.test(painel.textContent || '') && Date.now() - t0 >= 900) return { list: [], ...media };
      }
      await sleep(200);
    }
    const m = $('.modal-caixa[data-modal="community"]');
    const painel = m && $('.cmi-painel', $('#modal-corpo', m) || m);
    return { list: parseRmtItemBook(painel), ...parseRmtItemMedia(painel) };
  }

  async function scanRmt({ nested = false } = {}) {
    if (typeof PK_RMT === 'undefined') return log('RMT: módulo PK_RMT indisponível');
    if (rmtState.scanning) return;
    if (!nested && energyNow() === 'ultra') {
      renderRmt('Saia do modo ULTRA para escanear o RMT.');
      return log('RMT: em modo ULTRA (não sai sozinho)');
    }
    if (!nested && busy) { renderRmt('Aguarde: outra ação em andamento.'); return; }
    if (!nested) busy = true;
    rmtState.scanning = true;
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
      const curGems = gems();
      const routes = [];
      corpo = getCorpo(); if (!corpo) return;
      const targetNames = $$('.cmi-linha', corpo)
        .map(row => ($('.cmi-nome b', row) || {}).textContent?.trim())
        .filter(name => PK_RMT.matchLiquidItem(name));

      const totalSteps = targetNames.length;

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
          const gRes = await waitForItemBook(true, beforeItemSig);
          gemasOffer = Object.assign(PK_RMT.pickBestFreeOffer(gRes.list, 2), { avg7d: gRes.avg7d, vol7d: gRes.vol7d });
          const gSig = gRes.list.slice(0, 3).map(o => `${o.price}:${o.qty}:${o.held ? 1 : 0}`).join('|');
          const bC2 = $$('button.cmp-op', $('.cmi-painel', getCorpo() || document) || document).find(b => /coins/i.test(b.textContent));
          if (bC2) {
            bC2.click();
            const cRes = await waitForItemBook(false, gSig);
            coinsOffer = Object.assign(PK_RMT.pickBestFreeOffer(cRes.list, item.minSanityCoins), { avg7d: cRes.avg7d, vol7d: cRes.vol7d });
          }
        } else {
          if (btnC) {
            if (!btnC.classList.contains('on')) btnC.click();
            const cRes = await waitForItemBook(false, beforeItemSig);
            coinsOffer = Object.assign(PK_RMT.pickBestFreeOffer(cRes.list, item.minSanityCoins), { avg7d: cRes.avg7d, vol7d: cRes.vol7d });
            const cSig = cRes.list.slice(0, 3).map(o => `${o.price}:${o.qty}:${o.held ? 1 : 0}`).join('|');
            const bG2 = $$('button.cmp-op', $('.cmi-painel', getCorpo() || document) || document).find(b => /gema|gem/i.test(b.textContent));
            if (bG2) {
              bG2.click();
              const gRes = await waitForItemBook(true, cSig);
              gemasOffer = Object.assign(PK_RMT.pickBestFreeOffer(gRes.list, 2), { avg7d: gRes.avg7d, vol7d: gRes.vol7d });
            }
          }
        }
        const r = PK_RMT.evaluateItemRoute({ item, coinsOffer, gemasOffer, gold: curGold, gems: curGems, source: 'book' });
        if (r) routes.push(r);
      }

      const ranked = PK_RMT.rankRoutes(routes);
      rmtState.last = { at: Date.now(), gold: curGold, gems: curGems, source: 'book', routes: ranked };
      saveRmt();
      if (ranked.length) { rmtHist = PK_TIMING.recordSnapshot(rmtHist, ranked, rmtState.last.at); saveRmtHist(); }
      if (ranked.length) {
        const plan = PK_RMT.buildActionPlan({ routes: ranked, gold: curGold, source: 'book' });
        const revPlan = PK_RMT.buildGemToGoldActionPlan({ routes: ranked, gems: curGems, source: 'book' });
        const tradePlan = PK_RMT.buildTradingPlan({ routes: ranked, gold: curGold, gems: curGems, source: 'book' });
        const revTop = revPlan?.ranked?.[0];
        const parts = ['RMT:', plan.headline, '|', plan.primary?.buyText || ranked[0].label];
        if (revTop) parts.push('| Gema→Ouro:', `${revTop.label} (${PK_RMT.formatCoins(revTop.netCoinsPerGem)}/G líq.)`);
        if (tradePlan) parts.push('| Trading:', tradePlan.headline);
        parts.push('| Timing O→G:', PK_TIMING.adviseTiming(ranked, rmtHist, 'gold-to-gem', { currentAt: rmtState.last.at, focusId: plan.primary && plan.primary.routeId }).verdict);
        log(...parts);
      } else {
        log('RMT: nenhuma rota válida lida');
      }
    } catch (e) {
      log('RMT erro:', e.message);
      renderRmt('Erro no scan RMT: ' + e.message);
      return;
    } finally {
      if (!wasOpen) await closeModal();
      rmtState.scanning = false;
      if (!nested) busy = false;
      renderRmt();
      if (ballState.last) renderBall();
    }
  }

  // ---------- 6: Venda de Pedras (RMT — Coins, máximo comprovado) ----------
  function renderStones(statusMsg) {
    if (!stonesOutEl || typeof PK_STONES === 'undefined') return;
    if (stonesPlanBtnEl) stonesPlanBtnEl.disabled = stoneState.running;
    if (stonesSellBtnEl) {
      stonesSellBtnEl.disabled = stoneState.running;
      stonesSellBtnEl.textContent = stoneState.running ? 'Rodando...' : 'Vender';
    }
    const mk = (tag, css, text) => { const el = document.createElement(tag); if (css) el.style.cssText = css; if (text != null) el.textContent = text; return el; };
    stonesOutEl.textContent = '';
    if (statusMsg) {
      stonesOutEl.append(mk('div', 'color:#8ef', statusMsg));
      return;
    }
    const d = stoneState.last;
    if (!d) {
      stonesOutEl.append(mk('div', 'opacity:.7', 'Clique "Simular" para prévia ou "Vender" para anunciar todas as pedras do inventário em Coins.'));
      return;
    }
    const ageMin = Math.max(0, Math.round((Date.now() - d.at) / 60000));
    const modeTag = d.dryRun ? 'simulação' : 'venda';
    const sum = d.summary || PK_STONES.summarizePlan(d.items || []);
    const listedCount = (d.items || []).filter(i => i.execStatus === 'listed').length;
    const headTxt = d.items && d.items.length
      ? `${modeTag} · há ${ageMin}min · ${d.dryRun ? `${sum.sellTypes}/${sum.totalTypes} pedras` : `${listedCount}/${sum.sellTypes} anunciadas`} (${sum.totalUnits} un.) · líq. ${PK_STONES.formatCoins(sum.totalNet)}`
      : `${modeTag} · há ${ageMin}min · nenhuma pedra disponível no inventário`;
    stonesOutEl.append(mk('div', 'opacity:.75;font-size:9.5px;margin-bottom:3px', headTxt));

    for (const it of (d.items || [])) {
      const row = mk('div', 'padding:2px 0;border-bottom:1px solid #fff1');
      let badge = '';
      let color = '#dfe';
      if (it.execStatus === 'listed') { badge = '✅'; color = '#8f8'; }
      else if (it.execStatus === 'dry') { badge = '👁'; color = '#8ef'; }
      else if (it.execStatus === 'error') { badge = '⚠'; color = '#f96'; }
      else if (it.action === 'skip' || it.execStatus === 'skipped') { badge = '⏭'; color = '#fc8'; }
      const priceStr = it.price ? `${it.price.toLocaleString('pt-BR')}/un.` : '—';
      const netStr = it.net ? ` → líq. ${PK_STONES.formatCoins(it.net)}` : '';
      const line1 = `${badge} ${it.name} ×${it.qty}: ${priceStr}${netStr}`;
      row.append(mk('div', `color:${color}`, line1));
      const detailParts = [];
      if (it.execDetail) detailParts.push(it.execDetail);
      else if (it.reason) detailParts.push(it.reason);
      if (it.bestFree) detailParts.push(`livre ${it.bestFree.toLocaleString('pt-BR')}`);
      if (it.avg7d) detailParts.push(`7d ${it.avg7d.toLocaleString('pt-BR')}`);
      if (it.maxProvenRecent) detailParts.push(`máx.rec ${it.maxProvenRecent.toLocaleString('pt-BR')}`);
      row.append(mk('div', 'opacity:.68;font-size:9px', detailParts.join(' · ')));
      stonesOutEl.append(row);
    }
  }

  async function closeRmtLeaf(maxMs = 1500) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const leaf = $('.cm-folha');
      if (!leaf || !leaf.offsetParent) return true;
      const btn = $('.cm-fechar', leaf) || $$('button', leaf).find(b => b.offsetParent && b.textContent.trim() === '×');
      if (btn) btn.click();
      await sleep(220);
    }
    return !($('.cm-folha') && $('.cm-folha').offsetParent);
  }

  function parseStoneBook(painel) {
    if (!painel) return { offers: [], avg7d: null, vol7d: null };
    const mediaText = ($('.cmp-media', painel) || {}).textContent || '';
    const { avg7d, vol7d } = PK_STONES.parseAvg7d(mediaText);
    const offers = [];
    for (const row of $$('.cmv-linha', painel)) {
      const qtyTxt = ($('.cmv-qtd', row) || {}).textContent || '';
      const priceTxt = ($('.cmv-preco .cm-preco', row) || $('.cmv-preco', row) || {}).textContent || '';
      const seller = ($('.cmv-quem', row) || {}).textContent?.trim() || '';
      const qty = PK_STONES.parseIntClean(qtyTxt) || 1;
      const price = PK_STONES.parseIntClean(priceTxt);
      const buyBtn = $('.cmv-comprar', row);
      const dmBtn = $('.cmv-dm', row);
      const held = !!($('.cm-retido, [data-retido-ate]', row)) || /retid|held/i.test(buyBtn ? buyBtn.textContent : '');
      const own = !buyBtn && !dmBtn;
      if (price) offers.push({ price, qty, held, own, seller });
    }
    return { offers, avg7d, vol7d };
  }

  async function waitForStoneBook(itemId, maxMs = 2600) {
    const t0 = Date.now();
    const idStr = String(itemId);
    while (Date.now() - t0 < maxMs) {
      const m = $('.modal-caixa[data-modal="community"]');
      const corpo = m && ($('#modal-corpo', m) || m);
      const painel = corpo && $('.cmi-painel', corpo);
      if (painel) {
        const fav = $('.cm-fav[data-fav-item]', painel);
        const rightItem = !fav || fav.dataset.favItem === idStr;
        const coinBtn = $('.cmp-op[data-swmoeda="gold"]', painel)
          || $$('button.cmp-op', painel).find(b => /coins/i.test(b.textContent));
        if (rightItem && coinBtn && !coinBtn.classList.contains('on')) {
          coinBtn.click();
          await sleep(260);
          continue;
        }
        if (rightItem && (!coinBtn || coinBtn.classList.contains('on'))) {
          const parsed = parseStoneBook(painel);
          if (parsed.offers.length || (parsed.avg7d != null && Date.now() - t0 >= 650)) return parsed;
          if (!/carregando|loading/i.test(painel.textContent || '') && Date.now() - t0 >= 900) return parsed;
        }
      }
      await sleep(180);
    }
    const m = $('.modal-caixa[data-modal="community"]');
    const painel = m && $('.cmi-painel', $('#modal-corpo', m) || m);
    return parseStoneBook(painel);
  }

  async function readStoneHistoryCoins(getCorpo, maxPages = 6) {
    const salesByStone = new Map();
    const corpo = getCorpo();
    const btnHist = corpo && $('#cm-historico-global', corpo);
    if (!btnHist) return salesByStone;
    btnHist.click();
    const leaf = await waitForSelector('.cm-folha', () => document, 2200);
    if (!leaf) return salesByStone;
    await sleep(300);

    // Filtra Itens + Coins (re-consultando nós a cada clique)
    const clickHistFilter = async re => {
      const f = $('.cm-folha');
      const b = f && $$('button.cm-filtro', f).find(el => re.test(el.textContent.trim()));
      if (b && !b.classList.contains('on')) { b.click(); await sleep(450); }
    };
    await clickHistFilter(/^(itens|items)$/i);
    await clickHistFilter(/^(coins|ouro)$/i);

    let prevSig = '';
    for (let page = 1; page <= maxPages; page++) {
      const f = $('.cm-folha');
      if (!f) break;
      const rows = $$('.cm-hist-linha', f);
      const sig = rows.slice(0, 3).map(r => r.textContent.trim()).join('|');
      if (!rows.length || (page > 1 && sig === prevSig)) break;
      prevSig = sig;
      for (const r of rows) {
        const itemEl = $('.cm-hist-item', r);
        const valEl = $('.cm-hist-valor', r);
        const isOrb = !!$('.cm-preco.orb', r);
        const parsed = PK_STONES.parseHistoryRow({
          itemText: (itemEl && (itemEl.title || itemEl.textContent)) || '',
          valueText: (valEl && valEl.textContent) || '',
          isOrb,
        });
        if (!parsed) continue;
        if (!salesByStone.has(parsed.normName)) salesByStone.set(parsed.normName, []);
        salesByStone.get(parsed.normName).push(parsed);
      }
      if (page >= maxPages) break;
      const nextBtn = $$('button.cm-pag', f).find(b => b.textContent.trim() === '›' && !b.disabled);
      if (!nextBtn) break;
      nextBtn.click();
      // Aguarda a próxima página mudar o conteúdo
      const t0 = Date.now();
      while (Date.now() - t0 < 1800) {
        await sleep(180);
        const f2 = $('.cm-folha');
        const rows2 = f2 ? $$('.cm-hist-linha', f2) : [];
        const sig2 = rows2.slice(0, 3).map(r => r.textContent.trim()).join('|');
        if (rows2.length && sig2 !== prevSig) break;
      }
    }
    await closeRmtLeaf();
    return salesByStone;
  }

  async function readInventoryStones(getCorpo, stoneIds) {
    const corpo = getCorpo();
    const btnAnn = corpo && $('#cm-anunciar', corpo);
    if (!btnAnn) throw new Error('Botão + Anunciar não encontrado');
    btnAnn.click();
    const btnItem = await waitForSelector('.cm-folha button.cm-grande[data-tipo="item"]', () => document, 2200);
    if (!btnItem) { await closeRmtLeaf(); throw new Error('Opção "Um item" não encontrada'); }
    btnItem.click();
    await sleep(450);

    const leaf = $('.cm-folha');
    const slots = leaf ? $$('button.cm-slot[data-id]', leaf) : [];
    const stones = [];
    for (const s of slots) {
      if (!s.offsetParent || s.disabled) continue;
      const id = s.dataset.id;
      const name = ($('.cm-slot-nome', s) || {}).textContent?.trim() || '';
      const qty = PK_STONES.parseIntClean(($('b', s) || {}).textContent || '') || 0;
      const hasTypeChip = !!$('.cm-chip.tipo', s);
      if (qty > 0 && PK_STONES.isStoneItem({ id, name, hasTypeChip, stoneIds })) {
        stones.push({ id: String(id), name, qty });
      }
    }
    await closeRmtLeaf();
    return stones;
  }

  async function publishStoneListing(getCorpo, planItem) {
    const corpo = getCorpo();
    const btnAnn = corpo && $('#cm-anunciar', corpo);
    if (!btnAnn) return { status: 'error', detail: 'botão + Anunciar ausente' };
    btnAnn.click();
    const btnItem = await waitForSelector('.cm-folha button.cm-grande[data-tipo="item"]', () => document, 2200);
    if (!btnItem) { await closeRmtLeaf(); return { status: 'error', detail: 'tela de tipo não abriu' }; }
    btnItem.click();
    await sleep(450);

    const leaf = $('.cm-folha');
    const slot = leaf && $(`button.cm-slot[data-id="${planItem.id}"]`, leaf);
    if (!slot || !slot.offsetParent || slot.disabled) {
      await closeRmtLeaf();
      return { status: 'skipped', detail: 'indisponível/já anunciada' };
    }
    slot.click();
    const priceInp = await waitForSelector('.cm-folha #cm-preco', () => document, 2200);
    if (!priceInp) { await closeRmtLeaf(); return { status: 'error', detail: 'formulário de preço não abriu' }; }
    await sleep(220);

    // Garante moeda Coins
    const fForm = $('.cm-folha');
    const btnGold = fForm && $('.cm-moeda[data-moeda="gold"]', fForm);
    if (btnGold && !btnGold.classList.contains('on')) { btnGold.click(); await sleep(200); }

    // Garante quantidade total (Tudo)
    const btnAll = fForm && $('button.qtd-atalho[data-frac="1"]', fForm);
    if (btnAll) { btnAll.click(); await sleep(150); }
    const qtyInp = $('.cm-folha #qtd-num');
    const actualQty = qtyInp ? (PK_STONES.parseIntClean(qtyInp.value) || planItem.qty) : planItem.qty;

    // Define preço unitário
    const inp = $('.cm-folha #cm-preco');
    inp.value = String(planItem.price);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(220);

    const tetoEl = $('.cm-folha #cm-preco-teto');
    const pubBtn = $('.cm-folha #cm-publicar');
    if (tetoEl && !tetoEl.hidden && tetoEl.textContent.trim()) {
      const msg = tetoEl.textContent.trim();
      await closeRmtLeaf();
      return { status: 'error', detail: msg };
    }
    if (!pubBtn || pubBtn.disabled) {
      await closeRmtLeaf();
      return { status: 'error', detail: 'botão Publicar desabilitado' };
    }

    pubBtn.click();
    // Ao anunciar em Coins, o jogo abre .modal-caixa.caixa-confirmar (#confirmar-sim) para evitar confusão com Gemas
    let confirmedCoins = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 4500) {
      await sleep(220);
      const confirmBox = $('.modal-caixa.caixa-confirmar');
      if (!confirmedCoins && confirmBox && confirmBox.offsetParent) {
        const simBtn = $('#confirmar-sim', confirmBox);
        if (simBtn && !simBtn.disabled) {
          confirmedCoins = true;
          simBtn.click();
          await sleep(300);
          continue;
        }
      }
      const l = $('.cm-folha');
      const boxStillOpen = !!(confirmBox && confirmBox.offsetParent);
      if ((!l || !l.offsetParent) && !boxStillOpen) {
        return { status: 'listed', listedQty: actualQty, detail: `anunciada ×${actualQty} a ${planItem.price.toLocaleString('pt-BR')}` };
      }
      if (l && l.offsetParent) {
        const errEl = $('.cm-erro, .erro, .aviso-erro', l);
        if (errEl && errEl.offsetParent && errEl.textContent.trim()) {
          const errTxt = errEl.textContent.trim();
          const naoBtn = $('.modal-caixa.caixa-confirmar #confirmar-nao');
          if (naoBtn && naoBtn.offsetParent) { naoBtn.click(); await sleep(180); }
          await closeRmtLeaf();
          return { status: 'error', detail: errTxt };
        }
      }
    }
    // Se ainda está aberta após 4,5 s, limpa confirmação/folha e reporta toast visível (se houver)
    const naoEnd = $('.modal-caixa.caixa-confirmar #confirmar-nao');
    if (naoEnd && naoEnd.offsetParent) { naoEnd.click(); await sleep(180); }
    const lEnd = $('.cm-folha');
    const stillOpen = !!(lEnd && lEnd.offsetParent);
    if (stillOpen) {
      const toastEl = $$('.toast, #toast, .notificacao').find(el => el.offsetParent && !el.classList.contains('hidden'));
      const maybeToast = toastEl ? toastEl.textContent.trim() : '';
      await closeRmtLeaf();
      return { status: 'error', detail: maybeToast || 'não fechou após publicar (cooldown/já anunciada?)' };
    }
    return { status: 'listed', listedQty: actualQty, detail: `anunciada ×${actualQty} a ${planItem.price.toLocaleString('pt-BR')}` };
  }

  async function sellAllStones({ dryRun = false } = {}) {
    if (typeof PK_STONES === 'undefined') return log('pedras: módulo PK_STONES indisponível');
    if (stoneState.running) return;
    if (busy) { renderStones('Aguarde: outra ação em andamento.'); return; }
    busy = true;
    stoneState.running = true;
    const effDry = !!(dryRun || CFG.dry);
    const voltarUltra = energyNow() === 'ultra';
    const wasOpen = !!($('.modal-caixa[data-modal="community"]') && $('.modal-caixa[data-modal="community"]').offsetParent);
    const getCorpo = () => { const m = $('.modal-caixa[data-modal="community"]'); return (m && m.offsetParent) ? ($('#modal-corpo', m) || m) : null; };
    renderStones(effDry ? 'Simulando venda de pedras...' : 'Analisando pedras do inventário...');
    try {
      if (voltarUltra && !(await leaveUltra())) {
        renderStones('Não consegui sair do modo ULTRA.');
        return null;
      }
      if (!wasOpen) {
        await closeModal();
        const nav = navBtn('community');
        if (!nav) { renderStones('Botão RMT não encontrado.'); return null; }
        nav.click();
        await waitForSelector('.modal-caixa[data-modal="community"] #cm-anunciar', () => document, 3500);
        await sleep(300);
      }
      let corpo = getCorpo();
      if (!corpo) { renderStones('Modal RMT não abriu.'); return null; }
      await closeRmtLeaf();

      // 1) Aba Itens -> Categoria Pedras para capturar o catálogo dinâmico de IDs de pedras
      const btnItens = $('button.cm-filtro[data-tipo="item"]', corpo)
        || $$('button.cm-filtro', corpo).find(b => /^(itens|items)$/i.test(b.textContent.trim()));
      if (btnItens && !btnItens.classList.contains('on')) { btnItens.click(); await sleep(550); }
      corpo = getCorpo(); if (!corpo) return null;
      const btnPedras = $('button.cm-filtro[data-cat="stone"]', corpo)
        || $$('button.cm-filtro', corpo).find(b => /^(pedras|stones)$/i.test(b.textContent.trim()));
      if (btnPedras && !btnPedras.classList.contains('on')) { btnPedras.click(); await sleep(500); }
      corpo = getCorpo(); if (!corpo) return null;
      const stoneIds = new Set($$('.cmi-linha[data-item]', corpo).map(el => String(el.dataset.item)));

      // 2) Lê pedras disponíveis no inventário via + Anunciar -> Um item
      renderStones('Lendo pedras no inventário...');
      const invStones = await readInventoryStones(getCorpo, stoneIds);
      if (!invStones.length) {
        stoneState.last = { at: Date.now(), dryRun: effDry, items: [], summary: PK_STONES.summarizePlan([]) };
        saveStones();
        log('pedras: nenhuma pedra disponível no inventário para anunciar');
        return stoneState.last;
      }

      // 3) Lê Tabela de Preços recente (Itens + Coins) para vendas comprovadas
      renderStones(`Lendo vendas comprovadas (${invStones.length} tipos de pedra)...`);
      const salesByStone = await readStoneHistoryCoins(getCorpo, 6);

      // 4) Garante aba Itens -> Pedras e lê book livre + média 7d de cada pedra do inventário
      corpo = getCorpo(); if (!corpo) return null;
      const bIt2 = $('button.cm-filtro[data-tipo="item"]', corpo);
      if (bIt2 && !bIt2.classList.contains('on')) { bIt2.click(); await sleep(500); }
      corpo = getCorpo(); if (!corpo) return null;
      const bPd2 = $('button.cm-filtro[data-cat="stone"]', corpo);
      if (bPd2 && !bPd2.classList.contains('on')) { bPd2.click(); await sleep(450); }

      const planned = [];
      for (let i = 0; i < invStones.length; i++) {
        const stItem = invStones[i];
        renderStones(`Analisando (${i + 1}/${invStones.length}): ${stItem.name}...`);
        corpo = getCorpo(); if (!corpo) break;
        const row = $(`.cmi-linha[data-item="${stItem.id}"]`, corpo)
          || $$('.cmi-linha', corpo).find(el => ($('.cmi-nome b', el) || {}).textContent?.trim() === stItem.name);
        let offers = [], avg7d = null, vol7d = null;
        if (row) {
          row.click();
          await sleep(450);
          const parsed = await waitForStoneBook(stItem.id);
          offers = parsed.offers;
          avg7d = parsed.avg7d;
          vol7d = parsed.vol7d;
        }
        const recentSales = salesByStone.get(PK_STONES.norm(stItem.name)) || [];
        const dec = PK_STONES.chooseStonePrice({
          id: stItem.id,
          name: stItem.name,
          qty: stItem.qty,
          offers,
          avg7d,
          vol7d,
          recentSales,
        });
        dec.execStatus = dec.action === 'sell' ? (effDry ? 'dry' : 'pending') : 'skipped';
        dec.execDetail = dec.action === 'sell' ? dec.reason : dec.reason;
        planned.push(dec);
      }

      // 5) Se não for simulação/dry-run, publica cada pedra elegível com intervalo conservador
      if (!effDry) {
        const toSell = planned.filter(p => p.action === 'sell');
        for (let i = 0; i < toSell.length; i++) {
          const item = toSell[i];
          renderStones(`Anunciando (${i + 1}/${toSell.length}): ${item.name} ×${item.qty} a ${item.price.toLocaleString('pt-BR')}...`);
          const res = await publishStoneListing(getCorpo, item);
          item.execStatus = res.status;
          item.execDetail = res.detail;
          if (res.status === 'listed') {
            log(`pedras: anunciada ${item.name} ×${res.listedQty || item.qty} a ${item.price.toLocaleString('pt-BR')} Coins/un. (líq. ~${PK_STONES.formatCoins(item.net)})`);
          } else {
            log(`pedras: ${item.name} -> ${res.status} (${res.detail})`);
          }
          if (i + 1 < toSell.length) await sleep(700);
        }
      } else {
        const sumDry = PK_STONES.summarizePlan(planned);
        log(`pedras[simulação]: ${sumDry.sellTypes}/${sumDry.totalTypes} pedras (${sumDry.totalUnits} un.) · líq. est. ${PK_STONES.formatCoins(sumDry.totalNet)} Coins`);
      }

      const summary = PK_STONES.summarizePlan(planned);
      stoneState.last = { at: Date.now(), dryRun: effDry, items: planned, summary };
      saveStones();
      return stoneState.last;
    } catch (e) {
      log('pedras erro:', e.message);
      renderStones('Erro na venda de pedras: ' + e.message);
      return null;
    } finally {
      await closeRmtLeaf();
      if (!wasOpen) await closeModal();
      if (voltarUltra) await reenterUltra();
      stoneState.running = false;
      busy = false;
      renderStones();
    }
  }
  const planSellStones = () => sellAllStones({ dryRun: true });

  // ---------- 7: Analisador de Venda de Inventário (Gold vs Gema) ----------
  function findSellEntry(key) {
    if (!key) return null;
    const inv = sellState.inventory || { items: [], pokemons: [] };
    if (key.startsWith('item:')) {
      const id = key.slice(5);
      return inv.items.find(it => String(it.id) === id) || null;
    }
    if (key.startsWith('pk:')) {
      const uid = key.slice(3);
      return inv.pokemons.find(pk => String(pk.uid) === uid) || null;
    }
    return null;
  }

  function syncSellQtyInput() {
    if (!sellQtyEl) return;
    const entry = findSellEntry(sellState.selectedKey);
    if (entry && entry.kind === 'item') {
      sellQtyEl.style.display = '';
      sellQtyEl.max = Math.max(999999, entry.qty || 1);
      sellQtyEl.value = String(sellState.qtyOverride || entry.qty || 1);
    } else {
      sellQtyEl.style.display = 'none';
    }
  }

  function populateSellSelect() {
    if (!sellSelEl) return;
    const inv = sellState.inventory || { items: [], pokemons: [] };
    const items = inv.items || [];
    const pokes = inv.pokemons || [];
    sellSelEl.textContent = '';

    if (!items.length && !pokes.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Clique "Carregar" p/ listar inventário...';
      sellSelEl.append(opt);
      sellState.selectedKey = '';
      syncSellQtyInput();
      return;
    }

    if (items.length) {
      const grp = document.createElement('optgroup');
      grp.label = `Itens (${items.length})`;
      for (const it of items) {
        const o = document.createElement('option');
        o.value = `item:${it.id}`;
        o.textContent = `${it.name} ×${it.qty}${it.listedQty ? ` (${it.listedQty} anunciado${it.listedQty > 1 ? 's' : ''})` : (it.disabled ? ' (anunciado)' : '')}`;
        grp.append(o);
      }
      sellSelEl.append(grp);
    }
    if (pokes.length) {
      const grp = document.createElement('optgroup');
      grp.label = `Pokémons (${pokes.length})`;
      for (const pk of pokes) {
        const o = document.createElement('option');
        o.value = `pk:${pk.uid}`;
        const sh = pk.shiny ? '✨ ' : '';
        const notaTxt = Number.isFinite(pk.nota) ? ` N${pk.nota.toFixed(2).replace('.', ',')}` : '';
        const potTxt = pk.potency ? ` P${pk.potency}` : '';
        const tag = pk.eligible === false ? ' [fora RMT]' : (pk.where ? ` [${pk.where}]` : '');
        o.textContent = `${sh}${pk.species} Nv${pk.level || '?'}${potTxt}${notaTxt}${tag}`;
        grp.append(o);
      }
      sellSelEl.append(grp);
    }

    const exists = findSellEntry(sellState.selectedKey);
    if (exists) {
      sellSelEl.value = sellState.selectedKey;
    } else {
      sellState.selectedKey = items.length ? `item:${items[0].id}` : (pokes.length ? `pk:${pokes[0].uid}` : '');
      sellSelEl.value = sellState.selectedKey;
      sellState.qtyOverride = null;
    }
    syncSellQtyInput();
  }

  function renderSell(statusMsg) {
    if (!sellOutEl || typeof PK_SELL === 'undefined') return;
    const busyNow = sellState.loading || sellState.scanning;
    if (sellLoadBtnEl) {
      sellLoadBtnEl.disabled = busyNow;
      sellLoadBtnEl.textContent = sellState.loading ? 'Lendo...' : 'Carregar';
    }
    if (sellScanBtnEl) {
      sellScanBtnEl.disabled = busyNow;
      sellScanBtnEl.textContent = sellState.scanning ? 'Analisando...' : 'Analisar';
    }
    populateSellSelect();

    const mk = (tag, css, text) => {
      const el = document.createElement(tag);
      if (css) el.style.cssText = css;
      if (text != null) el.textContent = text;
      return el;
    };
    sellOutEl.textContent = '';

    if (statusMsg) {
      sellOutEl.append(mk('div', 'color:#c9f', statusMsg));
      return;
    }

    const d = sellState.last;
    if (!d || !d.result) {
      sellOutEl.append(mk('div', 'opacity:.72', 'Clique "Carregar" para puxar seus itens e Pokémons, escolha um e clique "Analisar".'));
      return;
    }

    const r = d.result;
    const fc = PK_SELL.formatCoins;
    const fg = PK_SELL.formatGems;
    const ageMin = Math.max(0, Math.round((Date.now() - (d.at || Date.now())) / 60000));
    const isItem = r.kind === 'item';

    // Card do veredito principal
    const palette = r.bestCurrency === 'gem'
      ? { accent: '#c9f', bg: '#26183888' }
      : r.bestCurrency === 'gold'
        ? { accent: '#fd8', bg: '#33291488' }
        : { accent: '#8ef', bg: '#16293888' };
    const card = mk('div', `margin-top:3px;padding:5px 6px;border-radius:5px;background:${palette.bg};border:1px solid ${palette.accent}66`);
    const itemHead = `${r.name}${isItem && r.qty > 1 ? ` ×${r.qty}` : ''} · há ${ageMin}m`;
    card.append(mk('div', 'color:#bcd;font-size:9.5px', itemHead));
    card.append(mk('div', `font-weight:bold;color:${palette.accent};margin-top:2px`, r.headline));
    if (r.explanation) {
      card.append(mk('div', 'color:#efe;font-size:9.5px;margin-top:2px', r.explanation));
    }

    // Bloco comparativo: Gold (Coins) vs Gemas
    const renderRow = (title, color, ev, isGold, equivTxt, winner) => {
      const box = mk('div', `margin-top:4px;padding:3px 5px;border-radius:4px;background:#0004;border-left:2px solid ${winner ? color : '#fff3'}`);
      const badge = winner ? ' ★' : '';
      if (!ev || !ev.available) {
        box.append(mk('div', `color:${color};font-weight:bold;font-size:9.5px`, `${title}: indisponível`));
        box.append(mk('div', 'opacity:.72;font-size:9px', (ev && (ev.blockedReason || ev.source)) || 'sem dados no mercado'));
        return box;
      }
      const unitTxt = isGold
        ? `${ev.unitPrice.toLocaleString('pt-BR')} Coins${isItem ? '/un.' : ''}`
        : `${ev.unitPrice.toLocaleString('pt-BR')} G${isItem ? '/un.' : ''}`;
      const netTxt = isGold ? `${fc(ev.net)} líq.` : `${fg(ev.net)} líq.`;
      const feePct = Math.round((ev.effPct || 0) * 10) / 10;
      box.append(mk('div', `color:${color};font-weight:bold;font-size:9.5px`, `${title}${badge}: ${unitTxt}`));
      const totalLine = isItem && r.qty > 1
        ? `Total ${isGold ? fc(ev.gross) : fg(ev.gross)} − ${feePct}% taxa → ${netTxt}${equivTxt ? ` (${equivTxt})` : ''}`
        : `Taxa ${feePct}% → ${netTxt}${equivTxt ? ` (${equivTxt})` : ''}`;
      box.append(mk('div', 'color:#fff;font-size:9.5px', totalLine));
      const meta = [];
      if (ev.source) meta.push(ev.source);
      if (isItem) {
        if (ev.bestFree != null) meta.push(`livre ${ev.bestFree.toLocaleString('pt-BR')}`);
        if (ev.avg7d != null) meta.push(`7d ${ev.avg7d.toLocaleString('pt-BR')}`);
        if (ev.provenCount > 0) meta.push(`${ev.provenCount} vendas rec.`);
      } else {
        if (ev.bestFree != null) meta.push(`menor ${isGold ? fc(ev.bestFree) : fg(ev.bestFree)}`);
        if (ev.medianSale != null) meta.push(`med.venda ${isGold ? fc(ev.medianSale) : fg(ev.medianSale)}`);
        meta.push(`${ev.comparableListings || 0} anún. · ${ev.comparableSales || 0} vendas`);
      }
      box.append(mk('div', 'opacity:.72;font-size:9px', meta.join(' · ')));
      if (!isItem && ev.tiers) {
        const fmt = v => (isGold ? fc(v) : fg(v));
        const dTxt = d => (d == null ? '' : ` (~${d < 1 ? '<1' : Math.round(d)}d)`);
        const t = ev.tiers;
        box.append(mk('div', 'color:#cfe;font-size:9px;margin-top:2px',
          `Rápido ${fmt(t.quick.price)}${dTxt(t.quick.days)} · Mercado ${fmt(t.market.price)}${dTxt(t.market.days)} · Máx. viável ${fmt(t.max.price)}${dTxt(t.max.days)}`));
        if (t.provenCap) box.append(mk('div', 'opacity:.72;font-size:9px', `Maior preço pago (2ª maior venda ajustada): ${fmt(t.provenCap.price)} → ${fmt(t.provenCap.net)} líq.`));
        if (ev.timing && ev.timing.verdict !== 'UNKNOWN') {
          const tm = { SELL: ['▲ vendas 7d em alta', '#8f8'], WAIT: ['⏳ vendas 7d em baixa', '#fc9'], NORMAL: ['● vendas 7d normais', '#bcd'] }[ev.timing.verdict];
          box.append(mk('div', `color:${tm[1]};font-size:9px`, `${tm[0]} (×${String(ev.timing.ratio).replace('.', ',')} vs 30d, ${ev.timing.recentCount} vendas)`));
        }
        if (ev.model) {
          const mTxt = `Ajuste: +1 Nota ≈ +${Math.round((Math.exp(ev.model.slopeNota) - 1) * 100)}% · ×2 Nível ≈ +${Math.round((Math.pow(2, ev.model.slopeLevel) - 1) * 100)}% · +1 Potência ≈ +${Math.round((Math.exp(ev.model.slopePotency || 0) - 1) * 100)}% (${ev.model.nFit} pts) · ${String(ev.model.salesPerDay).replace('.', ',')} vendas/dia`;
          box.append(mk('div', 'opacity:.6;font-size:8.5px', mTxt));
        }
        if (ev.comparables && ev.comparables.length) {
          const det = document.createElement('details');
          det.style.cssText = 'margin-top:2px;font-size:8.5px;opacity:.85';
          det.append(mk('summary', 'cursor:pointer', `Ver ${ev.comparables.length} comparáveis usados`));
          for (const c of ev.comparables) {
            det.append(mk('div', 'opacity:.8',
              `${c.type === 'venda' ? 'V' : 'A'} ${fmt(c.price)} → ${fmt(c.adj)} adj · Nv ${c.level ?? '?'} P${c.potency ?? '?'} N ${c.nota != null ? String(c.nota).replace('.', ',') : '?'} · peso ${String(c.w).replace('.', ',')}${c.ageDays != null ? ` · ${c.ageDays}d` : ''}`));
          }
          box.append(det);
        }
      }
      return box;
    };

    const gEquiv = r.goldEquivGems ? `≈ ${fg(r.goldEquivGems)}` : '';
    const oEquiv = r.gemEquivGold ? `≈ ${fc(r.gemEquivGold)} Coins` : '';
    card.append(renderRow('GOLD (Coins)', '#fd8', r.gold, true, gEquiv, r.bestCurrency === 'gold'));
    card.append(renderRow('GEMAS', '#c9f', r.gem, false, oEquiv, r.bestCurrency === 'gem'));

    if (r.exchangeRate && r.exchangeRate.coinsPerGem > 0) {
      const implTxt = r.impliedCoinsPerGem ? ` · razão deste item: ${fc(r.impliedCoinsPerGem)}/G` : '';
      card.append(mk('div', 'opacity:.75;font-size:9px;margin-top:4px',
        `Câmbio RMT: 1G ≈ ${fc(r.exchangeRate.coinsPerGem)} Coins (${r.exchangeRate.label})${implTxt}`));
    }

    if (d.eligibilityNote) {
      card.append(mk('div', 'color:#fc9;font-size:9px;margin-top:3px', '⚠ ' + d.eligibilityNote));
    }

    for (const w of (r.warnings || []).slice(0, 8)) {
      const line = mk('div', 'margin-top:2px;color:#fc9;font-size:9px;display:flex;align-items:center;gap:4px');
      line.append(mk('span', 'flex:1', '⚠ ' + w));
      if (/Radar RMT/i.test(w)) {
        const bRmt = mk('button', 'all:unset;cursor:pointer;padding:0 5px;border-radius:3px;background:#fd83;border:1px solid #fd86;color:#fff;font-size:9px', 'Ler RMT');
        bRmt.onclick = () => scanRmt();
        line.append(bRmt);
      }
      card.append(line);
    }

    sellOutEl.append(card);
  }

  function readTeamPokemonsFromDom() {
    const out = [];
    for (const el of $$('#time .poke-linha')) {
      const id = el.dataset.id ? String(el.dataset.id) : '';
      const nomeEl = $('.pl-nome', el);
      let species = '';
      if (nomeEl) {
        const clone = nomeEl.cloneNode(true);
        $$('.pl-lv, .pl-colecao-marca, .cm-selo-shiny', clone).forEach(x => x.remove());
        species = PK_SELL.cleanSpeciesName(clone.textContent || '');
      }
      if (!species) continue;
      const lvTxt = ($('.pl-lv', el) || {}).textContent || '';
      const selosTxt = ($('.pk-selos', el) || {}).textContent || '';
      const attrs = PK_SELL.parsePokemonAttrs(`${lvTxt} ${selosTxt}`);
      const shiny = el.classList.contains('shiny')
        || !!$('.cm-selo-shiny, .shiny', el)
        || /✨|\bshiny\b/i.test((nomeEl && nomeEl.textContent) || '');
      const mega = /^mega\s+/i.test(species);
      const pk = {
        kind: 'pokemon',
        uid: id || `team-${PK_SELL.norm(species)}-${attrs.level || 0}-${attrs.iv || 0}`,
        id,
        species,
        level: attrs.level || 1,
        potency: attrs.potency || 1,
        iv: attrs.iv,
        quality: attrs.quality,
        nota: attrs.nota,
        shiny,
        mega,
        where: el.classList.contains('ativo') ? 'Ativo' : 'Equipe',
      };
      const elig = PK_SELL.pokemonEligibility(pk);
      pk.eligible = elig.eligible;
      pk.eligReason = elig.reason;
      out.push(pk);
    }
    return out;
  }

  // Lê "Meus anúncios" (#cm-meus): itens (nome + qtd) e Pokémons já anunciados por você, em qualquer moeda.
  async function readMyListings(getCorpo) {
    const out = { items: [], pokemons: [] };
    const corpo = getCorpo();
    const btn = corpo && $('#cm-meus', corpo);
    if (!btn) return out;
    btn.click();
    await sleep(900);
    const root = $('.cm-folha') || getCorpo();
    if (!root) return out;
    const cards = $$('.cm-card, .cm-linha, .cmi-linha, .cm-meu, .mk-card', root);
    const diag = [];
    cards.forEach((c, i) => {
      const txt = c.textContent.replace(/\s+/g, ' ').trim();
      if (i < 3) diag.push(txt.slice(0, 80));
      const nameEl = $('.cm-nome-txt, .cmi-nome b, .cm-slot-nome, .mk-nome', c);
      const rawName = (nameEl && nameEl.textContent.trim()) || '';
      if (!rawName) return;
      const subTxt = ($('.cm-sub, .mk-sub', c) || {}).textContent || '';
      const selosTxt = ($('.pk-selos', c) || {}).textContent || '';
      const attrs = PK_SELL.parsePokemonAttrs(`${subTxt} ${selosTxt}`);
      const isPk = !!$('.pk-selos', c) || attrs.level > 1 || /\bnv\.?\s*\d+|\blv\.?\s*\d+/i.test(subTxt);
      if (isPk) {
        const species = PK_SELL.cleanSpeciesName(rawName);
        if (!species) return;
        const shiny = c.classList.contains('shiny') || !!$('.cm-selo-shiny', c) || /✨|\bshiny\b/i.test(rawName);
        const pk = {
          kind: 'pokemon', uid: `meu-${PK_SELL.norm(species)}-${attrs.level || 0}-${attrs.iv || 0}-${i}`, id: '',
          species, level: attrs.level || 50, potency: attrs.potency || 1, iv: attrs.iv, quality: attrs.quality,
          nota: attrs.nota, shiny, mega: /^mega\s+/i.test(species), where: 'Anunciado',
        };
        const elig = PK_SELL.pokemonEligibility(pk);
        pk.eligible = elig.eligible;
        pk.eligReason = elig.reason;
        out.pokemons.push(pk);
        return;
      }
      // Item: quantidade em "×N" / "xN" / <b> do slot; senão 1
      const qm = txt.match(/[×x]\s*([\d.,]+\s*[kKmM]?)/) || null;
      const qtyB = PK_SELL.parseIntClean(($('b', c) || {}).textContent || '') || 0;
      const qty = (qm && PK_SELL.parseCompactNum(qm[1])) || qtyB || 1;
      const name = rawName.replace(/\s*[×x]\s*[\d.,]+.*$/i, '').trim();
      if (name) out.items.push({ name, qty: Math.max(1, Math.round(qty)) });
    });
    log('venda: Meus anúncios cards=' + cards.length, JSON.stringify(diag));
    await closeRmtLeaf();
    return out;
  }

  async function readAllRmtInventory(getCorpo) {
    const items = [];
    const pokemons = [];

    // 1) Itens comercializáveis no RMT (+ Anunciar -> Um item)
    let corpo = getCorpo();
    const btnAnn = corpo && $('#cm-anunciar', corpo);
    if (!btnAnn) throw new Error('Botão + Anunciar não encontrado');
    btnAnn.click();
    const btnItem = await waitForSelector('.cm-folha button.cm-grande[data-tipo="item"]', () => document, 2200);
    if (btnItem) {
      btnItem.click();
      await sleep(500);
      const leaf = $('.cm-folha');
      for (const s of (leaf ? $$('button.cm-slot[data-id]', leaf) : [])) {
        if (!s.offsetParent) continue;
        const id = String(s.dataset.id);
        const name = ($('.cm-slot-nome', s) || {}).textContent?.trim() || '';
        const qty = PK_SELL.parseIntClean(($('b', s) || {}).textContent || '') || 0;
        if (name && qty > 0) {
          items.push({ kind: 'item', id, name, qty, disabled: !!s.disabled });
        }
      }
      await closeRmtLeaf();
    }

    // 2) Pokémons elegíveis no RMT (+ Anunciar -> Um pokemon)
    corpo = getCorpo();
    const btnAnn2 = corpo && $('#cm-anunciar', corpo);
    if (btnAnn2) {
      btnAnn2.click();
      const btnPk = await waitForSelector('.cm-folha button.cm-grande[data-tipo="pokemon"]', () => document, 2200);
      if (btnPk) {
        btnPk.click();
        await sleep(650);
        const leaf = $('.cm-folha');
        const cards = leaf ? $$('#cm-pks .cm-pk-escolha, #cm-pks .mk-card', leaf) : [];
        for (let i = 0; i < cards.length; i++) {
          const c = cards[i];
          const rawName = ($('.mk-nome', c) || {}).textContent?.trim() || '';
          const shiny = c.classList.contains('shiny') || !!$('.cm-selo-shiny', c) || /✨|\bshiny\b/i.test(rawName);
          const species = PK_SELL.cleanSpeciesName(rawName);
          if (!species) continue;
          const subTxt = ($('.mk-sub', c) || {}).textContent || '';
          const selosTxt = ($('.pk-selos', c) || {}).textContent || '';
          const attrs = PK_SELL.parsePokemonAttrs(`${subTxt} ${selosTxt}`);
          const whereM = subTxt.match(/[·•]\s*(.+)$/);
          const where = whereM ? whereM[1].trim() : 'Depot';
          const keyAttr = (c.dataset && (c.dataset.chave || c.dataset.id || c.dataset.uid)) || '';
          const idM = String(keyAttr).match(/(\d+)$/);
          const uid = idM ? idM[1] : `rmt-${PK_SELL.norm(species)}-${attrs.level || 0}-${attrs.iv || 0}-${i}`;
          pokemons.push({
            kind: 'pokemon',
            uid,
            id: idM ? idM[1] : '',
            species,
            level: attrs.level || 50,
            potency: attrs.potency || 1,
            iv: attrs.iv,
            quality: attrs.quality,
            nota: attrs.nota,
            shiny,
            mega: /^mega\s+/i.test(species),
            where,
            eligible: true,
            eligReason: 'Elegível no RMT',
          });
        }
        await closeRmtLeaf();
      }
    }

    // Mescla Pokémons da Equipe (incluindo o ativo) evitando duplicatas
    const teamPks = readTeamPokemonsFromDom();
    const seen = new Set(pokemons.map(p => p.id ? `id:${p.id}` : `sig:${PK_SELL.norm(p.species)}:${p.level}:${p.iv}:${p.potency}`));
    for (const tp of teamPks) {
      const k1 = tp.id ? `id:${tp.id}` : '';
      const k2 = `sig:${PK_SELL.norm(tp.species)}:${tp.level}:${tp.iv}:${tp.potency}`;
      if ((k1 && seen.has(k1)) || seen.has(k2)) continue;
      if (k1) seen.add(k1);
      seen.add(k2);
      pokemons.push(tp);
    }

    // 3) "Meus anúncios": o que já está anunciado sai do inventário, mas continua sendo seu (conta no analisador)
    try {
      const mine = await readMyListings(getCorpo);
      log(`venda: meus anúncios lidos: ${mine.items.length} item(ns), ${mine.pokemons.length} Pokémon(s)`);
      for (const mi of mine.items) {
        const ex = items.find(i => PK_SELL.norm(i.name) === PK_SELL.norm(mi.name));
        if (ex) { ex.qty += mi.qty; ex.listedQty = (ex.listedQty || 0) + mi.qty; }
        else items.push({ kind: 'item', id: '', name: mi.name, qty: mi.qty, listedQty: mi.qty, disabled: true });
      }
      for (const mp of mine.pokemons) {
        const sig = p => `${PK_SELL.norm(p.species)}:${p.level}:${p.iv}:${p.potency}:${!!p.shiny}`;
        if (pokemons.some(p => sig(p) === sig(mp))) continue;
        pokemons.push(mp);
      }
    } catch (e) {
      log('venda: falha ao ler Meus anúncios:', e.message);
    }

    items.sort((a, b) => a.name.localeCompare(b.name));
    pokemons.sort((a, b) => (b.eligible - a.eligible) || ((b.nota || 0) - (a.nota || 0)) || ((b.level || 0) - (a.level || 0)));
    return { items, pokemons };
  }

  async function loadSellInventory() {
    if (typeof PK_SELL === 'undefined') return log('venda: módulo PK_SELL indisponível');
    if (sellState.loading || sellState.scanning) return;
    if (busy) { renderSell('Aguarde: outra ação em andamento.'); return; }
    busy = true;
    sellState.loading = true;
    const voltarUltra = energyNow() === 'ultra';
    const wasOpen = !!($('.modal-caixa[data-modal="community"]') && $('.modal-caixa[data-modal="community"]').offsetParent);
    const getCorpo = () => { const m = $('.modal-caixa[data-modal="community"]'); return (m && m.offsetParent) ? ($('#modal-corpo', m) || m) : null; };
    renderSell('Carregando itens e Pokémons do inventário...');
    try {
      if (voltarUltra && !(await leaveUltra())) {
        renderSell('Não consegui sair do modo ULTRA.');
        return null;
      }
      if (!wasOpen) {
        await closeModal();
        const nav = navBtn('community');
        if (!nav) { renderSell('Botão RMT não encontrado.'); return null; }
        nav.click();
        await waitForSelector('.modal-caixa[data-modal="community"] #cm-anunciar', () => document, 3500);
        await sleep(300);
      }
      if (!getCorpo()) { renderSell('Modal RMT não abriu.'); return null; }
      await closeRmtLeaf();

      const inv = await readAllRmtInventory(getCorpo);
      sellState.inventory = { at: Date.now(), items: inv.items, pokemons: inv.pokemons };
      saveSell();
      log(`venda: carregados ${inv.items.length} item(ns) e ${inv.pokemons.length} Pokémon(s)`);
      return sellState.inventory;
    } catch (e) {
      log('venda erro ao carregar:', e.message);
      renderSell('Erro ao carregar inventário: ' + e.message);
      return null;
    } finally {
      await closeRmtLeaf();
      if (!wasOpen) await closeModal();
      if (voltarUltra) await reenterUltra();
      sellState.loading = false;
      busy = false;
      renderSell();
    }
  }

  function readExchangeRateFromOpenItemList(corpo) {
    if (!corpo || typeof PK_RMT === 'undefined') return null;
    const pairs = [];
    for (const row of $$('.cmi-linha', corpo)) {
      const name = ($('.cmi-nome b', row) || {}).textContent?.trim();
      const liq = PK_RMT.matchLiquidItem(name);
      if (!liq) continue;
      const precos = $$('.cm-preco', row);
      let coins = null, gems = null;
      for (const el of precos) {
        const val = PK_RMT.parseCompactNum(el.title || el.textContent);
        if (!val) continue;
        if (el.classList.contains('orb')) gems = val;
        else coins = val;
      }
      if (coins && gems) pairs.push({ name: liq.label, coins, gems });
    }
    return PK_SELL.estimateRateFromItemList(pairs);
  }

  async function waitForItemCurrencyBook(itemId, currency, prevSig = '', maxMs = 2600) {
    const t0 = Date.now();
    const idStr = String(itemId || '');
    const wantSw = currency === 'gem' ? 'orb' : 'gold';
    const wantRe = currency === 'gem' ? /gema|gem/i : /coins/i;
    const sigOf = parsed => `${parsed.avg7d || 0}|${parsed.vol7d || 0}|` + (parsed.offers || []).slice(0, 3).map(o => `${o.price}:${o.qty}:${o.held ? 1 : 0}`).join(',');
    while (Date.now() - t0 < maxMs) {
      const m = $('.modal-caixa[data-modal="community"]');
      const corpo = m && ($('#modal-corpo', m) || m);
      const painel = corpo && $('.cmi-painel', corpo);
      if (painel) {
        const fav = $('.cm-fav[data-fav-item]', painel);
        const rightItem = !idStr || !fav || fav.dataset.favItem === idStr;
        const btn = $(`.cmp-op[data-swmoeda="${wantSw}"]`, painel)
          || $$('button.cmp-op', painel).find(b => wantRe.test(b.textContent));
        if (rightItem && btn && !btn.classList.contains('on')) {
          btn.click();
          await sleep(260);
          continue;
        }
        if (rightItem && (!btn || btn.classList.contains('on'))) {
          const parsed = parseStoneBook(painel);
          const sig = sigOf(parsed);
          if ((parsed.offers.length || parsed.avg7d != null) && (!prevSig || sig !== prevSig || Date.now() - t0 >= 800)) {
            return { parsed, sig };
          }
          if (!/carregando|loading/i.test(painel.textContent || '') && Date.now() - t0 >= 900) {
            return { parsed, sig };
          }
        }
      }
      await sleep(180);
    }
    const m = $('.modal-caixa[data-modal="community"]');
    const painel = m && $('.cmi-painel', $('#modal-corpo', m) || m);
    const parsed = parseStoneBook(painel);
    return { parsed, sig: sigOf(parsed) };
  }

  async function readItemHistoryBothCurrencies(getCorpo, itemName, maxPages = 3) {
    const targetNorm = PK_SELL.norm(itemName);
    const goldSales = [];
    const gemSales = [];
    const corpo = getCorpo();
    const btnHist = corpo && $('#cm-historico-global', corpo);
    if (!btnHist) return { goldSales, gemSales };
    btnHist.click();
    const leaf = await waitForSelector('.cm-folha', () => document, 2200);
    if (!leaf) return { goldSales, gemSales };
    await sleep(300);

    const clickHistFilter = async (attr, val, re) => {
      const f = $('.cm-folha');
      const b = f && ($(`button.cm-filtro[${attr}="${val}"]`, f)
        || $$('button.cm-filtro', f).find(el => re.test(el.textContent.trim())));
      if (b && !b.classList.contains('on')) { b.click(); await sleep(450); }
    };

    const readPages = async (currency, outArr) => {
      await clickHistFilter('data-hist-tipo', 'item', /^(itens|items)$/i);
      await clickHistFilter('data-hist-moeda', currency === 'gem' ? 'orb' : 'gold', currency === 'gem' ? /^(gemas|gems)$/i : /^(coins|ouro)$/i);
      let prevSig = '';
      for (let page = 1; page <= maxPages; page++) {
        const f = $('.cm-folha');
        if (!f) break;
        const rows = $$('.cm-hist-linha', f);
        const sig = rows.slice(0, 3).map(r => r.textContent.trim()).join('|');
        if (!rows.length || (page > 1 && sig === prevSig)) break;
        prevSig = sig;
        for (const r of rows) {
          const itemEl = $('.cm-hist-item', r);
          const valEl = $('.cm-hist-valor', r);
          const isOrb = !!$('.cm-preco.orb', r);
          const parsed = PK_SELL.parseItemHistoryRow({
            itemText: (itemEl && (itemEl.title || itemEl.textContent)) || '',
            valueText: (valEl && valEl.textContent) || '',
            isOrb,
          });
          if (parsed && parsed.normName === targetNorm && parsed.currency === currency) {
            outArr.push(parsed);
          }
        }
        if (page >= maxPages || outArr.length >= 12) break;
        const nextBtn = $$('button.cm-pag', f).find(b => b.textContent.trim() === '›' && !b.disabled);
        if (!nextBtn) break;
        nextBtn.click();
        const t0 = Date.now();
        while (Date.now() - t0 < 5000) {
          await sleep(180);
          const f2 = $('.cm-folha');
          const rows2 = f2 ? $$('.cm-hist-linha', f2) : [];
          const sig2 = rows2.slice(0, 3).map(r => r.textContent.trim()).join('|');
          if (rows2.length && sig2 !== prevSig) break;
        }
      }
    };

    await readPages('gold', goldSales);
    await readPages('gem', gemSales);
    await closeRmtLeaf();
    return { goldSales, gemSales };
  }

  function parseRmtPokemonCards(corpo, wantCurrency) {
    if (!corpo) return [];
    const out = [];
    for (const c of $$('.cm-card', corpo)) {
      const precoEl = $('.cm-preco', c);
      if (!precoEl) continue;
      const isOrb = precoEl.classList.contains('orb');
      if ((wantCurrency === 'gem') !== isOrb) continue;
      const price = PK_SELL.parseCompactNum(precoEl.title || precoEl.textContent);
      if (!price) continue;
      const species = PK_SELL.cleanSpeciesName(($('.cm-nome-txt', c) || {}).textContent || '');
      if (!species) continue;
      const subTxt = ($('.cm-sub', c) || {}).textContent || '';
      const selosTxt = ($('.pk-selos', c) || {}).textContent || '';
      const attrs = PK_SELL.parsePokemonAttrs(`${subTxt} ${selosTxt}`);
      const shiny = c.classList.contains('shiny') || !!$('.cm-selo-shiny', c);
      const mega = /^mega\s+/i.test(species);
      const held = !!$('.cm-retido, [data-retido-ate]', c);
      const hasBuy = !!($('.cm-btn.comprar, button.comprar', c) || $$('button', c).find(b => /^(comprar|buy|retido|held)/i.test(b.textContent.trim())));
      const hasDm = !!$('.cm-dm', c);
      const own = !hasBuy && !hasDm;
      out.push({
        species,
        level: attrs.level || 1,
        potency: attrs.potency || 1,
        iv: attrs.iv,
        quality: attrs.quality,
        nota: attrs.nota,
        shiny,
        mega,
        price,
        held,
        own,
      });
    }
    return out;
  }

  async function readPokemonMarketListings(getCorpo, pk) {
    let corpo = getCorpo();
    if (!corpo) return { goldListings: [], gemListings: [] };
    const bPk = $('button.cm-filtro[data-tipo="pokemon"]', corpo)
      || $$('button.cm-filtro', corpo).find(b => /pok[eé]mon/i.test(b.textContent));
    if (bPk && !bPk.classList.contains('on')) { bPk.click(); await sleep(700); }

    // Limpa filtros anteriores
    corpo = getCorpo();
    const bLimpar = corpo && $('#cm-limpar', corpo);
    if (bLimpar && !bLimpar.classList.contains('hidden')) { bLimpar.click(); await sleep(500); }

    // Aplica espécie + flags estruturais (Shiny / P5 / Mega) + ordenação menor preço
    corpo = getCorpo();
    if (!corpo) return { goldListings: [], gemListings: [] };
    const toggleBtn = async sel => {
      const c = getCorpo();
      const b = c && $(sel, c);
      if (b && !b.classList.contains('on')) { b.click(); await sleep(350); }
    };
    if (pk.shiny) await toggleBtn('#cm-shiny');
    if (Number(pk.potency) === 5) await toggleBtn('#cm-p5');
    if (pk.mega) await toggleBtn('#cm-mega');

    corpo = getCorpo();
    const ordSel = corpo && $('#cm-ordem', corpo);
    if (ordSel && ordSel.value !== 'baratos') {
      ordSel.value = 'baratos';
      ordSel.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(450);
    }

    corpo = getCorpo();
    const busca = corpo && $('#cm-busca', corpo);
    if (busca) {
      busca.value = pk.species;
      busca.dispatchEvent(new Event('input', { bubbles: true }));
      busca.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(550);
    }

    // Para Pokémon treinado (Nv >= 200), filtra por nível mínimo compatível para não encher a 1ª página de Nv 100
    const useMinLv = Number.isFinite(pk.level) && pk.level >= 200 ? Math.floor(pk.level * 0.55) : 0;
    const setMinLevel = async val => {
      const c = getCorpo();
      const inp = c && $('#cm-nivel-min', c);
      if (!inp) return false;
      inp.value = val ? String(val) : '';
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      await sleep(650);
      return true;
    };
    if (useMinLv > 0) await setMinLevel(useMinLv);
    else await sleep(200);

    const readCurrency = async currency => {
      const c = getCorpo();
      if (!c) return [];
      const filtro = currency === 'gem' ? 'orb' : 'gold';
      const btn = $(`button.cm-moeda[data-moeda-filtro="${filtro}"]`, c)
        || $$('button.cm-moeda', c).find(b => (currency === 'gem' ? /gema|gem/i : /coins/i).test(b.textContent));
      if (btn && !btn.classList.contains('on')) {
        btn.click();
        await sleep(750);
      }
      return parseRmtPokemonCards(getCorpo(), currency);
    };

    let gemListings = await readCurrency('gem');
    let goldListings = PK_SELL.pokemonOnlyGems(pk) ? [] : await readCurrency('gold');

    // Fallback sem filtro de nível caso não haja nenhum anúncio no tier de nível alto
    if (useMinLv > 0 && (!gemListings.length || (!PK_SELL.pokemonOnlyGems(pk) && !goldListings.length))) {
      await setMinLevel(0);
      if (!gemListings.length) gemListings = await readCurrency('gem');
      if (!PK_SELL.pokemonOnlyGems(pk) && !goldListings.length) goldListings = await readCurrency('gold');
    }

    // Restaura filtros do RMT para não sujar a aba do usuário
    corpo = getCorpo();
    const bLimparEnd = corpo && $('#cm-limpar', corpo);
    if (bLimparEnd && !bLimparEnd.classList.contains('hidden')) { bLimparEnd.click(); await sleep(350); }
    else {
      const bTodas = corpo && $('button.cm-moeda[data-moeda-filtro="todas"]', corpo);
      if (bTodas && !bTodas.classList.contains('on')) { bTodas.click(); await sleep(250); }
    }
    return { goldListings, gemListings };
  }

  async function readPokemonHistoryBothCurrencies(getCorpo, pk, maxPages = 6) {
    const goldSales = [];
    const gemSales = [];
    let exhausted = false; // true quando leu até a última página (cobre os 30 dias do histórico)
    const corpo = getCorpo();
    const btnHist = corpo && $('#cm-historico-global', corpo);
    if (!btnHist) return { goldSales, gemSales, exhausted };
    btnHist.click();
    const leaf = await waitForSelector('.cm-folha', () => document, 2200);
    if (!leaf) return { goldSales, gemSales, exhausted };
    await sleep(300);

    const clickHist = async (sel, re) => {
      const f = $('.cm-folha');
      const b = f && ($(sel, f) || $$('button.cm-filtro', f).find(el => re.test(el.textContent.trim())));
      if (b && !b.classList.contains('on')) { b.click(); await sleep(450); }
    };
    await clickHist('button.cm-filtro[data-hist-tipo="pokemon"]', /^pok[eé]mon$/i);
    await clickHist('button.cm-filtro[data-hist-moeda=""]', /^(todas|all)$/i);
    if (pk.shiny) await clickHist('button.cm-filtro[data-hist-chave="soShiny"]', /shiny/i);
    if (Number(pk.potency) === 5) await clickHist('button.cm-filtro[data-hist-chave="soP5"]', /\bP5\b/i);

    const fInp = $('.cm-folha #cm-hist-busca');
    if (fInp) {
      fInp.value = pk.species;
      fInp.dispatchEvent(new Event('input', { bubbles: true }));
      fInp.dispatchEvent(new Event('change', { bubbles: true }));
      // A tabela mantém as linhas antigas ~2s, zera e só então mostra as filtradas (~3s): espera a espécie aparecer
      const want = PK_SELL.norm(pk.species);
      const t0 = Date.now();
      let matched = false;
      while (Date.now() - t0 < 8000) {
        await sleep(200);
        const f0 = $('.cm-folha');
        const first = f0 && $('.cm-hist-linha .cm-hist-item', f0);
        if (first && PK_SELL.norm(first.textContent).includes(want)) { matched = true; break; }
      }
      if (!matched) log('venda: histórico não carregou linhas de', pk.species, 'em 8s (sem vendas ou lento)');
      else await sleep(250);
    }

    let prevSig = '';
    for (let page = 1; page <= maxPages; page++) {
      const f = $('.cm-folha');
      if (!f) break;
      const rows = $$('.cm-hist-linha', f);
      const sig = rows.slice(0, 3).map(r => r.textContent.trim()).join('|');
      if (!rows.length) { exhausted = true; break; }
      if (page > 1 && sig === prevSig) { exhausted = true; break; }
      prevSig = sig;
      for (const r of rows) {
        const itemEl = $('.cm-hist-item', r);
        const valEl = $('.cm-hist-valor', r);
        const dateEl = $('.cm-hist-data', r);
        const isOrb = !!$('.cm-preco.orb', r);
        const isShiny = !!$('.cm-selo-shiny, .shiny', r) || /✨/.test((itemEl && itemEl.textContent) || '');
        const parsed = PK_SELL.parsePokemonHistoryRow({
          itemTitle: (itemEl && itemEl.title) || '',
          itemText: (itemEl && itemEl.textContent) || '',
          valueText: (valEl && valEl.textContent) || '',
          isOrb,
          isShiny,
          dateText: (dateEl && dateEl.textContent) || '',
        });
        if (!parsed) continue;
        if (parsed.currency === 'gem') gemSales.push(parsed);
        else goldSales.push(parsed);
      }
      const nextBtn = $$('button.cm-pag', f).find(b => b.textContent.trim() === '›' && !b.disabled);
      if (!nextBtn) { exhausted = true; break; }
      if (page >= maxPages) break;
      nextBtn.click();
      const t0 = Date.now();
      while (Date.now() - t0 < 5000) {
        await sleep(180);
        const f2 = $('.cm-folha');
        const rows2 = f2 ? $$('.cm-hist-linha', f2) : [];
        const sig2 = rows2.slice(0, 3).map(r => r.textContent.trim()).join('|');
        if (rows2.length && sig2 !== prevSig) break;
      }
    }

    await closeRmtLeaf();
    return { goldSales, gemSales, exhausted };
  }

  async function analyzeSelectedSale(targetKey = null) {
    if (typeof PK_SELL === 'undefined') return log('venda: módulo PK_SELL indisponível');
    if (sellState.scanning || sellState.loading) return;
    if (busy) { renderSell('Aguarde: outra ação em andamento.'); return; }

    if (targetKey) {
      sellState.selectedKey = targetKey;
      sellState.qtyOverride = null;
    }
    let entry = findSellEntry(sellState.selectedKey);
    if (!entry) {
      await loadSellInventory();
      entry = findSellEntry(sellState.selectedKey);
      if (!entry) {
        renderSell('Nenhum item ou Pokémon encontrado no inventário.');
        return null;
      }
    }

    busy = true;
    sellState.scanning = true;
    const voltarUltra = energyNow() === 'ultra';
    const wasOpen = !!($('.modal-caixa[data-modal="community"]') && $('.modal-caixa[data-modal="community"]').offsetParent);
    const getCorpo = () => { const m = $('.modal-caixa[data-modal="community"]'); return (m && m.offsetParent) ? ($('#modal-corpo', m) || m) : null; };
    renderSell(`Analisando ${entry.kind === 'item' ? entry.name : entry.species} em Gold e Gemas...`);
    try {
      if (voltarUltra && !(await leaveUltra())) {
        renderSell('Não consegui sair do modo ULTRA.');
        return null;
      }
      if (!wasOpen) {
        await closeModal();
        const nav = navBtn('community');
        if (!nav) { renderSell('Botão RMT não encontrado.'); return null; }
        nav.click();
        await waitForSelector('.modal-caixa[data-modal="community"] #cm-anunciar', () => document, 3500);
        await sleep(300);
      }
      if (!getCorpo()) { renderSell('Modal RMT não abriu.'); return null; }
      await closeRmtLeaf();

      // Garante taxa de câmbio Coins/Gema (Radar RMT em cache ou leitura rápida da lista de itens)
      let exchangeRate = PK_SELL.extractExchangeRate({ rmtRoutes: rmtState.last?.routes || [] });

      const ensureItemsAllTab = async () => {
        let c = getCorpo(); if (!c) return null;
        const bIt = $('button.cm-filtro[data-tipo="item"]', c)
          || $$('button.cm-filtro', c).find(b => /^(itens|items)$/i.test(b.textContent.trim()));
        if (bIt && !bIt.classList.contains('on')) { bIt.click(); await sleep(650); }
        c = getCorpo(); if (!c) return null;
        const bAll = $('button.cm-filtro[data-cat=""]', c)
          || $$('button.cm-filtro', c).find(b => /^(todas|all)$/i.test(b.textContent.trim()));
        if (bAll && !bAll.classList.contains('on')) { bAll.click(); await sleep(550); }
        return getCorpo();
      };

      let result = null;
      let eligibilityNote = '';

      if (entry.kind === 'item') {
        const qty = Math.max(1, sellState.qtyOverride || entry.qty || 1);
        const corpo = await ensureItemsAllTab();
        if (!corpo) throw new Error('Aba Itens do RMT indisponível');
        if (!exchangeRate) exchangeRate = readExchangeRateFromOpenItemList(corpo);

        const row = $(`.cmi-linha[data-item="${entry.id}"]`, corpo)
          || $$('.cmi-linha', corpo).find(el => PK_SELL.norm(($('.cmi-nome b', el) || {}).textContent) === PK_SELL.norm(entry.name));
        let goldBook = { offers: [], avg7d: null, vol7d: null };
        let gemBook = { offers: [], avg7d: null, vol7d: null };

        if (row) {
          renderSell(`Lendo book Gold e Gemas de ${entry.name}...`);
          row.click();
          await sleep(450);
          const g1 = await waitForItemCurrencyBook(entry.id, 'gold', '');
          goldBook = g1.parsed;
          const o1 = await waitForItemCurrencyBook(entry.id, 'gem', g1.sig);
          gemBook = o1.parsed;
        }

        renderSell(`Lendo vendas comprovadas de ${entry.name}...`);
        const { goldSales, gemSales } = await readItemHistoryBothCurrencies(getCorpo, entry.name, 3);

        result = PK_SELL.analyzeItemSale({
          name: entry.name,
          qty,
          goldBook,
          gemBook,
          goldSales,
          gemSales,
          exchangeRate,
        });
      } else {
        if (entry.eligible === false) {
          eligibilityNote = `Este Pokémon não atende ao mínimo do RMT (${entry.eligReason}). Valores abaixo são referência caso atinja os requisitos.`;
        }
        if (!exchangeRate) {
          renderSell('Lendo câmbio Coins/Gema no RMT...');
          const corpoIt = await ensureItemsAllTab();
          exchangeRate = readExchangeRateFromOpenItemList(corpoIt);
        }

        renderSell(`Buscando anúncios similares de ${entry.species}...`);
        const { goldListings, gemListings } = await readPokemonMarketListings(getCorpo, entry);

        renderSell(`Lendo histórico de vendas de ${entry.species}...`);
        const { goldSales, gemSales, exhausted: salesExhausted } = await readPokemonHistoryBothCurrencies(getCorpo, entry, 6);

        result = PK_SELL.analyzePokemonSale({
          pokemon: entry,
          goldListings,
          gemListings,
          goldSales,
          gemSales,
          exchangeRate,
          salesExhausted,
        });
        const sample = a => JSON.stringify(a.slice(0, 2).map(x => ({ sp: x.species, lv: x.level, p: x.potency, n: x.nota, sh: x.shiny, pr: x.price })));
        const diag = `lidos: anúncios ouro ${goldListings.length}/gema ${gemListings.length}, vendas ouro ${goldSales.length}/gema ${gemSales.length} · alvo "${entry.species}" sh=${!!entry.shiny} P${entry.potency} N${entry.nota} Nv${entry.level}`;
        result.warnings = [...(result.warnings || []), diag];
        log('venda diag:', diag, 'anúncios gema', sample(gemListings), 'vendas gema', sample(gemSales));
      }

      sellState.last = { at: Date.now(), key: sellState.selectedKey, eligibilityNote, result };
      saveSell();
      log('venda:', `${result.name} -> ${result.headline}`);
      return sellState.last;
    } catch (e) {
      log('venda erro:', e.message);
      renderSell('Erro ao analisar venda: ' + e.message);
      return null;
    } finally {
      await closeRmtLeaf();
      if (!wasOpen) await closeModal();
      if (voltarUltra) await reenterUltra();
      sellState.scanning = false;
      busy = false;
      renderSell();
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

  function applyRecommendedBall(ballOrRec, { silentRender = false } = {}) {
    if (typeof PK_BALL === 'undefined') return null;
    const upd = PK_BALL.buildBallRestockConfig(ballOrRec, BALLS);
    if (!upd) return null;
    CFG.ball = upd.ball;
    CFG.ballMin = upd.ballMin;
    CFG.ballBuy = upd.ballBuy;
    if (ballSelEl) ballSelEl.value = upd.ball;
    if (ballMinEl) ballMinEl.value = upd.ballMin;
    if (ballBuyEl) ballBuyEl.value = upd.ballBuy;
    saveCfg();
    log('analisador: reposição atualizada p/', upd.ball, `(mín. ${upd.ballMin}, repor ${upd.ballBuy})`);
    if (!silentRender) renderBall();
    return upd;
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
      const already = CFG.ball === rec.name && CFG.ballMin === PK_BALL.DEFAULT_RESTOCK_MIN && CFG.ballBuy === PK_BALL.DEFAULT_RESTOCK_BUY;
      const useBtn = mk('button',
        `all:unset;cursor:pointer;padding:1px 6px;border-radius:4px;font-size:9.5px;border:1px solid ${accent}88;background:${already ? '#fff2' : accent + '33'};color:#fff`,
        already ? 'Em uso' : 'Usar');
      useBtn.title = `Configurar ${rec.name} (mín. ${PK_BALL.DEFAULT_RESTOCK_MIN}, repor ${PK_BALL.DEFAULT_RESTOCK_BUY}) como Pokébola padrão do bot`;
      useBtn.onclick = () => applyRecommendedBall(rec);
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

  async function analyzeCurrentHuntBalls({ nested = false } = {}) {
    if (typeof PK_BALL === 'undefined') return;
    if (ballState.scanning) return;
    if (!nested && busy) { renderBall('Aguarde a ação atual terminar e tente de novo.'); return; }
    if (!inHunt()) { renderBall('Entre em uma hunt ativa primeiro (não funciona no Centro/Safari).'); return; }

    ballState.scanning = true;
    if (!nested) busy = true;
    const wasUltra = !nested && energyNow() === 'ultra';
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
      applyRecommendedBall(res.recommended, { silentRender: true });
    } catch (e) {
      log('analisador erro:', e.message);
      renderBall('Erro: ' + e.message);
      return;
    } finally {
      if (!wasOpen) await closeModal();
      if (wasUltra) await reenterUltra();
      ballState.scanning = false;
      if (!nested) busy = false;
      renderBall();
    }
  }

  // ---------- loop (Worker evita throttle em aba em segundo plano) ----------
  let lastTick = Date.now(), lastSupply = 0, warnedCapture = false;
  async function tick() {
    try {
      const now = Date.now(), gap = now - lastTick; lastTick = now;
      if (gap > 8000) { log('relógio ficou parado', Math.round(gap / 1000) + 's (aba oculta/freada?) - checando estoque já'); lastSupply = 0; }
      captureTick();
      readRmtListPassive();
      const curG = gold(), curGm = gems();
      if (!rmtState.scanning && rmtState.last && (Math.abs(curG - lastRmtGold) >= Math.max(1e6, lastRmtGold * 0.01) || curGm !== lastRmtGems)) renderRmt();
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
  const rmtReversePlan = () => (rmtState.last && typeof PK_RMT !== 'undefined')
    ? PK_RMT.buildGemToGoldActionPlan({ routes: rmtState.last.routes, gems: gems(), source: rmtState.last.source })
    : null;
  const rmtTradingPlan = () => (rmtState.last && typeof PK_RMT !== 'undefined')
    ? PK_RMT.buildTradingPlan({ routes: rmtState.last.routes, gold: gold(), gems: gems(), source: rmtState.last.source })
    : null;
  window.__pkBot = { CFG, st, log, buy, checkSupplies, captureTick, huntState, analyzeHunts, runHuntCheck, rmtState, rmtPlan, rmtReversePlan, rmtTradingPlan, scanRmt, stoneState, planSellStones, sellAllStones, sellState, loadSellInventory, analyzeSelectedSale, ballState, analyzeCurrentHuntBalls, applyRecommendedBall, xpEvents, potChips, ballQty, gold, gems, scanHunts, switchTo, closeModal, applyLite };
  const boot = () => {
    // o painel continua visível no ULTRA Economia (que esconde o resto do jogo)
    const css = document.createElement('style'); css.textContent = 'html.modo-ultra body #pkbot-panel:not(.pk-oculto){display:flex!important;visibility:visible!important}'; document.head.append(css);
    buildPanel(); applyFps(); applyLite(); watch(); startTimer(); log('PokeIdle Helper pronto', CFG.dry ? '(DRY-RUN)' : '');
    if (globalThis.__pkServer) {
      const syncTitle = () => {
        const nick = ($('#tr-nome, #tr-name, .tr-nome')?.textContent || '').trim();
        if (nick) { const want = nick + ' · Pokeidle'; if (document.title !== want) document.title = want; }
      };
      setTimeout(syncTitle, 3000);
      setInterval(syncTitle, 15000);
    }
  };
  document.body ? boot() : addEventListener('DOMContentLoaded', boot);
})();
