/* Lógica pura do Gerenciador de Hunt (decisão, detecção da hunt atual e parsers de espera/Centro Pokémon). */
const PK_HUNT = (() => {
  // Normaliza o nome exibido em #hud-hunt / #eco-onde ("Geodude · nível 1", "Geodude · Outland 2 · nível 100")
  // ou no atributo title do marcador ("Geodude — nível 1\n...").
  function normalizeHuntName(raw) {
    if (!raw) return '';
    return String(raw)
      .split(/\r?\n/)[0]
      .split(/\s*[·—]\s*/)[0]
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  // Só considera que já estamos na hunt alvo se estivermos em campo (inHunt === true).
  // No Centro Pokémon, o marcador anterior pode continuar com `.on`, mas o jogador ainda precisa entrar na hunt.
  function isSameHunt({ inHunt, curSlug, curName, targetSlug, targetName }) {
    if (!inHunt) return false;
    if (curSlug && targetSlug) return curSlug === targetSlug;
    const a = normalizeHuntName(curName);
    const b = normalizeHuntName(targetName);
    return !!(a && b && a === b);
  }

  // Seleciona a melhor hunt e decide entre ficar ('stay') ou trocar ('switch').
  // Nunca manda trocar para a hunt onde o jogador já está em campo.
  function pickBestHunt({ hunts, myTypes = [], curSlug = null, curName = '', inHunt = true, minRatio = 0.5, huntGain = 1.1, matchupFn }) {
    const entries = Object.entries(hunts || {});
    if (!entries.length) return { action: 'none', reason: 'empty', best: null, current: null, ranked: [] };

    const normCur = normalizeHuntName(curName);
    const ranked = entries.map(([slug, h]) => {
      const m = matchupFn(myTypes, h.types || []);
      const score = (h.xp || 0) * Math.min(1, m.ratio);
      const ok = m.off > 0 && m.ratio >= minRatio;
      const nome = normalizeHuntName(h.nome || slug);
      return { ...h, slug, nome, m, score, ok };
    });

    const current = inHunt
      ? (ranked.find(h => curSlug && h.slug === curSlug)
        || ranked.find(h => normCur && h.nome === normCur)
        || null)
      : null;

    const pool = ranked.some(h => h.ok) ? ranked.filter(h => h.ok) : ranked.slice();
    pool.sort((a, b) =>
      (b.score - a.score)
      || (b.m.ratio - a.m.ratio)
      || ((b.gold || 0) - (a.gold || 0))
      || ((current && b.slug === current.slug) - (current && a.slug === current.slug))
    );

    const best = pool[0];
    if (isSameHunt({ inHunt, curSlug: current ? current.slug : curSlug, curName: current ? current.nome : normCur, targetSlug: best.slug, targetName: best.nome })) {
      return { action: 'stay', reason: 'already-best', best, current, ranked: pool };
    }

    if (current && current.ok && best.score <= current.score * huntGain) {
      return { action: 'stay', reason: 'gain-below-threshold', best, current, ranked: pool };
    }

    return { action: 'switch', reason: current ? 'better-hunt' : 'enter-hunt', best, current, ranked: pool };
  }

  // Extrai segundos restantes do contador do botão de Centro Pokémon ("2.4s", "3s", "").
  function parseCenterCountdownSec(text) {
    if (!text) return 0;
    const m = String(text).match(/(\d+(?:[.,]\d+)?)\s*s/i);
    return m ? parseFloat(m[1].replace(',', '.')) : 0;
  }

  // O botão "Ir para o Centro Pokemon" (#ir-centro / #eco-ir-centro) só está livre fora dos 3s de combate.
  function isCenterButtonReady({ exists, hidden, disabled, countdownText = '' }) {
    if (!exists || hidden || disabled) return false;
    return parseCenterCountdownSec(countdownText) <= 0;
  }

  // Extrai espera (em segundos) de toasts de bloqueio em PT/EN:
  // - combate: "Em combate — espere 2.4s sem tomar nem dar dano" / "In combat — wait 2.4s"
  // - porta de troca de hunt: "Espere 5s para trocar de hunt" / "Wait 5s..."
  function parseWaitToast(text) {
    if (!text) return null;
    const s = String(text);
    const combat = s.match(/(?:em combate|in combat).*?(?:espere|aguarde|wait)\s*(\d+(?:[.,]\d+)?)\s*s/i);
    if (combat) return { kind: 'combat', sec: parseFloat(combat[1].replace(',', '.')) };
    const gate = s.match(/(?:espere|aguarde|wait)\s*(\d+(?:[.,]\d+)?)\s*s/i);
    if (gate) return { kind: 'cooldown', sec: parseFloat(gate[1].replace(',', '.')) };
    return null;
  }

  return { normalizeHuntName, isSameHunt, pickBestHunt, parseCenterCountdownSec, isCenterButtonReady, parseWaitToast };
})();
if (typeof module !== 'undefined') module.exports = PK_HUNT;
