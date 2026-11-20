# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-20. Versão da extensão: `0.7.6`. Último commit de código: `fa7365c`. Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 37 passando (`types.js` + `hunt.js` + `rmt.js` + `ball.js`). Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Respeitar Termos §5 do PokeIdle (só cliques no DOM, sem API direta, sem mexer em login/anti-robô).

## Estado atual (2026-11-20)
- Extensão MV3 (`0.7.6`) com 4 modos (Captura, Repor bolas/poções, Captura eterna, **Gerenciador de hunt v3** automático + botão manual `Verificar`) + **Analisador de Pokébola** (`ball.js`) + **Radar RMT** (`rmt.js`).
- **Verificação manual + cadeia `Hunt → RMT → Pokébola` + auto-reposição `10/100` (`fa7365c`, `v0.7.6`):** botão `#pkbot-hunt-scan` (`Verificar`) no Modo 4; toda verificação (automática ou manual) sai do ULTRA uma única vez e encadeia `Hunt → RMT → Pokébola`; `PK_BALL.buildBallRestockConfig` sobrescreve `ballMin = 10` e `ballBuy = 100` em toda execução do analisador. Validado em Node (37/37) e ao vivo no Chrome (ciclo automático e manual sobrescrevendo `1/1` e `77/333` → `Ultra Ball 10/100`).
- **Radar RMT 100% itens fungíveis (`f56c5c8`, `v0.7.5`):** removidas rotas/varreduras de Pokémon; scan em ~8–10 s (8 itens líquidos); em `SAVE_ONLY`, **META ÓTIMA** aparece antes da **1ª ENTRADA**.
- **FPS seletivo + Modo servidor (`7633b2b`, `v0.7.4`):** `fps.js` limita apenas `Campo.loop` (UI em 60 FPS nativos), pausa minimizado, opção `0.2` + **Modo servidor (sem animações)** + Worker 100 ms e `background.js` 30 s.
- **Deploy multi-conta Proxmox CT 104 (`deploy/`):** 1 container (`linuxserver/chromium` + `tint2` + `svc-pulseaudio`), 4 perfis em tela cheia com auto-minimize (~33,6% CPU de 1 core, `gpu-process = 0%`, 1,86 GiB RAM).

## Próximos passos (ordem)
1. Validar no CT 104 (`https://192.168.0.104:3001`) a fluidez da UI em 60 FPS com mapa em `0.2`, captura contínua nas 4 contas minimizadas e temperatura em regime contínuo (opcional: subir RAM do CT 104 de 3 GB → 4 GB).
2. Validar troca real de hunt e cadeia `Hunt → RMT → Pokébola` partindo dos modos **Economia** e **ULTRA Economia**.
3. Validar o **Analisador de Pokébola** ao vivo em hunt com forma Shiny / Shiny Lure e em hunt mista (>1 espécie).
4. Validar pendências de gameplay via `/study-game` (`captureRe` com captura real, compra real no `ultraSupplyTick`, seletores do Radar RMT em idioma EN).

## Pendente do usuário
- Recarregar a extensão em `chrome://extensions` (e F5 em `pokeidle.io/app`) nos perfis secundários do Chrome (perfil padrão já recarregado na `v0.7.6`) e atualizar o container no CT 104 se quiser a `v0.7.6` lá.
- No CT 104 (`https://192.168.0.104:3001`), conferir se as 4 contas estão em `FPS = 0.2` (ou `ULTRA Economia` nas que não capturam), minimizar na barra inferior e dar **Shutdown** no CT 104 pelo Proxmox quando for jogar no PC local.

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP).
