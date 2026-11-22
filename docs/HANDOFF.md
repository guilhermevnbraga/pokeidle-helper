# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-22. Versão da extensão: `0.8.1`. Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 62 passando (`types.js` + `hunt.js` + `rmt.js` + `stones.js` + `sell.js` + `ball.js`). Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Respeitar Termos §5 do PokeIdle (só cliques no DOM, sem API direta, sem mexer em login/anti-robô).

## Estado atual (2026-11-22)
- Extensão MV3 (`0.8.1`) com 4 modos (Captura, Repor bolas/poções, Captura eterna, **Gerenciador de hunt v3** automático + `Verificar`) + **Analisador de Pokébola** (`ball.js`) + **Radar RMT bidirecional** (`rmt.js`) + **Venda de Pedras** (`stones.js`) + **Analisador de Venda de Inventário** (`sell.js`).
- **Radar RMT bidirecional Ouro↔Gema (`rmt.js` + `content.js`, `v0.8.1`):** além de **Ouro → Gema** (menor Coins/Gema), agora calcula e exibe **Gema → Ouro** (maior Coins líq./Gema, compra no book de Gemas com teto +4%, vende 1 Coin abaixo do menor livre com 15% `Math.ceil`, saldo via `#tr-gemas`, seletor `Ambos | Ouro→Gema | Gema→Ouro` + retrocompatibilidade com cache antigo). Validado em Node (62/62) e ao vivo no Chrome (scan real 8/8 itens, 204G → Frag. MEGA Stone 115G→688,5M líq., 6,0M/G).
- **Analisador de Venda de Inventário — Gold vs Gema (`sell.js` + `content.js`, `71212f7`, `v0.8.0`):** seção `Analisador Venda (Gold×Gema)` (`Carregar` + seletor de itens RMT e Pokémons Depot/Equipe + qtd simulada + `Analisar`). Validado em Node e ao vivo no Chrome (Bronze Boss Token ×14 → Gold +35%; Charizard Nv 548 → Gemas +47%); **NÃO validado ao vivo** com Pokémon Shiny/P5 ou grade `#cm-pks` populada do Depot.
- **Gerenciador de hunt v3 calibrado + desempate secundário (`hunt.js` + `content.js`, `e7c3677`, `v0.7.8`):** física calibrada (`1.0`/`2.9s`), XP puro + `TIE_BAND = 3%` com desempate secundário. Validado em Node; **NÃO validado ao vivo no Chrome**.
- **Venda de Pedras (`8656492`, `v0.7.7`), Cadeia `Hunt → RMT → Pokébola` (`fa7365c`, `v0.7.6`), Radar RMT fungíveis (`f56c5c8`, `v0.7.5`) e FPS `0.2`/Modo servidor (`7633b2b`, `v0.7.4`):** validados em Node e ao vivo.
- **Deploy multi-conta Proxmox CT 104 (`deploy/`):** 1 container (`linuxserver/chromium` + `tint2` + `svc-pulseaudio`), 4 perfis em tela cheia com auto-minimize (~33,6% CPU de 1 core, `gpu-process = 0%`, 1,86 GiB RAM).

## Próximos passos (ordem)
1. Validar o **Analisador de Venda (`v0.8.0`)** ao vivo com Pokémon **Shiny/P5** e com grade `#cm-pks` populada do Depot/Coleção.
2. Validar `v0.7.8` ao vivo no Chrome via `Verificar` (presets **XP** e **Equilibrado**, tag `· desempate`), troca real de hunt e cadeia `Hunt → RMT → Pokébola` partindo de **Economia** e **ULTRA Economia**.
3. Validar no CT 104 (`https://192.168.0.104:3001`) a fluidez da UI em 60 FPS com mapa em `0.2`, captura contínua nas 4 contas minimizadas e temperatura em regime contínuo.
4. Validar **Analisador de Pokébola** em hunt mista/Shiny+Lure e pendências via `/study-game` (`captureRe` com captura real, compra real no `ultraSupplyTick`, seletores EN).

## Pendente do usuário
- Recarregar a extensão (`v0.8.1`) em `chrome://extensions` (e `F5` em `pokeidle.io/app`) nos perfis secundários do Chrome e atualizar o container no CT 104 se quiser a `v0.8.1` lá.
- No CT 104 (`https://192.168.0.104:3001`), conferir `FPS = 0.2` (ou `ULTRA Economia`), minimizar na barra inferior e dar **Shutdown** no CT 104 pelo Proxmox quando for jogar no PC local.

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP).
