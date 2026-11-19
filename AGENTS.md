# PokeIdle Helper

> Regras universais (comunicação PT-BR, economia de tokens, verificação honesta, git e handoff) vêm do plugin `ai-kit` (`.ai-kit.json`). Este arquivo guarda **apenas** o que é específico deste projeto.

Extensão Chrome MV3 para [pokeidle.io](https://pokeidle.io/app) (só cliques no DOM, sem API direta, sem visão computacional). O usuário define direção e prioridades; o agente executa estudo do jogo, código, testes, QA no navegador via MCP, docs e git.

## Fontes de verdade do domínio
- Mecânicas, seletores DOM e achados do jogo: `docs/GAME_STUDY.md` (não ler inteiro; usar Grep + intervalo).
- Armadilhas de Chrome, MCP, MV3, ULTRA e abas ocultas: `docs/BROWSER_QUIRKS.md` (**leia antes de usar o MCP**).
- Documentação para o usuário final e deploy Proxmox/Docker: `README.md`.

## Arquitetura da extensão (Vanilla JS MV3, sem bundler)
- `manifest.json`: MV3, permissão `alarms`, host `https://pokeidle.io/*` (manter enxuto, sem permissões desnecessárias).
- `fps.js`: `world: "MAIN"`, `run_at: "document_start"` — limita FPS do `requestAnimationFrame` e duplica timers em Worker para abas ocultas.
- `types.js`: tabela de tipos e fator de hunt (`PK_TYPES`), exporta via `module.exports` para testes unitários em Node.
- `rmt.js`: cálculos puros do Radar RMT (Ouro → Gema), taxas e ranking de rotas, exporta via `module.exports`.
- `content.js`: `run_at: "document_idle"` — painel flutuante (`#pkbot-panel`), modos (1 captura, 2 repor, 3 eterna, 4 hunt), Radar RMT, vigia de ULTRA/aba oculta; expõe `window.__pkBot`.
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
- Se faltar dado do DOM do jogo para projetar uma feature, rode `/study-game` primeiro.

## Verificação e QA no navegador
- Check local: `node scripts/check.mjs` (sintaxe JS + `manifest.json` + JSONs + `tests/*.test.mjs`). O hook `.githooks/pre-commit` bloqueia commit se falhar.
- **QA no Chrome via MCP (`chrome-devtools`)** na aba real de `pokeidle.io/app`:
  - Recarregue a extensão (via `reload_extension`; se indisponível, peça ao usuário em `chrome://extensions`) e recarregue a aba do jogo.
  - Valide em **1 `evaluate_script`** retornando JSON curto (`#pkbot-panel`, `localStorage['pkbot']`/`pkbot-cfg`, comportamento no DOM) + `list_console_messages` (logs `[pkbot]`, zero erros da extensão). Evite `take_snapshot` da árvore inteira.
  - Antes de ações que gastem ouro/itens, use `CFG.dry = true` ou valide sem gastar; ao terminar, restaure `CFG.dry`, checkboxes e modo de tela.
  - Só peça ao usuário passos estritamente manuais (ex.: login anti-robô).
