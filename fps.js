/* Limita a taxa de quadros APENAS do desenho do mapa (Campo.loop em campo.mjs) e do posicionamento
   de botões do Centro (seguirEnfermeira). Roda no mundo da página (world MAIN), antes do jogo carregar.
   Combate, XP/h, ouro, poções e lista de captura (#caidos-lista) vêm 100% do WebSocket + setInterval(250ms),
   sem depender do desenho do canvas — então toda a interface (Market, RMT, Coleção, filtros, cliques)
   continua em 60 FPS nativos e instantâneos, mesmo com o mapa em 0.2 FPS ou minimizado.
   A taxa vem de `pkbot-cfg` (localStorage) e muda ao vivo pelo evento 'pk-fps' (0 = sem limite). */
(() => {
  if (window.__pkFps) return;
  window.__pkFps = true;
  const nRaf = window.requestAnimationFrame.bind(window);
  const nCaf = window.cancelAnimationFrame.bind(window);
  let fps = globalThis.__pkServer ? 0.2 : 10;
  try { const c = JSON.parse(localStorage.getItem('pkbot-cfg') || '{}'); if ('fps' in c) fps = +c.fps; } catch (e) {}

  // Identifica loops contínuos da cena; qualquer outro rAF (UI, modais, filtros, scrolls) passa direto ao nativo
  const isSceneLoop = cb => { const n = cb && cb.name; return n === 'bound loop' || n === 'loop'; };
  const isNpcFollow = cb => !!(cb && cb.name === 'seguirEnfermeira');

  // Agendador reutilizável por grupo (cena vs seguirEnfermeira), pausando automaticamente quando oculto
  function makeLimiter(getFps, trackStats) {
    const pending = new Map();
    let armed = false, last = 0, token = 0, timerId = 0, rafId = 0;
    const cancel = () => {
      if (timerId) { clearTimeout(timerId); timerId = 0; }
      if (rafId) { nCaf(rafId); rafId = 0; }
      armed = false; token++;
    };
    const arm = delay => {
      if (armed || document.hidden || !pending.size) return;
      armed = true;
      const my = ++token;
      const go = () => {
        timerId = 0;
        rafId = nRaf(ts => { rafId = 0; if (my === token) pump(ts); });
      };
      if (delay > 4) timerId = setTimeout(go, delay);
      else go();
    };
    const pump = ts => {
      armed = false;
      if (document.hidden) return;
      const lim = getFps();
      const gap = lim > 0 ? 1000 / lim : 0;
      if (gap > 0 && ts - last < gap - 2) { arm(gap - (ts - last)); return; }
      last = ts;
      const batch = [...pending]; pending.clear();
      const t = performance.now();
      for (const [, cb] of batch) { try { cb(ts); } catch (err) { setTimeout(() => { throw err; }); } }
      if (trackStats) { frames++; jsMs += performance.now() - t; }
      if (pending.size) arm(0);
    };
    return {
      add(id, cb) { pending.set(id, cb); arm(0); },
      del(id) { return pending.delete(id); },
      kick() { cancel(); last = 0; if (pending.size) arm(0); },
      onVis() { if (document.hidden) cancel(); else if (pending.size) arm(0); },
    };
  }

  let frames = 0, jsMs = 0, t0 = performance.now();
  const sceneLim = makeLimiter(() => fps, true);
  const npcLim = makeLimiter(() => (fps > 0 && fps < 10 ? Math.max(2, Math.min(fps, 2)) : fps), false);

  document.addEventListener('pk-fps', e => {
    fps = +e.detail || 0;
    sceneLim.kick();
    npcLim.kick();
  });
  document.addEventListener('visibilitychange', () => {
    sceneLim.onVis();
    npcLim.onVis();
  });

  // diagnóstico: a cada 30 s informa quadros/s reais e ms/s gastos no JS do mapa (aparece no console)
  setInterval(() => {
    const s = (performance.now() - t0) / 1000;
    document.dispatchEvent(new CustomEvent('pk-stat', { detail: { fps: +(frames / s).toFixed(1), ms: Math.round(jsMs / s), limite: fps } }));
    frames = 0; jsMs = 0; t0 = performance.now();
  }, 30000);

  // Timers do próprio jogo (setTimeout/setInterval): em aba oculta o Chrome os limita a ~1/min,
  // o que congelaria pintarCaidos (250ms). Cada timer ganha despertador num Worker (100ms, só ligado quando oculto).
  try {
    const nSet = window.setTimeout.bind(window), nClr = window.clearTimeout.bind(window);
    const nSetI = window.setInterval.bind(window), nClrI = window.clearInterval.bind(window);
    const wCode = 'let t=0;onmessage=e=>{if(e.data){if(!t)t=setInterval(()=>postMessage(0),100);}else if(t){clearInterval(t);t=0;}};';
    const w = new Worker(URL.createObjectURL(new Blob([wCode], { type: 'text/javascript' })));
    const syncWorker = () => w.postMessage(!!document.hidden);
    document.addEventListener('visibilitychange', syncWorker);
    syncWorker();
    const table = new Map(); // id -> { due, every, fn, args, nat }
    let seq = 1e9;
    const fire = (id, t) => {
      if (t.every != null) { t.due = performance.now() + t.every; } else { table.delete(id); nClr(t.nat); }
      try { typeof t.fn === 'function' ? t.fn(...t.args) : (0, eval)(String(t.fn)); } catch (err) { nSet(() => { throw err; }); }
    };
    w.onmessage = () => {
      if (!document.hidden || !table.size) return;
      const now = performance.now();
      for (const [id, t] of [...table]) if (table.has(id) && now >= t.due) fire(id, t);
    };
    window.setTimeout = (fn, ms, ...args) => {
      ms = Math.max(0, +ms || 0);
      const id = ++seq, t = { due: performance.now() + ms, every: null, fn, args };
      t.nat = nSet(() => { if (table.has(id)) fire(id, t); }, ms);
      table.set(id, t); return id;
    };
    window.setInterval = (fn, ms, ...args) => {
      ms = Math.max(1, +ms || 0);
      const id = ++seq, t = { due: performance.now() + ms, every: ms, fn, args };
      t.nat = nSetI(() => { if (!table.has(id)) return; if (performance.now() < t.due - 5) return; fire(id, t); }, ms);
      table.set(id, t); return id;
    };
    window.clearTimeout = id => { const t = table.get(id); if (t) { table.delete(id); nClr(t.nat); } else nClr(id); };
    window.clearInterval = id => { const t = table.get(id); if (t) { table.delete(id); nClrI(t.nat); } else nClrI(id); };
  } catch (e) {}

  let customId = 1e9;
  window.requestAnimationFrame = cb => {
    if (fps > 0 && isSceneLoop(cb)) {
      const id = ++customId;
      sceneLim.add(id, cb);
      return id;
    }
    if (fps > 0 && fps < 10 && isNpcFollow(cb)) {
      const id = ++customId;
      npcLim.add(id, cb);
      return id;
    }
    return nRaf(cb);
  };
  window.cancelAnimationFrame = id => {
    if (id >= 1e9) { sceneLim.del(id); npcLim.del(id); return; }
    nCaf(id);
  };
})();
