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
  window.requestAnimationFrame = cb => { const id = nextId++; pending.set(id, cb); arm(0); return id; };
  window.cancelAnimationFrame = id => { pending.delete(id); };
})();
