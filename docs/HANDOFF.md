# HANDOFF — estado e como retomar (curto de propósito)

Atualizado: 2026-11-26. Versão da extensão: `1.0.0`. Último commit de código: `fix: clear persisted map and pokedex search filters` (ver git log). Repo: `github.com/guilhermevnbraga/pokeidle-helper` (`main`). Testes unitários: 96 passando. Histórico em `docs/archive/` (só Grep; versão anterior deste arquivo: `HANDOFF_ate_2026-11-26.md`).
Checklist detalhado: `docs/PROGRESS.md` (use as pendências `- [ ]`, não leia inteiro).

## Regras de trabalho
Vivem no `AGENTS.md` (não repetir aqui). Termos §5 do PokeIdle: só cliques no DOM, sem API direta, sem mexer em login/anti-robô.

## Estado atual (2026-11-26)
- **UI nova do painel (`content.js`, `buildPanel` + `PANEL_CSS`):** tema único em `<style id="pkbot-style">` (variáveis `--pkb-*`, classes `pkb-*`), cabeçalho de status (bolinha, modos ativos, ⏸/▶ que pausa e retoma os mesmos modos, recolher em pílula, ×/Alt+P), chips de tela/aba oculta/dry-run e **abas** Auto · Hunt · Bola · RMT · Pedras · Venda. As saídas de todas as abas são **cards** (`pkb-step`, `pkb-verdict`, `pkb-tiers`, `pkb-item`…); ids `pkbot-*` e `window.__pkBot` preservados.
- **Validado ao vivo:** abas, pausa/retoma, pílula, arraste (contido nas bordas), ULTRA, jogo em **EN** (RMT, Pedras simular, Venda carregar, Bola analisar), sem erros no console. Janela estreita real **não** testada (o MCP não emula viewport; só CSS forçado, ok).
- **Auto-reload de dev (`background.js`):** só em extensão descompactada; a cada 30 s compara os arquivos e chama `chrome.runtime.reload()` (~40 s após editar). Depois recarregue a aba do jogo (`navigate`). Se remover do pacote final, é só apagar o bloco `DEV`.
- Funcionalidades (Hunt v3, Analisador de Pokébola, Radar RMT + Trading + Timing, Venda de Pedras, Analisador de Venda v0.9.1) inalteradas nesta sessão; só a apresentação mudou.

- **Fix 2026-11-26:** filtros de busca do jogo persistem entre aberturas (`#f-mapa`, `#f-nivel-min/max`, `#f-dex`); `neutralizeFilters`/`restoreFilters` (content.js, perto de `closeModal`) limpam ao abrir Mapa/Pokedex e restauram ao fechar. Validado ao vivo com 'pika' no mapa (scan ok, filtro restaurado). `window.__pkBot` não é acessível pelo `javascript_tool` (mundo isolado): acione pelos botões do painel (`#pkbot-hunt-scan`).

## Próximos passos (ordem)
1. **Bug "Meus anúncios" (`readMyListings`):** em EN o log disse `0 item(ns), 1 Pokémon(s)` com 2 anúncios (Shiny Shedinja e 78× Darkness Stone a 77K/un.); o card do item não vira item. Texto do card: `78× Darkness Stone DARK 78 in stock · 77K per unit your listing`. Inspecionar o DOM de `#cm-meus` pelo fluxo da extensão e corrigir o parser (nome vem depois de `N×`).
2. Atualizar `README.md` com a UI nova (abas, status, pausa, pílula) — pendente, não feito.
3. Validar ao vivo o que segue `- [ ]` no PROGRESS: troca real do Gerenciador de hunt (v0.7.8), regra dos 15% do preço de venda, timing do RMT, hunt com >1 espécie/Shiny no Analisador de Bola; só depois pensar em `1.0`.
4. Teste de janela estreita real (DevTools → device toolbar, ~500px).

## Pendente do usuário
- Perfis secundários do Chrome: recarregar a extensão em `chrome://extensions` (o auto-reload só vale no perfil onde ele já está rodando) e `F5` no jogo; atualizar o container no CT 104 se quiser a UI nova lá.
- `docs/META_ANALYSIS.md` e `scripts/meta-model.mjs` estão não rastreados (anteriores a esta sessão): decidir se entram no repo.

## Armadilhas
Todas em `docs/BROWSER_QUIRKS.md` (fonte única; leia antes de usar o MCP). Extra desta sessão: `chrome://` é bloqueado para o MCP (reload manual só na 1ª vez); `resize_window` não altera o viewport; a Cache API não aceita chave `chrome-extension://`.
