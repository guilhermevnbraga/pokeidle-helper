/* Limita a taxa de quadros do jogo. Roda no mundo da página (world MAIN), antes do jogo carregar.
   O jogo é todo calculado no servidor; a cena só precisa existir (a lista de captura depende dela),
   então desenhar 10 quadros/s em vez de 60 corta quase todo o gasto de CPU do navegador.
   A taxa vem de `pkbot-cfg` (localStorage) e muda ao vivo pelo evento 'pk-fps' (0 = sem limite). */
(() => {
  if (window.__pkFps) return;
  window.__pkFps = true;
  const raf = window.requestAnimationFrame.bind(window);
  let fps = globalThis.__pkServer ? 2 : 10;
  try { const c = JSON.parse(localStorage.getItem('pkbot-cfg') || '{}'); if ('fps' in c) fps = +c.fps; } catch (e) {}
  document.addEventListener('pk-fps', e => { fps = +e.detail || 0; });

  const pending = new Map();
  let nextId = 1, armed = false, last = 0;
  let token = 0;
  // aba oculta: o Chrome pausa requestAnimationFrame, então a cena (e a lista de captura) pararia; usa timer
  const arm = delay => {
    if (armed) return;
    armed = true;
    const my = ++token;
    if (document.hidden) { setTimeout(() => { if (my === token) pump(performance.now()); }, Math.max(delay, 100)); return; }
    const go = () => raf(ts => { if (my === token) pump(ts); });
    delay > 4 ? setTimeout(go, delay) : go();
  };
  document.addEventListener('visibilitychange', () => { armed = false; token++; if (pending.size) arm(0); });
  // aba oculta: timers da página são limitados (~1/min); o relógio da extensão (Worker) empurra a cena todo segundo
  document.addEventListener('pk-pump', () => { if (document.hidden && pending.size) { armed = false; token++; pump(performance.now()); } });
  function pump(ts) {
    armed = false;
    const gap = fps > 0 ? 1000 / fps : 0;
    if (ts - last < gap - 2) { arm(gap - (ts - last)); return; }
    last = ts;
    const batch = [...pending]; pending.clear();
    const t = performance.now();
    for (const [, cb] of batch) { try { cb(ts); } catch (err) { setTimeout(() => { throw err; }); } }
    frames++; jsMs += performance.now() - t;
    if (pending.size) arm(0);
  }
  // diagnóstico: a cada 30 s informa quadros/s reais e ms/s gastos no JS da cena (aparece no log do painel)
  let frames = 0, jsMs = 0, t0 = performance.now();
  setInterval(() => {
    const s = (performance.now() - t0) / 1000;
    document.dispatchEvent(new CustomEvent('pk-stat', { detail: { fps: +(frames / s).toFixed(1), ms: Math.round(jsMs / s), limite: fps } }));
    frames = 0; jsMs = 0; t0 = performance.now();
  }, 30000);
  // Timers do próprio jogo (setTimeout/setInterval): em aba oculta o Chrome os limita a ~1/min (throttling intenso),
  // o que congela a lista de captura. Cada timer ganha um "segundo despertador" num Worker (não é limitado);
  // vale o que disparar primeiro e o outro é cancelado. Se o Worker for bloqueado (CSP), nada muda.
  try {
    const nSet = window.setTimeout.bind(window), nClr = window.clearTimeout.bind(window);
    const nSetI = window.setInterval.bind(window), nClrI = window.clearInterval.bind(window);
    // Só liga o ticker de 100 ms no Worker quando a aba está oculta (0 wakeups/s enquanto visível)
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
      // o nativo só é re-armado pelo próprio disparo; para evitar disparo duplo usa a mesma tabela
      t.nat = nSetI(() => { if (!table.has(id)) return; if (performance.now() < t.due - 5) return; fire(id, t); }, ms);
      table.set(id, t); return id;
    };
    window.clearTimeout = id => { const t = table.get(id); if (t) { table.delete(id); nClr(t.nat); } else nClr(id); };
    window.clearInterval = id => { const t = table.get(id); if (t) { table.delete(id); nClrI(t.nat); } else nClrI(id); };
  } catch (e) {}

  window.requestAnimationFrame = cb => { const id = nextId++; pending.set(id, cb); arm(0); return id; };
  window.cancelAnimationFrame = id => { pending.delete(id); };
})();
