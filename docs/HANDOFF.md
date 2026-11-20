# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-19. Versão da extensão: `0.7.4`. Último commit de código: `7633b2b`. Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 40 passando (`types.js` + `hunt.js` + `rmt.js` + `ball.js`). Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Respeitar Termos §5 do PokeIdle (só cliques no DOM, sem API direta, sem mexer em login/anti-robô).

## Estado atual (2026-11-19)
- Extensão MV3 (`0.7.4`) com 4 modos (Captura, Repor bolas/poções, Captura eterna, **Gerenciador de hunt v3 100% automático** com rebalanceamento de segurança de Auto-Potion) + **Analisador Otimizado de Pokébola** (`ball.js` + `#pkbot-ball-box`) + **Radar RMT (Ouro → Gema)** (`rmt.js` + `#pkbot-rmt-box`).
- **FPS seletivo + Modo servidor (`7633b2b`, `v0.7.4`):** confirmado em `campo.mjs`/`app.js` que `Campo.loop` (`bound loop`) só desenha o `<canvas>` e tem zero efeito em combate/XP/captura (`#caidos-lista` vem via WS + `setInterval(250ms)`). `fps.js` agora limita apenas `Campo.loop` (e `seguirEnfermeira` a 2 fps), deixando toda a UI do jogo em **60 FPS nativos**, pausando o canvas quando minimizado e adicionando opção `0.2 (mapa quase parado · captura ON)` + checkbox **Modo servidor (sem animações)** em `content.js` (ativados por padrão no Docker via `deploy/server-flag.js`).
- **Deploy multi-conta no Proxmox CT 104 (`deploy/`):** 1 único container (`deploy/Dockerfile` sobre `linuxserver/chromium` com `tint2`, mantendo `svc-pulseaudio` para o WebSocket do Selkies), 1 instância do Chromium abrindo 4 perfis (`Default`, `Conta2`, `Conta3`, `Conta4`) em **tela cheia** com barra inferior `tint2` e auto-minimize após o boot (`deploy/autostart.sh`). Sem `cpus: "1.5"` (evita CFS throttling ao digitar) e sem `/dev/dri` (deixado off por acordar iGPU em repouso). Medido no CT 104 com as 4 contas logadas e minimizadas: **~33,6% CPU de 1 core** (`gpu-process = 0%`, `selkies = 0%`) e **1,86 GiB RAM**.
- **Hardening Market/multi-conta (`3bdcc4b`)** e segundo plano estável (`fps.js` Worker 100 ms só em aba oculta + `content.js` Worker + `background.js` 30 s + `autoDiscardable: false`).

## Próximos passos (ordem)
1. Validar no CT 104 (`https://192.168.0.104:3001`) a fluidez da UI em 60 FPS com mapa em `0.2`, captura contínua nas 4 contas minimizadas e temperatura em regime contínuo (opcional: subir RAM do CT 104 de 3 GB → 4 GB).
2. Validar troca automática do Gerenciador de hunt v3 no modo **Economia** e **ULTRA Economia**.
3. Validar o **Analisador de Pokébola** ao vivo em hunt com forma Shiny / Shiny Lure e em hunt mista (>1 espécie).
4. Validar pendências de gameplay via `/study-game` (`captureRe` com captura real, compra real no `ultraSupplyTick`, arredondamento da comissão de Pokémon em Gemas no Radar RMT).

## Pendente do usuário
- Recarregar a extensão em `chrome://extensions` (e recarregar abas `pokeidle.io/app`) nos perfis locais do Chrome para receber a `v0.7.4` (FPS seletivo + Modo servidor).
- No CT 104 (`https://192.168.0.104:3001`), conferir se todas as 4 contas estão em `FPS = 0.2` (ou `ULTRA Economia` nas que não capturam), minimizar na barra inferior e dar **Shutdown** no CT 104 pelo Proxmox quando for jogar no PC local.

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP).
