# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-24. Versão da extensão: `0.9.0`. Último commit de código: `edba6ab`. Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 82 passando (`types` + `hunt` + `rmt` + `timing` + `stones` + `sell` + `ball`). Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Respeitar Termos §5 do PokeIdle (só cliques no DOM, sem API direta, sem mexer em login/anti-robô).

## Estado atual (2026-11-22)
- **Timing do Radar RMT (`timing.js` + `content.js`, `edba6ab`, `v0.9.0`):** responde "agir agora ou esperar?". Compara preço atual com média 7d do jogo + histórico próprio (`pkbot-rmt-hist`, 1 snapshot/scan, 30d). Banner ▲ agir / ● normal / ⏳ esperar em Ouro→Gema e Gema→Ouro, julgando **só a rota recomendada** (`plan.primary.routeId` via `focusId`; o usuário quer saber se o item do `MELHOR JUNTAR` está bom, não qual item está mais barato vs o normal; "Topo absoluto" renomeado para "Taxa bruta maior (outra opção)"); Trading (cross por spread, flips por preço de compra) é reordenado e vira `WAIT` se tudo estiver abaixo do normal. Histórico confiável só com ≥8 leituras e ≥12h; "melhor janela do dia" com ≥24h. Validado só em Node; **NÃO validado ao vivo**.
- Extensão MV3 (`0.9.0`) com 4 modos (Captura, Repor bolas/poções, Captura eterna, **Gerenciador de hunt v3** automático + `Verificar`) + **Analisador de Pokébola** (`ball.js`) + **Radar RMT (Ouro↔Gema + Trading)** (`rmt.js`) + **Venda de Pedras** (`stones.js`) + **Analisador de Venda de Inventário** (`sell.js`).
- **Radar RMT bidirecional + Trading (`rmt.js` + `content.js`, `v0.8.2`):** calcula **Ouro → Gema**, **Gema → Ouro** e **Trading** (arbitragem cruzada `Ouro→Gema→Ouro`/`Gema→Ouro→Gema` e flip/snipe na mesma moeda) na mesma varredura; lê média e volume 7d (`.cmp-media`) dos 8 itens para separar trading lucrativo real (`PROFITABLE`) de book inflado/raso (`RISKY`, ex.: Frag. MEGA Stone +52% acima da média 7d → `-30,6%` na média 7d) e `NO_TRADE`. Seletor `Tudo | Ouro→Gema | Gema→Ouro | Trading`. Validado em Node (67/67) e ao vivo no Chrome (scan real 8/8 itens com `.cmp-media`).
- **Analisador de Venda de Inventário — Gold vs Gema (`sell.js` + `content.js`, `71212f7`, `v0.8.0`):** seção `Analisador Venda (Gold×Gema)` (`Carregar` + seletor de itens RMT e Pokémons Depot/Equipe + qtd simulada + `Analisar`). Validado em Node e ao vivo no Chrome (Bronze Boss Token ×14 → Gold +35%; Charizard Nv 548 → Gemas +47%); **NÃO validado ao vivo** com Pokémon Shiny/P5 ou grade `#cm-pks` populada do Depot.
- **Gerenciador de hunt v3 calibrado + desempate secundário (`hunt.js` + `content.js`, `e7c3677`, `v0.7.8`):** física calibrada (`1.0`/`2.9s`), XP puro + `TIE_BAND = 3%` com desempate secundário. Validado em Node; **NÃO validado ao vivo no Chrome**.
- **Venda de Pedras (`8656492`, `v0.7.7`), Cadeia `Hunt → RMT → Pokébola` (`fa7365c`, `v0.7.6`), Radar RMT fungíveis (`f56c5c8`, `v0.7.5`) e FPS `0.2`/Modo servidor (`7633b2b`, `v0.7.4`):** validados em Node e ao vivo.
- **Deploy multi-conta Proxmox CT 104 (`deploy/`):** 1 container (`linuxserver/chromium` + `tint2` + `svc-pulseaudio`), 4 perfis em tela cheia com auto-minimize (~33,6% CPU de 1 core, `gpu-process = 0%`, 1,86 GiB RAM).

## Próximos passos (ordem)
1. Recarregar a extensão `v0.9.0`, escanear o RMT algumas vezes ao longo do dia e validar ao vivo o banner de timing (Ouro→Gema, Gema→Ouro e Trading) e o log `[pkbot] ... Timing O→G`.
2. Validar o **Analisador de Venda (`v0.8.0`)** ao vivo com Pokémon **Shiny/P5** e com grade `#cm-pks` populada do Depot/Coleção.
3. Validar `v0.7.8` ao vivo no Chrome via `Verificar` (presets **XP** e **Equilibrado**, tag `· desempate`), troca real de hunt e cadeia `Hunt → RMT → Pokébola` partindo de **Economia** e **ULTRA Economia**.
4. Validar no CT 104 (`https://192.168.0.104:3001`) a fluidez da UI em 60 FPS com mapa em `0.2`, captura contínua nas 4 contas minimizadas e temperatura em regime contínuo.

## Pendente do usuário
- Recarregar a extensão (`v0.9.0`) em `chrome://extensions` (e `F5` em `pokeidle.io/app`) nos perfis secundários do Chrome e atualizar o container no CT 104 se quiser a `v0.9.0` lá.
- No CT 104 (`https://192.168.0.104:3001`), conferir `FPS = 0.2` (ou `ULTRA Economia`), minimizar na barra inferior e dar **Shutdown** no CT 104 pelo Proxmox quando for jogar no PC local.

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP).
