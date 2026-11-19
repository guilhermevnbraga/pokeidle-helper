---
name: handoff
description: >-
  Salva o contexto da sessão do pokeidle-helper de forma econômica antes de rodar /clear
  (HANDOFF curto, PROGRESS compacto, arquivamento do excesso, check e commit+push).
  Use ao fim de uma etapa grande, de uma sessão, ou quando o usuário pedir /handoff.
---

# /handoff — salvar estado para a próxima sessão

Meta: a próxima sessão começa só com o resumo injetado automaticamente pelo hook `SessionStart` (`scripts/hooks/session-start.mjs`: `HANDOFF.md` + pendências `- [ ]` + `git log`, ~1,5–3 mil tokens). Tudo aqui é curto de propósito.

1. Rode `git log --oneline -15` e `git status --short` para ver o que realmente mudou (não releia código nem docs grandes).
2. **PROGRESS (`docs/PROGRESS.md`):** garanta que cada entrega ou estudo concluído tem UMA linha `- [x]` ou `- [ ]` (máx. 190 chars, com `"NÃO validado: ..."` se aplicável). Em seguida rode:
   `node scripts/compact-progress.mjs --max 190 docs/PROGRESS.md`
   Detalhes longos de mecânicas/seletores vão para `docs/GAME_STUDY.md`; armadilhas vão para `docs/BROWSER_QUIRKS.md`.
3. **HANDOFF (`docs/HANDOFF.md`):** reescreva de forma enxuta apenas o que mudou:
   - Data, versão (`manifest.json`), último commit de código e contagem de testes.
   - **Estado atual** (3–5 linhas).
   - **Descobertas recentes do jogo** (só resumo de 2–4 linhas apontando para `docs/GAME_STUDY.md`).
   - **Próximos passos** (máx. 4 itens em ordem de prioridade).
   - **Pendente do usuário** (ações manuais necessárias, se houver).
   - **Armadilhas:** aponte para `docs/BROWSER_QUIRKS.md` (não duplique aqui).
   - **Limite rígido:** ≤ 6 KB. Se passar, mova histórico antigo para `docs/archive/HANDOFF_ate_<YYYY-MM-DD>.md` (só Grep depois).
4. **Verificação:** rode `node scripts/check.mjs` e confirme `OK`.
5. **Commit e push:** faça `git add` apenas dos arquivos alterados do handoff/docs, commit em **uma linha em inglês** no padrão Conventional Commits (`docs: update session handoff`), **sem `Co-Authored-By`**, e rode `git push`.
6. **Resposta final (máx. 2 linhas):** informe o que foi salvo e diga ao usuário que pode rodar `/clear` — a próxima sessão já recebe o contexto automaticamente pelo hook `SessionStart`.
