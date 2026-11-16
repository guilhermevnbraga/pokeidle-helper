/* Limita a taxa de quadros do jogo. Roda no mundo da página (world MAIN), antes do jogo carregar.
   O jogo é todo calculado no servidor; a cena só precisa existir (a lista de captura depende dela),
   então desenhar 10 quadros/s em vez de 60 corta quase todo o gasto de CPU do navegador.
   A taxa vem de `pkbot-cfg` (localStorage) e muda ao vivo pelo evento 'pk-fps' (0 = sem limite). */
(() => {
  if (window.__pkFps) return;
  window.__pkFps = true;
  const raf = window.requestAnimationFrame.bind(window);
  let fps = 10;
  try { const c = JSON.parse(localStorage.getItem('pkbot-cfg') || '{}'); if ('fps' in c) fps = +c.fps; } catch (e) {}
  document.addEventListener('pk-fps', e => { fps = +e.detail || 0; });

  const pending = new Map();
  let nextId = 1, armed = false, last = 0;
  const arm = delay => { if (armed) return; armed = true; delay > 4 ? setTimeout(() => raf(pump), delay) : raf(pump); };
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
  // ---- perfilador temporário: quais temporizadores/mensagens do jogo gastam mais tempo da thread principal ----
  const prof = {}; let pT0 = performance.now();
  const site = () => { const f = (new Error().stack || '').split('\n').slice(3).find(l => !/fps\.js/.test(l)) || '?'; return f.trim().replace(/^at\s+/, '').slice(-70); };
  const rec = (tag, ms) => { const p = prof[tag] || (prof[tag] = { n: 0, ms: 0 }); p.n++; p.ms += ms; };
  const wrap = (kind, fn) => { if (typeof fn !== 'function') return fn; const tag = kind + ' ' + site(); return function () { const t = performance.now(); try { return fn.apply(this, arguments); } finally { rec(tag, performance.now() - t); } }; };
  const oST = window.setTimeout, oSI = window.setInterval;
  window.setTimeout = function (fn, d, ...a) { return oST.call(this, wrap('T', fn), d, ...a); };
  window.setInterval = function (fn, d, ...a) { return oSI.call(this, wrap('I', fn), d, ...a); };
  try {
    const d = Object.getOwnPropertyDescriptor(WebSocket.prototype, 'onmessage');
    Object.defineProperty(WebSocket.prototype, 'onmessage', { get: d.get, set(fn) { d.set.call(this, wrap('WS', fn)); } });
    const ael = WebSocket.prototype.addEventListener;
    WebSocket.prototype.addEventListener = function (t, fn, o) { return ael.call(this, t, t === 'message' ? wrap('WS', fn) : fn, o); };
  } catch (e) {}
  oSI.call(window, () => {
    const s = (performance.now() - pT0) / 1000; pT0 = performance.now();
    const top = Object.entries(prof).sort((a, b) => b[1].ms - a[1].ms).slice(0, 5).map(([k, v]) => `${k} | ${(v.n / s).toFixed(1)}/s ${(v.ms / s).toFixed(1)}ms/s`);
    for (const k in prof) delete prof[k];
    document.dispatchEvent(new CustomEvent('pk-prof', { detail: top }));
  }, 30000);

  window.requestAnimationFrame = cb => { const id = nextId++; pending.set(id, cb); arm(0); return id; };
  window.cancelAnimationFrame = id => { pending.delete(id); };
})();
