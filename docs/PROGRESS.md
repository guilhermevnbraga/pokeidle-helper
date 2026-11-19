# PROGRESS — PokeIdle Helper

Regra: UMA linha por item (≤ 190 chars). Compacte com `compact-progress.mjs` do `ai-kit`. Nunca marque `[x]` sem validação.

## Ambiente de desenvolvimento & IA
- [x] Arquitetura Antigravity econômica: `AGENTS.md`, hook `SessionStart`, Git `pre-commit`, `scripts/check.mjs`, `compact-progress.mjs`, skills `/handoff`, `/study-game`, `/feature` e `docs…
- [x] Suite de testes unitários nativa (`node --test`) cobrindo `types.js`, `hunt.js`, `rmt.js` e `ball.js` (`tests/*.test.mjs`).
- [x] Conexão MCP `chrome-devtools` (`--auto-connect`) e reload de extensão validados ao vivo com `pokeidle.io/app` no Chrome Stable.

## Extensão MV3 (estado atual v0.7.0)
- [ ] Gerenciador de hunt v3 (`hunt.js`+`content.js`): simulador de combate/economia (4 focos, NPC, poções, Outland, cache… · NÃO validado: troca ao vivo em perfis secundários e modo Economia
- [ ] Analisador de Pokébola (`ball.js`+`content.js`): valida hunt atual (NPC, RMT, Shiny, abates/h) e aplica… · NÃO validado: hunt mista (>1 espécie), com Shiny/Lure e após scan RMT completo
- [x] Radar RMT v0.5.0 (`rmt.js` + `content.js`): plano de ação ONDE/COMPRAR/VENDER (veredito comprar vs juntar + Pokémon exato em Sacrifício/P5/Mega/Shiny), validado em Node e Chrome.
- [ ] Radar RMT: arredondamento (`ceil` vs `round`) no input de anúncio de Pokémon e seletores em idioma EN · NÃO validado: conta sem Pokémon N 3,5+ no Depot e jogo testado só em PT
- [x] Painel flutuante arrastável, minimizável e ocultável (`Alt+P`), visível mesmo em ULTRA Economia, com config persistida em `localStorage`.
- [x] Modo 2 (Repor bolas/poções): compra no Market com seletores independentes de idioma, checa ouro e suporta poção `auto` ou fixa.
- [ ] Hardening Market/multi-conta (`content.js`): aba Comprar, card fresco, compra parcial, fila, aviso bola 0 e `cena` só no console · NÃO validado: compra real pós-fix no perfil 2
- [x] Limitador de FPS (`fps.js`, `world: MAIN`) e timers do jogo espelhados em Worker para captura continuar em aba oculta.
- [x] Alarme de reserva de 30 s no service worker (`background.js`) e bloqueio de descarte da aba (`autoDiscardable: false`).
- [ ] Modo 1 (Captura com parada automática): regex `captureRe` sobre toasts/log · NÃO confirmado com uma captura real
- [ ] Ciclo completo de compra após saída periódica do ULTRA Economia (`ultraSupplyTick`) · NÃO validado: volta ao ULTRA confirmada, compra real no ciclo ainda não ocorreu
- [ ] Deploy Docker/Selkies 24/7 no Proxmox (`deploy/`) e passthrough de GPU (`/dev/dri`) · NÃO validado: GPU passthrough ainda não testado

## Estudo do jogo (`pokeidle.io/app`)
- [x] Estudo de caso RMT (5.000 tx Itens + 900 tx Pokémon + books): trio de Fragmentos (~5,3–5,7M/G, ~5,6B p/ 1.000G), Stones = transfer P2P, high-end Pokémon só em Gemas (`docs/GAME_STUDY.m…
- [x] Combate de hunt, Hunt Analyser (`hunt-analyser.mjs`), Outland (40 tiers) e poções confirmados via Wiki/módulos; hunt usa só o Pokémon ativo (`docs/GAME_STUDY.md`).
- [ ] Mapear tela principal, abas, modais e mecânicas completas do `pokeidle.io/app` via `/study-game` para planejar novas automações/ajudas.
- [ ] Capturar formato real dos toasts/logs de captura (PT e EN) para validar `captureRe`.
