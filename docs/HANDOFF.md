# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-18 (setup do ambiente Antigravity + MCP Chrome DevTools). Versão da extensão: `0.3.0`. Último commit de código da extensão: `64e8d11`. Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 3 passando (`types.js`). Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Respeitar Termos §5 do PokeIdle (só cliques no DOM, sem API direta, sem mexer em login/anti-robô).

## Estado (2026-11-18)
- Extensão MV3 funcional com 4 modos: (1) Captura (para ao capturar), (2) Repor bolas/poções, (3) Captura eterna, (4) Gerenciador de hunt via Hunt Analyser + tabela de tipos (`types.js`).
- Suporte a segundo plano (Worker para timers do jogo em `fps.js`, Worker de loop em `content.js`, alarme de 30 s + `autoDiscardable: false` em `background.js`, keep-alive opcional).
- Limite de FPS configurável (`fps.js`, padrão 10 fps) e saída periódica do ULTRA Economia para atualizar estoques (`ultraSupplyTick`).
- Deploy 24/7 Docker + Selkies pronto em `deploy/` (Proxmox).
- Ambiente Antigravity montado: `AGENTS.md`, hook `SessionStart` (`scripts/hooks/session-start.mjs`), hook Git `pre-commit` (`scripts/check.mjs`), plugin de workspace `chrome-browser` (`chrome-devtools-mcp` com `--auto-connect`), skills `/handoff`, `/study-game` e `/feature`, docs estruturados em `docs/`.

## Estudo do jogo (resumo — detalhes em `docs/GAME_STUDY.md`)
- Seletores atuais já mapeados de `content.js` (HUD, Market, Mapa, Hunt Analyser, captura, ULTRA) e registrados em `docs/GAME_STUDY.md`.
- Ainda falta conectar no Chrome ao vivo via MCP para iniciar o estudo aprofundado do `pokeidle.io/app` (captura real, novas mecânicas do jogo, eventos/toasts, equipe vs Pokémon em campo).

## Próximos passos (ordem)
1. Validar conexão do MCP `chrome-devtools` com o Chrome Stable (v157) do usuário em `https://pokeidle.io/app`.
2. Rodar `/study-game` para mapear novas mecânicas e confirmar pendências do DOM em `docs/GAME_STUDY.md` (ex.: regex de captura real, time inteiro vs Pokémon em campo, comportamento de poções no ULTRA).
3. Definir com o usuário as próximas features/melhorias com base no estudo do jogo.

## Pendente do usuário (ação única de setup)
- Ativar depuração remota no Chrome em `chrome://inspect/#remote-debugging`, deixar `https://pokeidle.io/app` aberto e logado com a extensão carregada, reiniciar a sessão (`agy` / `/clear`) para carregar o plugin `chrome-browser` e aceitar o aviso "Allow" no Chrome na primeira conexão do MCP.

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP).
