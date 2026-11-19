# PROGRESS — PokeIdle Helper

Regra: UMA linha por item (≤ 190 chars). Compacte com `node scripts/compact-progress.mjs --max 190 docs/PROGRESS.md`. Nunca marque `[x]` sem validação.

## Ambiente de desenvolvimento & IA
- [x] Arquitetura Antigravity econômica: `AGENTS.md`, hook `SessionStart`, Git `pre-commit`, `scripts/check.mjs`, `compact-progress.mjs`, skills `/handoff`, `/study-game`, `/feature` e `docs…
- [x] Suite de testes unitários nativa (`node --test`) cobrindo `types.js` (`tests/types.test.mjs`).
- [ ] Conexão MCP `chrome-devtools` (`--auto-connect`) validada com `pokeidle.io/app` no Chrome Stable · NÃO validado: aguarda usuário ativar remote debugging e reiniciar sessão

## Extensão MV3 (estado atual v0.3.0)
- [x] Painel flutuante arrastável, minimizável e ocultável (`Alt+P`), visível mesmo em ULTRA Economia, com config persistida em `localStorage`.
- [x] Modo 2 (Repor bolas/poções): compra no Market com seletores independentes de idioma, checa ouro e suporta poção `auto` ou fixa.
- [x] Modo 4 (Gerenciador de hunt): lê Hunt Analyser em todas as regiões liberadas, aplica vantagem de tipo (`types.js`) e aguarda combate sem desistir.
- [x] Limitador de FPS (`fps.js`, `world: MAIN`) e timers do jogo espelhados em Worker para captura continuar em aba oculta.
- [x] Alarme de reserva de 30 s no service worker (`background.js`) e bloqueio de descarte da aba (`autoDiscardable: false`).
- [ ] Modo 1 (Captura com parada automática): regex `captureRe` sobre toasts/log · NÃO confirmado com uma captura real
- [ ] Ciclo completo de compra após saída periódica do ULTRA Economia (`ultraSupplyTick`) · NÃO validado: volta ao ULTRA confirmada, compra real no ciclo ainda não ocorreu
- [ ] Deploy Docker/Selkies 24/7 no Proxmox (`deploy/`) e passthrough de GPU (`/dev/dri`) · NÃO validado: GPU passthrough ainda não testado

## Estudo do jogo (`pokeidle.io/app`)
- [ ] Mapear tela principal, abas, modais e mecânicas completas do `pokeidle.io/app` via `/study-game` para planejar novas automações/ajudas.
- [ ] Confirmar se o cálculo de hunt do jogo usa apenas o Pokémon em campo ou o time inteiro.
- [ ] Capturar formato real dos toasts/logs de captura (PT e EN) para validar `captureRe`.
