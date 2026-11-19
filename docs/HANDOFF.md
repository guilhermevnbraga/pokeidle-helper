# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-18 (Radar RMT v0.4.0 + estudo do Mercado da Comunidade). Versão da extensão: `0.4.0`. Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 11 passando (`types.js` + `rmt.js`). Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Respeitar Termos §5 do PokeIdle (só cliques no DOM, sem API direta, sem mexer em login/anti-robô).

## Estado (2026-11-18)
- Extensão MV3 funcional (`0.4.0`): 4 modos (Captura, Repor bolas/poções, Captura eterna, Gerenciador de hunt via Hunt Analyser + `types.js`) + **Radar RMT (Ouro → Gema)** (`rmt.js` + painel `#pkbot-rmt-box`, leitura passiva e scan sob demanda de books livres).
- Suporte a segundo plano (Worker para timers do jogo em `fps.js`, Worker de loop em `content.js`, alarme de 30 s + `autoDiscardable: false` em `background.js`, keep-alive opcional).
- Limite de FPS configurável (`fps.js`, padrão 10 fps) e saída periódica do ULTRA Economia para atualizar estoques (`ultraSupplyTick`).
- Deploy 24/7 Docker + Selkies pronto em `deploy/` (Proxmox).
- MCP `chrome-devtools` (`--auto-connect`) e `reload_extension` validados ao vivo na aba `pokeidle.io/app`.

## Estudo do jogo (resumo — detalhes em `docs/GAME_STUDY.md`)
- Seletores e mecânicas do HUD, Market, Mapa, Hunt Analyser, captura, ULTRA e **Mercado da Comunidade (RMT)** (taxas, retenção 2 min, cooldown 30 min, CSV 5.000 tx, `.cmi-linha`, `.cmi-painel`, `.cm-preco.orb`) confirmados em `docs/GAME_STUDY.md`.

## Próximos passos (ordem)
1. Validar pendências de gameplay em `docs/PROGRESS.md` via `/study-game` (regex `captureRe` com captura real, time inteiro vs Pokémon em campo no Hunt Analyser, compra real no `ultraSupplyTick`).
2. Definir com o usuário as próximas features/melhorias.

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP).
