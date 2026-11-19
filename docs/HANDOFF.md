# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-19. Versão da extensão: `0.6.0`. Último commit de código: `ff3e145`. Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 32 passando (`types.js` + `hunt.js` + `rmt.js` + `ball.js`). Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Respeitar Termos §5 do PokeIdle (só cliques no DOM, sem API direta, sem mexer em login/anti-robô).

## Estado atual (2026-11-19)
- Extensão MV3 (`0.6.0`) com 4 modos (Captura, Repor bolas/poções, Captura eterna, Gerenciador de hunt v2) + **Analisador Otimizado de Pokébola** (`ball.js` + `#pkbot-ball-box`) + **Radar RMT (Ouro → Gema)** (`rmt.js` + `#pkbot-rmt-box`).
- **Analisador Otimizado de Pokébola (`ball.js` + `content.js`, `ff3e145`):** lê Mapa/Hunt Analyser + ficha da Pokedex (NPC, nível de captura, stats-base, chance de Shiny e tabela oficial de bolas) + pisos RMT (N≥3,5, P5, Shiny) + boosts do HUD; recomenda a melhor bola nos focos `Equilibrado`, `Dinheiro` e `Raro/Shiny` com botão 1-clique `Usar`. Validado ao vivo em `Furious Scizor Nv 150`.
- **Gerenciador de hunt v2 (`hunt.js` + `content.js`, `ee8ac80`):** identifica hunt atual (`.on` + `#palco.hunt-ativa`), aguarda 3 s fora de combate via `#ir-centro`/`#eco-ir-centro`, cura no Centro Pokémon e entra na nova hunt.
- **Hardening Market/multi-conta (`3bdcc4b`)** e segundo plano estável (`fps.js` + `content.js` Worker + `background.js` 30 s + `autoDiscardable: false` + `deploy/`).

## Próximos passos (ordem)
1. Validar o **Analisador de Pokébola** ao vivo após um scan completo do Radar RMT (com pisos de Pokémon preenchidos), em hunt com forma Shiny / Shiny Lure e em hunt mista (>1 espécie).
2. Validar ao vivo uma troca real do Gerenciador de hunt v2 (modo Normal e Economia) e compra real pós-hardening do Market nos perfis secundários.
3. Validar pendências de gameplay em `docs/PROGRESS.md` via `/study-game` (`captureRe` com captura real, time inteiro vs ativo no Hunt Analyser, compra real no `ultraSupplyTick`).
4. Opcional no Radar RMT: atalho de navegação para o item/filtro recomendado e confirmar arredondamento (`ceil` vs `round`) da comissão de Pokémon em Gemas.

## Pendente do usuário
- Recarregar a extensão em `chrome://extensions` (e recarregar as abas `pokeidle.io/app`) nos **perfis secundários** do Chrome (o perfil padrão já está na `v0.6.0`).
- Rodar `Escanear` no Radar RMT uma vez para alimentar o Analisador de Pokébola com os pisos reais de Pokémon (N ≥ 3,5, P5 e Shiny).

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP).
