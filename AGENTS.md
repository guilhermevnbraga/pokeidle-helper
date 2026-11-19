# PokeIdle Helper

Extensão Chrome MV3 para [pokeidle.io](https://pokeidle.io/app) (só cliques no DOM, sem API direta, sem visão computacional). O usuário define direção e prioridades; o agente executa estudo do jogo, código, testes, QA no navegador via MCP, docs e git. Responda em **PT-BR**, curto, **recomendando** em vez de listar opções.

## Fontes de verdade (Grep antes de Read; leia só o trecho)
- Estado e pendências: o hook `SessionStart` injeta o resumo (`HANDOFF.md` + pendências `- [ ]` + `git log`). **Nunca** leia inteiros `docs/HANDOFF.md`, `docs/PROGRESS.md` ou `docs/GAME_STUDY.md`. Histórico em `docs/archive/` (só Grep).
- Mecânicas, seletores DOM e achados do jogo: `docs/GAME_STUDY.md`.
- Armadilhas de Chrome, MCP, MV3, ULTRA e abas ocultas: `docs/BROWSER_QUIRKS.md` (**leia antes de usar o MCP**).
- Documentação para o usuário final e deploy Proxmox/Docker: `README.md`.

## Arquitetura da extensão (Vanilla JS MV3, sem bundler)
- `manifest.json`: MV3, permissão `alarms`, host `https://pokeidle.io/*`.
- `fps.js`: `world: "MAIN"`, `run_at: "document_start"` — limita FPS do `requestAnimationFrame` e duplica timers em Worker para abas ocultas.
- `types.js`: tabela de tipos e fator de hunt (`PK_TYPES`), exporta via `module.exports` para testes unitários em Node.
- `content.js`: `run_at: "document_idle"` — painel flutuante, modos (1 captura, 2 repor, 3 eterna, 4 hunt), vigia de ULTRA/aba oculta; expõe `window.__pkBot`.
- `background.js`: service worker com alarme de 30 s (`pk-tick`) e `autoDiscardable: false`.
- `deploy/`: Docker + Selkies para rodar 24/7 (Proxmox).

## Regras do jogo e segurança
- **Termos §5 (Automação):** apenas cliques/interações de UI com intervalos conservadores. Proibido chamar APIs internas diretamente, explorar falhas, burlar limites ou sobrecarregar o servidor.
- **Login / anti-robô:** nunca tente logar ou resolver anti-bot/CAPTCHA; o usuário faz login à mão na aba do Chrome.
- **Modos de tela:** a extensão nunca força Economia/ULTRA por conta própria — só sai temporariamente do ULTRA quando precisa e restaura se o usuário estava nele.
- **Uma sessão por conta:** trabalhe sempre na aba já aberta do usuário; nunca abra uma segunda sessão concorrente.

## Código
- Vanilla JS limpo, sem dependências externas nem build step.
- Prefira seletores estruturais independentes de idioma (`data-modal`, `data-slot`, classes/IDs); texto só como fallback em PT e EN.
- Extraia lógica pura (cálculos, parsers, decisões) para módulos testáveis em Node (`if (typeof module !== 'undefined') module.exports = ...`).

## Verificação (obrigatória antes de dar por pronto)
- `node scripts/check.mjs` precisa terminar com `OK` (sintaxe JS + `manifest.json` + testes unitários em `tests/*.test.mjs`). O hook Git `pre-commit` bloqueia commit se falhar.
- Lógica pura nova ganha teste unitário em `tests/` testando o contrato real. Teste falhando por bug real é sucesso: reporte, não enfraqueça.
- QA no navegador real via MCP `chrome-devtools` na aba de `pokeidle.io/app` (use `CFG.dry = true` antes de ações que gastem ouro/itens). Só peça ao usuário passos estritamente manuais (ex.: login anti-robô ou recarregar extensão se o MCP não suportar).
- Honestidade: diga o que **NÃO** foi validado; nunca marque `[x]` sem validação.

## Entrega e Git
- Para features/correções, use a skill `/feature`. Para estudar o jogo, use `/study-game`.
- `docs/PROGRESS.md`: UMA linha por item (≤ 190 chars, com `"NÃO validado: ..."` se houver); compacte com `node scripts/compact-progress.mjs --max 190 docs/PROGRESS.md`.
- Commit + push na entrega: Conventional Commits, inglês, **uma linha, sem corpo** (`feat|fix|refactor|perf|docs|test|chore|build`). **PROIBIDO** `Co-Authored-By` ou qualquer atribuição de IA. Nunca `--force` nem `--no-verify`.

## Economia de tokens
- Grep/busca primeiro, `read_file` só do intervalo (`StartLine`/`EndLine`); não releia arquivo recém-editado.
- **No browser MCP:** prefira **1 `evaluate_script`** retornando JSON curto e estruturado em vez de `take_snapshot` da árvore inteira ou vários screenshots. Use `take_screenshot` só para perguntas visuais. Filtre console e rede.
- Para buscas amplas em vários arquivos, use subagente `research`; para navegação isolada pesada, recomende `/browser`.
- Relatório final em poucas linhas; tabela só para comparar.
- Fim de etapa grande ou contexto longo: rode `/handoff` e sugira `/clear`.
