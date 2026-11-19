# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-19 (Gerenciador de hunt com Centro Pokémon + cura + trava 3s + proteção contra troca para o mapa atual). Versão da extensão: `0.5.0`. Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 24 passando (`types.js` + `hunt.js` + `rmt.js`). Histórico em `docs/archive/` (só Grep).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Respeitar Termos §5 do PokeIdle (só cliques no DOM, sem API direta, sem mexer em login/anti-robô).

## Estado (2026-11-18)
- Extensão MV3 funcional (`0.5.0`): 4 modos (Captura, Repor bolas/poções, Captura eterna, Gerenciador de hunt via Hunt Analyser + `types.js`) + **Radar RMT (Ouro → Gema)** (`rmt.js` + `#pkbot-rmt-box`) com **plano de ação pronto** (`ONDE` / `COMPRAR` / `VENDER`, veredito comprar agora vs juntar ouro, cálculo pelo book real e Pokémon exato com vendedor em Sacrifício/P5/Mega/Shiny, ranking dobrável e atualização reativa ao saldo).
- Suporte a segundo plano (Worker para timers do jogo em `fps.js`, Worker de loop em `content.js`, alarme de 30 s + `autoDiscardable: false` em `background.js`, keep-alive opcional).
- Limite de FPS configurável (`fps.js`, padrão 10 fps) e saída periódica do ULTRA Economia para atualizar estoques (`ultraSupplyTick`).
- Deploy 24/7 Docker + Selkies pronto em `deploy/` (Proxmox); MCP `chrome-devtools` (`--auto-connect`) e `reload_extension` validados ao vivo na aba `pokeidle.io/app`.

## Descobertas recentes do jogo (detalhes em `docs/GAME_STUDY.md`)
- **RMT (Mercado da Comunidade):** taxas oficiais (15% `Math.ceil` em itens; 13%/10%/7,5% + pensão 100k/d em Pokémon), retenção 2 min, cooldown 30 min, CSV oficial de 5.000 tx (`#cm-hist-csv`, 1/hora).
- **Aba Pokémon RMT:** categorias com liquidez real em Gemas = Sacrifício (sem filtro, N ≥ 3,5), P5 (`#cm-p5`), Mega (`#cm-mega`) e Shiny (`#cm-shiny`); cards `.cm-card` expõem preço exato em `.cm-preco[title]`, nome em `.cm-nome-txt`, atributos (`.cm-sub`, `.cm-pot`, `.pk-selo-n`) e vendedor em `.cm-vend b`.
- **Economia Ouro→Gema (18/11/2026):** melhores rotas líquidas ficam nos Fragmentos (~4,9–5,7M/G); Pedras/Stones em Gemas são transferências P2P; em saldos menores (~50M), Pokémon de Sacrifício (~7,2–7,5M/G) supera lotes pequenos de Bronze Boss Token (25% de taxa).

## Próximos passos (ordem)
1. Validar pendências de gameplay em `docs/PROGRESS.md` via `/study-game` (regex `captureRe` com captura real, time inteiro vs Pokémon em campo no Hunt Analyser, compra real no `ultraSupplyTick`).
2. Opcional no Radar RMT: botão de atalho no card de instrução para abrir o RMT já no item ou filtro de Pokémon recomendado (só navegação, dentro dos Termos §5).
3. Quando houver Pokémon N 3,5+ no Depot, confirmar arredondamento (`ceil` vs `round`) da comissão de Pokémon em Gemas.
4. Definir com o usuário as próximas features/melhorias.

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP).
