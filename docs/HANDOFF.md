# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-19. Versão no repo: `0.7.2` (bump `0.7.3` pendente no working tree junto com `server-flag.js` de outra frente). Último commit de código: `9f03bda`. Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 40 passando (`types.js` + `hunt.js` + `rmt.js` + `ball.js`). Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Respeitar Termos §5 do PokeIdle (só cliques no DOM, sem API direta, sem mexer em login/anti-robô).

## Estado atual (2026-11-19)
- Extensão MV3 com 4 modos (Captura, Repor bolas/poções, Captura eterna, **Gerenciador de hunt v3 100% automático**) + **Analisador Otimizado de Pokébola** (`ball.js`) + **Radar RMT (Ouro → Gema)** (`rmt.js`) + deploy multi-conta/low-CPU (`deploy/`, commits `11c48c8`..`0ccf92a`).
- **Fix no Gerenciador de hunt v3 (`hunt.js` + `tests/hunt.test.mjs`, `9f03bda`):** corrigida a recomendação de hunts 1-hit low-level (ex.: Diglett Nv 10 92k XP/h vs Rhyhorn Nv 30 198k XP/h na conta Shaolas Squirtle Nv 34). Removida dupla penalidade de `potionRatio > 0.25` e `kph < 240`, risco de morte agora considera burst e DPS vs cura do Auto-Potion, foco `Equilibrado` usa utilidade côncava (`sqrt`) no lucro líquido positivo e redireciona peso de Outland para XP/h antes do Nv 150. Validado em Node (40/40 testes); ainda **não validado ao vivo** no Chrome.
- **Working tree paralelo preservado:** há alterações não commitadas de outra frente (`server-flag.js`, `deploy/server-flag.js`, `manifest.json`, `fps.js`, `content.js`, `deploy/docker-compose.yml`) que não foram tocadas nem commitadas nesta sessão.

## Próximos passos (ordem)
1. Validar ao vivo no Chrome (conta Shaolas Nv 34) o Gerenciador de hunt v3 pós-`9f03bda` (confirmar troca automática de Diglett Nv 10 para Rhyhorn Nv 30+ em `Equilibrado`/`XP` e validar modos **Economia** e **ULTRA Economia**).
2. Revisar/finalizar a frente paralela no working tree (`server-flag.js`, `manifest.json` `0.7.3`, `fps.js`, `content.js`, `deploy/docker-compose.yml`).
3. Validar o **Analisador de Pokébola** ao vivo após scan completo do Radar RMT, em hunt com Shiny/Shiny Lure e em hunt mista (>1 espécie).
4. Validar pendências de gameplay em `docs/PROGRESS.md` via `/study-game` (`captureRe` com captura real, compra real no `ultraSupplyTick`).

## Pendente do usuário
- Recarregar a extensão em `chrome://extensions` e recarregar as abas `pokeidle.io/app` para receber o rebalanceamento do Gerenciador de hunt v3 (`9f03bda`).
- Rodar `Escanear` no Radar RMT uma vez para alimentar o Analisador de Pokébola com os pisos reais de Pokémon (N ≥ 3,5, P5 e Shiny).

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP).
