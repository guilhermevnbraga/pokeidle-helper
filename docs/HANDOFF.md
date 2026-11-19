# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-19. Versão da extensão: `0.7.0`. Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 37 passando (`types.js` + `hunt.js` + `rmt.js` + `ball.js`). Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Respeitar Termos §5 do PokeIdle (só cliques no DOM, sem API direta, sem mexer em login/anti-robô).

## Estado atual (2026-11-19)
- Extensão MV3 (`0.7.0`) com 4 modos (Captura, Repor bolas/poções, Captura eterna, **Gerenciador de hunt v3**) + **Analisador Otimizado de Pokébola** (`ball.js` + `#pkbot-ball-box`) + **Radar RMT (Ouro → Gema)** (`rmt.js` + `#pkbot-rmt-box`).
- **Gerenciador de hunt v3 (`hunt.js` + `content.js`):** substituiu a heurística baseada só no `xp/h` fictício do Hunt Analyser (que assumia ~983 abates/h fixos) por simulador real de combate/economia fiel à Wiki (stats/golpes do Pokémon ativo, HP ×5 e dano ×1,8 do selvagem, Investida no 1º tipo, cooldowns/Speed, custo real de poções/bolas, retorno NPC das capturas, pedras, drops raros da Outland e Shiny) com 4 focos (`Equilibrado`, `XP`, `Lucro/Outland`, `Shiny/Caça`), cache permanente da Pokedex (`pkbot-dex-cache`), `sleep` via Web Worker (rápido em 2º plano), seleção automática do maior tier de Outland e painel Top 4 com botão 1-clique `Ir`. Validado ao vivo em Charizard Nv 422 (`Furious Scizor Nv150 [OUT]` 1º em Equilibrado/Lucro, `Sunkern Nv200` 1º em XP, `Scyther Nv100` 1º em Shiny; `Hitmontop Nv380` descartado).
- **Analisador Otimizado de Pokébola (`ball.js` + `content.js`, `ff3e145`):** lê Mapa/Hunt Analyser + ficha da Pokedex + pisos RMT + boosts do HUD; recomenda a melhor bola nos focos `Equilibrado`, `Dinheiro` e `Raro/Shiny` com botão 1-clique `Usar`. Validado ao vivo em `Furious Scizor Nv 150`.
- **Hardening Market/multi-conta (`3bdcc4b`)** e segundo plano estável (`fps.js` + `content.js` Worker + `background.js` 30 s + `autoDiscardable: false` + `deploy/`).

## Próximos passos (ordem)
1. Validar ao vivo uma troca real do Gerenciador de hunt v3 (modo Normal e Economia) e nos perfis secundários (contas Nv 20).
2. Validar o **Analisador de Pokébola** ao vivo após um scan completo do Radar RMT (com pisos de Pokémon preenchidos), em hunt com forma Shiny / Shiny Lure e em hunt mista (>1 espécie).
3. Validar pendências de gameplay em `docs/PROGRESS.md` via `/study-game` (`captureRe` com captura real, compra real no `ultraSupplyTick`).
4. Opcional no Radar RMT: atalho de navegação para o item/filtro recomendado e confirmar arredondamento (`ceil` vs `round`) da comissão de Pokémon em Gemas.

## Pendente do usuário
- Recarregar a extensão em `chrome://extensions` (e recarregar as abas `pokeidle.io/app`) nos **perfis secundários** do Chrome (o perfil padrão já está na `v0.7.0`).
- Rodar `Escanear` no Radar RMT uma vez para alimentar o Analisador de Pokébola com os pisos reais de Pokémon (N ≥ 3,5, P5 e Shiny).

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP).
