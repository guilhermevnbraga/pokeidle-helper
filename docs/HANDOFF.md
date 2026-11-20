# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-19. Versão da extensão: `0.7.6`. Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 37 passando (`types.js` + `hunt.js` + `rmt.js` + `ball.js`). Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Respeitar Termos §5 do PokeIdle (só cliques no DOM, sem API direta, sem mexer em login/anti-robô).

## Estado atual (2026-11-19)
- Extensão MV3 (`0.7.6`) com 4 modos (Captura, Repor bolas/poções, Captura eterna, **Gerenciador de hunt v3** automático + botão manual `Verificar` encadeando `Hunt → RMT → Analisador de Pokébola`) + **Analisador de Pokébola** (`ball.js`, auto-aplica bola recomendada com mín. `10` e repor `100`) + **Radar RMT (Ouro → Gema)** (`rmt.js`).
- **Verificação manual de hunt + cadeia `Hunt → RMT → Pokébola` + auto-reposição `10/100` (`v0.7.6`):** botão `#pkbot-hunt-scan` (`Verificar`) na linha do Modo 4; toda verificação (automática ou manual) sai do ULTRA uma única vez e encadeia `Hunt → RMT → Pokébola`; `PK_BALL.buildBallRestockConfig` força `ballMin = 10` e `ballBuy = 100` em toda execução do analisador. Validado em Node (37/37) e ao vivo no Chrome (ciclo automático + manual sobrescrevendo `1/1` e `77/333` → `Ultra Ball 10/100`).
- **Radar RMT 100% itens fungíveis (`f56c5c8`, `v0.7.5`):** removidas todas as rotas e varreduras de Pokémon (`Sacrifício`, `P5`, `Mega`, `Shiny`), que geravam falsos positivos perigosos por dependerem de espécie/IV/meta/liquidez. `rankRoutes` descarta rotas legadas de Pokémon salvas em `localStorage`, o scan caiu para **9,8 s** (8 itens líquidos), e em `SAVE_ONLY` a **META ÓTIMA** agora aparece no topo antes da **1ª ENTRADA**. Validado em Node (36/36) e ao vivo no Chrome (perfil padrão).
- **FPS seletivo + Modo servidor (`7633b2b`, `v0.7.4`):** `fps.js` limita apenas `Campo.loop` (e `seguirEnfermeira` a 2 fps), mantendo a UI do jogo em **60 FPS nativos**, pausando o canvas minimizado e com opção `0.2 (mapa quase parado · captura ON)` + checkbox **Modo servidor (sem animações)**.
- **Deploy multi-conta no Proxmox CT 104 (`deploy/`):** 1 container (`linuxserver/chromium` + `tint2`, `svc-pulseaudio` ativo p/ Selkies), 4 perfis em tela cheia com auto-minimize (~33,6% CPU de 1 core, `gpu-process = 0%`, 1,86 GiB RAM).
- **Hardening Market/multi-conta (`3bdcc4b`)** e segundo plano estável (`fps.js` Worker 100 ms só em aba oculta + `content.js` Worker + `background.js` 30 s + `autoDiscardable: false`).

## Próximos passos (ordem)
1. Validar no CT 104 (`https://192.168.0.104:3001`) a fluidez da UI em 60 FPS com mapa em `0.2`, captura contínua nas 4 contas minimizadas e temperatura em regime contínuo (opcional: subir RAM do CT 104 de 3 GB → 4 GB).
2. Validar troca automática do Gerenciador de hunt v3 no modo **Economia** e **ULTRA Economia**.
3. Validar o **Analisador de Pokébola** ao vivo em hunt com forma Shiny / Shiny Lure e em hunt mista (>1 espécie).
4. Validar pendências de gameplay via `/study-game` (`captureRe` com captura real, compra real no `ultraSupplyTick`, seletores do Radar RMT em idioma EN).

## Pendente do usuário
- Recarregar a extensão em `chrome://extensions` (e F5 em `pokeidle.io/app`) nos perfis secundários do Chrome (perfil padrão já recarregado na `v0.7.6`) e atualizar o container no CT 104 se quiser a `v0.7.6` lá.
- No CT 104 (`https://192.168.0.104:3001`), conferir se as 4 contas estão em `FPS = 0.2` (ou `ULTRA Economia` nas que não capturam), minimizar na barra inferior e dar **Shutdown** no CT 104 pelo Proxmox quando for jogar no PC local.

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP).
