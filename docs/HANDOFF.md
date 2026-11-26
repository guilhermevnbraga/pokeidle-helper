# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-25. Versão da extensão: `0.9.1`. Último commit de código: `e8889b0`. Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 96 passando (`types` + `hunt` + `rmt` + `timing` + `stones` + `sell` + `ball`). Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Respeitar Termos §5 do PokeIdle (só cliques no DOM, sem API direta, sem mexer em login/anti-robô).

## Estado atual (2026-11-25)
- **Analisador de Venda de Pokémon v0.9.1 (`sell.js` + `content.js`, `e8889b0`):** preço **máx. viável** (padrão), Rápido e Mercado com espera estimada. Ajusta comparáveis por Nota/Nível/Potência (ridge conservador, pesos ≥ 0), pesa vendas recentes, usa fila de anúncios melhores à frente + liquidez (vendas/dia) e exige que ≥15% das vendas comparáveis tenham chegado ao preço (`MIN_PROVEN_SHARE`); horizonte 14d; timing 7d vs 30d; lista "Ver N comparáveis". Corrigidos: espécie "Shiny X" nunca casava; histórico lido antes de filtrar (lista antiga ~2s, página até 2s) → agora espera a espécie aparecer. Validado ao vivo com Shiny Shedinja e Charizard (antes da regra dos 15%); **a regra dos 15% e a potência NÃO foram vistas ao vivo**. DOM: mercado sem paginação, histórico 30 linhas/pág com `.cm-hist-data` (dd/mm/aaaa).
- **Timing do Radar RMT (`timing.js` + `content.js`, `edba6ab`, `v0.9.0`):** responde "agir agora ou esperar?". Compara preço atual com média 7d do jogo + histórico próprio (`pkbot-rmt-hist`, 1 snapshot/scan, 30d). Banner ▲ agir / ● normal / ⏳ esperar em Ouro→Gema e Gema→Ouro, julgando **só a rota recomendada** (`plan.primary.routeId` via `focusId`; o usuário quer saber se o item do `MELHOR JUNTAR` está bom, não qual item está mais barato vs o normal; "Topo absoluto" renomeado para "Taxa bruta maior (outra opção)"); Trading (cross por spread, flips por preço de compra) é reordenado e vira `WAIT` se tudo estiver abaixo do normal. Histórico confiável só com ≥8 leituras e ≥12h; "melhor janela do dia" com ≥24h. Validado só em Node; **NÃO validado ao vivo**.
- Extensão MV3 (`0.9.0`) com 4 modos (Captura, Repor bolas/poções, Captura eterna, **Gerenciador de hunt v3** automático + `Verificar`) + **Analisador de Pokébola** (`ball.js`) + **Radar RMT (Ouro↔Gema + Trading)** (`rmt.js`) + **Venda de Pedras** (`stones.js`) + **Analisador de Venda de Inventário** (`sell.js`).
- **Radar RMT bidirecional + Trading (`rmt.js` + `content.js`, `v0.8.2`):** calcula **Ouro → Gema**, **Gema → Ouro** e **Trading** (arbitragem cruzada `Ouro→Gema→Ouro`/`Gema→Ouro→Gema` e flip/snipe na mesma moeda) na mesma varredura; lê média e volume 7d (`.cmp-media`) dos 8 itens para separar trading lucrativo real (`PROFITABLE`) de book inflado/raso (`RISKY`, ex.: Frag. MEGA Stone +52% acima da média 7d → `-30,6%` na média 7d) e `NO_TRADE`. Seletor `Tudo | Ouro→Gema | Gema→Ouro | Trading`. Validado em Node (67/67) e ao vivo no Chrome (scan real 8/8 itens com `.cmp-media`).
- **Analisador de Venda de Inventário — Gold vs Gema (`sell.js` + `content.js`, `71212f7`, `v0.8.0`):** seção `Analisador Venda (Gold×Gema)` (`Carregar` + seletor de itens RMT e Pokémons Depot/Equipe + qtd simulada + `Analisar`). Validado em Node e ao vivo no Chrome (Bronze Boss Token ×14 → Gold +35%; Charizard Nv 548 → Gemas +47%); **NÃO validado ao vivo** com Pokémon Shiny/P5 ou grade `#cm-pks` populada do Depot.
- **Gerenciador de hunt v3 calibrado + desempate secundário (`hunt.js` + `content.js`, `e7c3677`, `v0.7.8`):** física calibrada (`1.0`/`2.9s`), XP puro + `TIE_BAND = 3%` com desempate secundário. Validado em Node; **NÃO validado ao vivo no Chrome**.
- **Venda de Pedras (`8656492`, `v0.7.7`), Cadeia `Hunt → RMT → Pokébola` (`fa7365c`, `v0.7.6`), Radar RMT fungíveis (`f56c5c8`, `v0.7.5`) e FPS `0.2`/Modo servidor (`7633b2b`, `v0.7.4`):** validados em Node e ao vivo.
- **Deploy multi-conta Proxmox CT 104 (`deploy/`):** 1 container (`linuxserver/chromium` + `tint2` + `svc-pulseaudio`), 4 perfis em tela cheia com auto-minimize (~33,6% CPU de 1 core, `gpu-process = 0%`, 1,86 GiB RAM).

## Próximos passos (ordem)
00. **UI nova do painel (v0.10.0, `content.js` `buildPanel`):** tema `#pkbot-style` (classes `pkb-*`), status + pausa/retoma, abas e pílula; ids/`__pkBot` preservados. **Não validada ao vivo**: recarregar a extensão em `chrome://extensions` + aba do jogo e conferir abas, arraste, ULTRA e saídas. Etapas seguintes: refinar saídas (tabelas/cards) de RMT/Pedras/Venda.
0. **Meus anúncios no Analisador (2026-11-26, `readMyListings` em `content.js`):** `Carregar` agora soma itens/Pokémons de `#cm-meus` ao inventário. Parser escrito **às cegas** (aba MCP caiu no onboarding de conta nova, DOM real não inspecionado). Validar ao vivo: log `venda: Meus anúncios cards=N`, `closeRmtLeaf` após ler, seletor mostra `(N anunciados)`.
1. Rodar o Analisador (`v0.9.1`) em outro Pokémon e conferir ao vivo a regra dos 15% (preço Máx. viável deve ficar perto da mediana, não da cauda); calibrar prazo com a venda real do Shiny Shedinja anunciado.
2. Validar `v0.9.0` ao vivo: banner de timing do Radar RMT (Ouro→Gema, Gema→Ouro, Trading) e log `Timing O→G`.
3. Validar Analisador com P5/Mega e grade `#cm-pks` do Depot; considerar ler Z-Move/TM AoE no ajuste (dispersão grande no Charizard).
4. Validar `v0.7.8` do Gerenciador de hunt ao vivo e o CT 104 (`https://192.168.0.104:3001`).

## Pendente do usuário
- Recarregar a extensão (`v0.9.0`) em `chrome://extensions` (e `F5` em `pokeidle.io/app`) nos perfis secundários do Chrome e atualizar o container no CT 104 se quiser a `v0.9.0` lá.
- No CT 104 (`https://192.168.0.104:3001`), conferir `FPS = 0.2` (ou `ULTRA Economia`), minimizar na barra inferior e dar **Shutdown** no CT 104 pelo Proxmox quando for jogar no PC local.

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP).
