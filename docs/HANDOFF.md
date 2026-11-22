# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-22. Versão da extensão: `0.7.8`. Último commit de código: `e7c3677`. Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 47 passando (`types.js` + `hunt.js` + `rmt.js` + `stones.js` + `ball.js`). Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Respeitar Termos §5 do PokeIdle (só cliques no DOM, sem API direta, sem mexer em login/anti-robô).

## Estado atual (2026-11-22)
- Extensão MV3 (`0.7.8`) com 4 modos (Captura, Repor bolas/poções, Captura eterna, **Gerenciador de hunt v3** automático + botão `Verificar`) + **Analisador de Pokébola** (`ball.js`) + **Radar RMT** (`rmt.js`) + **Venda de Pedras** (`stones.js`).
- **Gerenciador de hunt v3 calibrado + desempate secundário (`hunt.js` + `content.js`, `e7c3677`, `v0.7.8`):** corrigido erro do simulador com dados reais do Charizard Nv 541 (`MOB_STAT_FACTOR = 1.0`, `WALK_SEC = 2.9`, `kph`/dano por `lastKillAt` sem viés de truncamento, cobertura neutra 25% em mobs resistidos); preset `xp` agora é 100% XP/h sustentável; `rankScoredPool` aplica banda de empate `TIE_BAND = 3%` no objetivo primário e desempata por critério secundário (lucro/shiny/outland/pedras/KPH); `maxCandidates = 24`, `huntGain = 1.06`, tier Outland também no Estágio 2 e tag `· desempate` no painel/log. Validado em Node (47/47); **NÃO validado ao vivo no Chrome**.
- **Venda de Pedras em Coins (`8656492`, `v0.7.7`):** `Simular`/`Vender` pedras em Coins no máx. comprovado, confirmação `.caixa-confirmar #confirmar-sim` e painel com rolagem travada na viewport; validado em Node + venda real (3/3 pedras, 4,26M líq.).
- **Cadeia `Hunt → RMT → Pokébola` (`fa7365c`, `v0.7.6`) + Radar RMT 100% fungíveis (`f56c5c8`, `v0.7.5`) + FPS seletivo `0.2` / Modo servidor (`7633b2b`, `v0.7.4`):** validados em Node e ao vivo.
- **Deploy multi-conta Proxmox CT 104 (`deploy/`):** 1 container (`linuxserver/chromium` + `tint2` + `svc-pulseaudio`), 4 perfis em tela cheia com auto-minimize (~33,6% CPU de 1 core, `gpu-process = 0%`, 1,86 GiB RAM).

## Próximos passos (ordem)
1. Validar `v0.7.8` ao vivo no Chrome via `Verificar` (presets **XP** e **Equilibrado**, conferindo Scizor Nv 470 vs Furious Scizor/Sunkern e tag `· desempate`), troca real de hunt e cadeia `Hunt → RMT → Pokébola` partindo de **Economia** e **ULTRA Economia**.
2. Validar no CT 104 (`https://192.168.0.104:3001`) a fluidez da UI em 60 FPS com mapa em `0.2`, captura contínua nas 4 contas minimizadas e temperatura em regime contínuo.
3. Validar o **Analisador de Pokébola** ao vivo em hunt com forma Shiny / Shiny Lure e em hunt mista (>1 espécie).
4. Validar pendências de gameplay via `/study-game` (`captureRe` com captura real, compra real no `ultraSupplyTick`, seletores do Radar RMT em idioma EN).

## Pendente do usuário
- Recarregar a extensão (`v0.7.8`, `e7c3677`) em `chrome://extensions` (e `F5` em `pokeidle.io/app`) nos perfis do Chrome e atualizar o container no CT 104 se quiser a `v0.7.8` lá.
- No CT 104 (`https://192.168.0.104:3001`), conferir `FPS = 0.2` (ou `ULTRA Economia`), minimizar na barra inferior e dar **Shutdown** no CT 104 pelo Proxmox quando for jogar no PC local.

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP).
