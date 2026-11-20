# PROGRESS — PokeIdle Helper

Regra: UMA linha por item (≤ 190 chars). Compacte com `compact-progress.mjs` do `ai-kit`. Nunca marque `[x]` sem validação.

## Ambiente de desenvolvimento & IA
- [x] Arquitetura Antigravity econômica: `AGENTS.md`, hook `SessionStart`, Git `pre-commit`, `scripts/check.mjs`, `compact-progress.mjs`, skills `/handoff`, `/study-game`, `/feature` e `docs…
- [x] Suite de testes unitários nativa (`node --test`) cobrindo `types.js`, `hunt.js`, `rmt.js` e `ball.js` (`tests/*.test.mjs`).
- [x] Conexão MCP `chrome-devtools` (`--auto-connect`) e reload de extensão validados ao vivo com `pokeidle.io/app` no Chrome Stable.

## Extensão MV3 (estado atual v0.7.2+)
- [ ] Gerenciador de hunt v3 (`hunt.js`+`content.js`): auto + botão `Verificar` encadeando `Hunt->RMT->Pokébola` (v0.7.6) · NÃO validado: troca real, Economia e ULTRA Economia
- [ ] Analisador de Pokébola (`ball.js`+`content.js`): auto-aplica bola recomendada + mín. 10 / repor 100 (v0.7.6) · NÃO validado: hunt mista (>1 espécie) e com Shiny/Lure
- [x] Radar RMT v0.7.5 (`rmt.js`+`content.js`): 100% itens fungíveis (remove Pokémon), META ÓTIMA no topo em SAVE_ONLY, validado em Node e Chrome (9,8 s).
- [ ] Radar RMT: seletores de itens em idioma EN · NÃO validado: jogo testado só em PT
- [x] Painel flutuante arrastável, minimizável e ocultável (`Alt+P`), visível mesmo em ULTRA Economia, com config persistida em `localStorage`.
- [x] Modo 2 (Repor bolas/poções): compra no Market com seletores independentes de idioma, checa ouro e suporta poção `auto` ou fixa.
- [ ] Hardening Market/multi-conta (`content.js`): aba Comprar, card fresco, compra parcial, fila, aviso bola 0 e `cena` só no console · NÃO validado: compra real pós-fix no perfil 2
- [x] Limitador seletivo de FPS (`fps.js`, só `Campo.loop`, UI em 60 FPS, `0.2` mapa parado, pausa oculto) + Modo servidor (`content.js`) + Worker de timers 100 ms.
- [x] Alarme de reserva de 30 s no service worker (`background.js`) e bloqueio de descarte da aba (`autoDiscardable: false`).
- [ ] Modo 1 (Captura com parada automática): regex `captureRe` sobre toasts/log · NÃO confirmado com uma captura real
- [ ] Ciclo completo de compra após saída periódica do ULTRA Economia (`ultraSupplyTick`) · NÃO validado: volta ao ULTRA confirmada, compra real no ciclo ainda não ocorreu
- [ ] Deploy Docker multi-conta no Proxmox (`deploy/`, 4 perfis tela cheia + `tint2` + auto-minimize, ~34% CPU / 1,86 GiB) · NÃO validado: fluidez remota e captura contínua minimizada

## Estudo do jogo (`pokeidle.io/app`)
- [x] Estudo de caso RMT (5.000 tx Itens + 900 tx Pokémon + books): trio de Fragmentos (~5,3–5,7M/G, ~5,6B p/ 1.000G), Stones = transfer P2P, high-end Pokémon só em Gemas (`docs/GAME_STUDY.m…
- [x] Combate de hunt, Hunt Analyser (`hunt-analyser.mjs`), Outland (40 tiers) e poções confirmados via Wiki/módulos; hunt usa só o Pokémon ativo (`docs/GAME_STUDY.md`).
- [x] Loop do mapa (`campo.mjs`) confirmado sem side effects em combate/captura (`#caidos-lista` via WS + `setInterval` 250 ms); UI do `app.js` usa `rAF` global (`docs/GAME_STUDY.md`).
- [ ] Mapear tela principal, abas, modais e mecânicas completas do `pokeidle.io/app` via `/study-game` para planejar novas automações/ajudas.
- [ ] Capturar formato real dos toasts/logs de captura (PT e EN) para validar `captureRe`.
