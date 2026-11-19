# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-19. Versão da extensão: `0.6.0`. Último commit de código: `ee8ac80`. Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 32 passando (`types.js` + `hunt.js` + `rmt.js` + `ball.js`). Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Respeitar Termos §5 do PokeIdle (só cliques no DOM, sem API direta, sem mexer em login/anti-robô).

## Estado atual (2026-11-19)
- Extensão MV3 (`0.6.0`) com 4 modos (Captura, Repor bolas/poções, Captura eterna, Gerenciador de hunt v2) + **Analisador Otimizado de Pokébola** (`ball.js` + `#pkbot-ball-box`) + **Radar RMT (Ouro → Gema)** (`rmt.js` + `#pkbot-rmt-box`).
- **Analisador Otimizado de Pokébola (`ball.js` + `content.js`):** lê Mapa/Hunt Analyser + ficha da Pokedex (preço NPC, nível de captura, stats-base, chance de Shiny e tabela oficial de taxas/preços das bolas) + pisos RMT (N≥3,5, P5, Shiny) + boosts ativos no HUD, calcula EV/captura e lucro/h e recomenda a melhor Pokébola em 3 focos (`Equilibrado`, `Dinheiro`, `Raro/Shiny`) com botão 1-clique `Usar`.
- **Gerenciador de hunt v2 (`hunt.js` + `content.js`, `ee8ac80`):** identifica a hunt atual pelo marcador `.on` + `#palco.hunt-ativa` (nunca troca para o mapa atual), protege Safari/Boss/Casa, aguarda a trava de 3 s em combate via `#ir-centro`/`#eco-ir-centro` (sem "Desistir do Combate"), volta ao Centro Pokémon, cura a equipe (`#centro-curar`/`#eco-curar`) e só então entra na nova hunt.
- **Hardening Market/multi-conta (`3bdcc4b`):** garante aba Comprar, re-consulta card fresco, trata compra parcial, fila de reposição e aviso de bola 0.
- Segundo plano estável (`fps.js` Worker + `content.js` Worker + `background.js` alarme 30 s + `autoDiscardable: false`), limite de FPS (padrão 10) e deploy Docker + Selkies pronto em `deploy/`.

## Próximos passos (ordem)
1. Validar ao vivo uma troca real do Gerenciador de hunt v2 (modo Normal e modo Economia) e compra real pós-hardening do Market nos perfis secundários.
2. Validar pendências de gameplay em `docs/PROGRESS.md` via `/study-game` (regex `captureRe` com captura real, Pokémon em campo vs time inteiro no Hunt Analyser, compra real no `ultraSupplyTick`).
3. Opcional no Radar RMT: atalho de navegação para o item/filtro recomendado e confirmar arredondamento (`ceil` vs `round`) da comissão de Pokémon em Gemas quando houver Pokémon N 3,5+ no Depot.
4. Definir com o usuário as próximas features/melhorias.

## Pendente do usuário
- Recarregar a extensão em `chrome://extensions` (e recarregar as abas `pokeidle.io/app`) nos **perfis secundários** do Chrome, pois `reload_extension` via MCP atualiza apenas o perfil padrão.

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP).
