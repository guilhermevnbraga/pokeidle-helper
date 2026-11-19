---
name: feature
description: >-
  Pipeline completo para entregar uma feature, melhoria ou correção no pokeidle-helper
  (design, implementação vanilla JS MV3, verificação local, QA no Chrome via MCP, docs e commit+push).
  Use quando o usuário pedir uma nova funcionalidade ou correção na extensão.
---

# /feature — pipeline de entrega

Siga em ordem, sem pedir permissão entre etapas (exceto quando houver ação manual do usuário como login ou decisão de escopo). O estado já veio no hook `SessionStart`: não releia `HANDOFF.md`/`PROGRESS.md` inteiros. Antes de usar o MCP, leia `docs/BROWSER_QUIRKS.md`.

1. **[Design]** Em 1 parágrafo: arquivos afetados, seletores estruturais (independentes de idioma quando possível), impacto em modo Economia/ULTRA e aba oculta, e aderência aos Termos §5 (só cliques no DOM, intervalos conservadores). Se faltar dado do DOM do jogo, rode `/study-game` primeiro.
2. **[Implementação]** Escreva vanilla JS limpo sem dependências externas. Extraia lógica pura para módulos testáveis (`module.exports`). Mantenha `manifest.json` enxuto e sem permissões desnecessárias.
3. **[Verificação local]** Adicione ou atualize testes unitários em `tests/*.test.mjs` para lógica pura nova/alterada (testando o contrato, não o bug). Rode `node scripts/check.mjs` e exija `OK`.
4. **[QA no Chrome via MCP]** Valide na aba real de `pokeidle.io/app`:
   - Recarregue a extensão (via ferramenta de extensão do MCP; se indisponível, peça ao usuário clicar em Recarregar em `chrome://extensions`) e recarregue a aba do jogo.
   - Valide via 1 `evaluate_script` (presença do `#pkbot-panel`, estado em `localStorage['pkbot']`/`pkbot-cfg`, comportamento no DOM) + `list_console_messages` (logs `[pkbot]`, zero erros da extensão). Antes de ações que gastem ouro/itens, teste com `dry: true` ou valide sem gastar.
   - Restaure `CFG.dry` e os checkboxes/modo de tela ao estado anterior ao teste.
5. **[Docs]**
   - `docs/PROGRESS.md`: adicione/atualize UMA linha (≤ 190 chars; marque `[x]` **só** o que foi validado; senão inclua `"NÃO validado: ..."`). Rode `node scripts/compact-progress.mjs --max 190 docs/PROGRESS.md`.
   - Atualize `README.md` se mudou funcionalidade/config visível ao usuário, `docs/GAME_STUDY.md` se houve descoberta do jogo, e `docs/HANDOFF.md` se mudou o estado/próximo passo.
6. **[Git]** `git add` dos arquivos da entrega, commit em **uma linha em inglês** (Conventional Commits, **sem `Co-Authored-By`**), `git push`.
7. **[Relatório]** Poucas linhas: o que foi entregue, resultado do `check.mjs` e do QA no Chrome, o que ficou sem validação, e próxima recomendação se houver.
