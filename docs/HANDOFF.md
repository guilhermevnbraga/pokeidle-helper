# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-19. Versão da extensão: `0.7.1`. Último commit de código: `5264fc5`. Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 38 passando (`types.js` + `hunt.js` + `rmt.js` + `ball.js`). Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Respeitar Termos §5 do PokeIdle (só cliques no DOM, sem API direta, sem mexer em login/anti-robô).

## Estado atual (2026-11-19)
- Extensão MV3 (`0.7.1`) com 4 modos (Captura, Repor bolas/poções, Captura eterna, **Gerenciador de hunt v3 100% automático**) + **Analisador Otimizado de Pokébola** (`ball.js` + `#pkbot-ball-box`) + **Radar RMT (Ouro → Gema)** (`rmt.js` + `#pkbot-rmt-box`).
- **Gerenciador de hunt v3 (`hunt.js` + `content.js`):** 100% automático (seletor `Equilibrado | XP | Lucro/Out | Shiny` na própria linha do checkbox 4, sem botão manual `Analisar`/`Ir`, com resumo discreto abaixo). Simula combate e economia reais da Wiki (stats/golpes do ativo, HP ×5 e dano ×1,8 do selvagem, Investida no 1º tipo, poções/bolas, retorno NPC, pedras, drops raros da Outland e Shiny), cache Pokedex (`pkbot-dex-cache`), `sleep` via Web Worker, maior tier de Outland e auto-reavaliação passiva ao trocar/evoluir ativo, cruzar patamar de nível/tier ou acordar no Centro Pokémon (além de retry de 15 s no boot e ciclo de 10 min). Validado ao vivo: Charizard Nv 422 (`Furious Scizor [OUT]` 1º em Equilibrado/Lucro, `Sunkern Nv200` 1º em XP) e troca automática real completa em Squirtle Nv 28 (`Charmander Nv20` → Centro → cura → `Diglett Nv10`).
- **Analisador Otimizado de Pokébola (`ball.js` + `content.js`, `ff3e145`):** lê Mapa/Hunt Analyser + ficha da Pokedex + pisos RMT + boosts do HUD; recomenda a melhor bola nos focos `Equilibrado`, `Dinheiro` e `Raro/Shiny` com botão 1-clique `Usar`. Validado ao vivo em `Furious Scizor Nv 150`.
- **Hardening Market/multi-conta (`3bdcc4b`)** e segundo plano estável (`fps.js` + `content.js` Worker + `background.js` 30 s + `autoDiscardable: false` + `deploy/`).

## Próximos passos (ordem)
1. Validar troca automática do Gerenciador de hunt v3 no modo **Economia** e **ULTRA Economia**.
2. Validar o **Analisador de Pokébola** ao vivo após um scan completo do Radar RMT (com pisos de Pokémon preenchidos), em hunt com forma Shiny / Shiny Lure e em hunt mista (>1 espécie).
3. Validar pendências de gameplay em `docs/PROGRESS.md` via `/study-game` (`captureRe` com captura real, compra real no `ultraSupplyTick`).
4. Opcional no Radar RMT: atalho de navegação para o item/filtro recomendado e confirmar arredondamento (`ceil` vs `round`) da comissão de Pokémon em Gemas.

## Pendente do usuário
- Recarregar a extensão em `chrome://extensions` (e recarregar as abas `pokeidle.io/app`) nos perfis do Chrome ainda na `v0.6.0`/`v0.7.0` para receber a `v0.7.1`.
- Rodar `Escanear` no Radar RMT uma vez para alimentar o Analisador de Pokébola com os pisos reais de Pokémon (N ≥ 3,5, P5 e Shiny).

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP).
