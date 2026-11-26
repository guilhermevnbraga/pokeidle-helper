# PROGRESS — PokeIdle Helper

Regra: UMA linha por item (≤ 190 chars). Compacte com `compact-progress.mjs` do `ai-kit`. Nunca marque `[x]` sem validação.

## Ambiente de desenvolvimento & IA
- [x] Arquitetura Antigravity econômica: `AGENTS.md`, hook `SessionStart`, Git `pre-commit`, `scripts/check.mjs`, `compact-progress.mjs`, skills `/handoff`, `/study-game`, `/feature` e docs.
- [x] Suite de testes unitários nativa (`node --test`) cobrindo `types.js`, `hunt.js`, `rmt.js`, `stones.js`, `sell.js` e `ball.js` (`tests/*.test.mjs`).
- [x] Conexão MCP `chrome-devtools` (`--auto-connect`) e reload de extensão validados ao vivo com `pokeidle.io/app` no Chrome Stable.

## Extensão MV3 (estado atual v0.7.2+)
- [x] Gerenciador de hunt v3: troca real validada ao vivo em PT 2026-11-26 (Azurill 31,8M xp/h -> espera combate -> Centro -> cura -> Shedinja 66,2M) · NÃO validado: troca saindo do ULTRA e em EN
- [x] Analisador de Pokébola: hunt atual (Shedinja) com Shiny/Raro/EV validado ao vivo 2026-11-26; nenhuma hunt do mapa (1049 marcadores) tem >1 espécie · NÃO validado: caminho multi-espécie (só no código)
- [x] Radar RMT v0.8.2 (`rmt.js`+`content.js`): Ouro↔Gema + Trading (arbitragem cruzada, flip, média/vol 7d `.cmp-media`, anti-armadilha); validado Node (67/67) e Chrome.
- [x] Venda de Pedras v0.7.7 (`stones.js`+`content.js`): `Simular`/`Vender` pedras em Coins no máx. comprovado, confirma `.caixa-confirmar`; validado Node+venda real (3/3 em 12,9 s).
- [ ] Analisador de Venda: soma "Meus anúncios" (`#cm-meus`, `readMyListings`) ao inventário · NÃO validado: DOM real de #cm-meus (parser às cegas), closeRmtLeaf após ler
- [ ] Analisador de Venda v0.9.1 (`sell.js`+`content.js`): preço máx. viável (Nota/Nível/Potência, fila, liquidez, ≥15% vendas); ao vivo: Shedinja+… · NÃO validado: regra 15%, P5, Mega, Depot
- [x] Timing do Radar RMT (timing.js+content.js, v0.9.0): veredito ● vs média 7d + mediana do histórico (9 leituras/36h) validado ao vivo em PT 2026-11-26 · NÃO validado: veredito ▲/⏳ e EN
- [x] Analisador de Venda: book de uma moeda muito abaixo da média 7d não vence mais a comparação (flag suspect); Darkness Stone ao vivo virou GOLD · NÃO validado: Pokémon e EN
- [x] UI do painel v0.10.0: tema pkb-*, status+pausa, abas, pílula, cards em todas as abas; validado ao vivo (PT e EN, ULTRA, arraste) · janela estreita real NÃO validada
- [x] Auto-reload de dev no background.js (extensão descompactada, ~40 s após editar); validado ao vivo
- [x] Filtros de busca do jogo (`#f-mapa`, `#f-nivel-min/max`, `#f-dex`) persistem: extensão limpa antes de ler e restaura o do usuário (v0.10.1) ·… · NÃO validado: troca real, nível min/max
- [x] readMyListings corrigido (toggle #cm-meus + card .cm-nome/.cm-qtd): lê 138× Darkness Stone + Shiny Shedinja ao vivo em PT · NÃO validado: EN após o fix
- [x] README.md descreve a UI nova (abas, status, pausa, pílula) e módulos sell/stones/timing
- [ ] Radar RMT: seletores de itens em idioma EN · NÃO validado: jogo testado só em PT
- [x] Painel flutuante arrastável, minimizável e ocultável (`Alt+P`), visível em ULTRA, altura limitada a `100vh - 16px` com rolagem interna e `ResizeObserver` (`content.js`).
- [x] Modo 2 (Repor bolas/poções): compra no Market com seletores independentes de idioma, checa ouro e suporta poção `auto` ou fixa.
- [ ] Hardening Market/multi-conta (`content.js`): aba Comprar, card fresco, compra parcial, fila, aviso bola 0 e `cena` só no console · NÃO validado: compra real pós-fix no perfil 2
- [x] Limitador seletivo de FPS (`fps.js`, só `Campo.loop`, UI em 60 FPS, `0.2` mapa parado, pausa oculto) + Modo servidor (`content.js`) + Worker de timers 100 ms.
- [x] Alarme de reserva de 30 s no service worker (`background.js`) e bloqueio de descarte da aba (`autoDiscardable: false`).
- [x] Modo 1/captureRe: toast real "Shedinja capturado — vendido pela Auto Venda" gerou "captura detectada" ao vivo em PT 2026-11-26 · NÃO validado: toast de captura sem Auto Venda e EN
- [x] ULTRA Economia (ultraSupplyTick): código mantido como está; decisão do usuário 2026-11-26: não vale validar (não captura no ULTRA) · NÃO validado: compra real no ciclo do ULTRA
- [ ] Deploy Docker multi-conta no Proxmox (`deploy/`, 4 perfis tela cheia + `tint2` + auto-minimize, ~34% CPU / 1,86 GiB) · NÃO validado: fluidez remota e captura contínua minimizada

## Estudo do jogo (`pokeidle.io/app`)
- [x] Estudo de caso RMT (5.000 tx Itens + 900 tx Pokémon + books): trio de Fragmentos (~5,3–5,7M/G, ~5,6B p/ 1.000G), Stones = transfer P2P, high-end Pokémon só em Gemas (`GAME_STUDY.md`).
- [x] Combate de hunt, Hunt Analyser (`hunt-analyser.mjs`), Outland (40 tiers) e poções confirmados via Wiki/módulos; hunt usa só o Pokémon ativo (`docs/GAME_STUDY.md`).
- [x] Loop do mapa (`campo.mjs`) confirmado sem side effects em combate/captura (`#caidos-lista` via WS + `setInterval` 250 ms); UI do `app.js` usa `rAF` global (`docs/GAME_STUDY.md`).
- [ ] Mapear tela principal, abas, modais e mecânicas completas do `pokeidle.io/app` via `/study-game` para planejar novas automações/ajudas.
- [ ] Capturar formato real dos toasts/logs de captura (PT e EN) para validar `captureRe`.
