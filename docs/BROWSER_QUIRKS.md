# BROWSER QUIRKS — Chrome, MCP `chrome-devtools` e MV3

Leia este arquivo **antes** de usar o MCP do navegador. Acrescente novas armadilhas em 1 linha cada.

## MCP `chrome-devtools` (`--auto-connect`)
- **Ativação obrigatória no Chrome:** precisa estar ligado em `chrome://inspect/#remote-debugging` (Chrome 144+; aqui usamos Chrome Stable 157). Na 1ª conexão de cada sessão do Chrome, o navegador exibe um popup pedindo permissão (**Allow**) — se a ferramenta travar aguardando, avise o usuário para clicar em Allow.
- **1 sessão por conta:** nunca abra outra aba de `pokeidle.io/app`; sempre use `list_pages` → `select_page` na aba já logada do usuário.
- **Economia de tokens:** `take_snapshot` em páginas complexas gera milhares de tokens; prefira 1 `evaluate_script` retornando JSON filtrado. Screenshots já estão limitados a WebP ≤ 1280 px pelo `mcp_config.json`.
- **Headers sensíveis:** `--redactNetworkHeaders` está ligado para não vazar cookies/tokens no contexto da IA.
- **Categorias desativadas:** emulação, performance e memória estão desligadas no `mcp_config.json` para economizar tokens; se precisar de profiling/emulação algum dia, reative temporariamente.
- **MCP no Windows:** o `mcp_config.json` chama `cmd /c npx -y chrome-devtools-mcp@latest ...` porque `npx` direto sem shell wrapper costuma falhar com spawn error no Windows.

## Extensão MV3 (`manifest.json`)
- **Dois mundos JS:** `fps.js` roda em `world: "MAIN"` (`document_start`); `types.js` e `content.js` rodam no `world: "ISOLATED"` (`document_idle`). Comunicação entre eles só via eventos no `document` (`pk-fps`, `pk-pump`, `pk-stat`) e `localStorage`.
- **`evaluate_script` roda no `MAIN` world da página:** objetos de `content.js` (`window.__pkBot`) ficam no **ISOLATED world** da extensão, então `evaluate_script` no mundo da página **não** enxerga `window.__pkBot` diretamente (enxerga o DOM `#pkbot-panel`, `localStorage['pkbot']`/`pkbot-cfg`, e `window.__pkFps`). Para inspecionar o estado do bot pelo MCP, leia `#pkbot-panel`, `localStorage`, ou logs `[pkbot]` em `list_console_messages`.
- **Recarregar extensão:** após editar arquivos da extensão, use `list_extensions` + `reload_extension` do MCP `chrome-devtools` (`--categoryExtensions` já está ativo) **e** recarregue a aba `pokeidle.io/app` (`navigate_page` reload). Só peça ao usuário se o reload via MCP falhar.

## Jogo (`pokeidle.io/app`) e abas ocultas
- **Throttling em aba oculta:** Chrome pausa `requestAnimationFrame` e freia `setTimeout`/`setInterval` para ~1/min. `fps.js` espelha timers em Worker e `content.js` + `background.js` (alarme 30 s) mantêm o loop vivo.
- **Alvos fantasma na captura:** `#caidos-lista .caido` às vezes mantém Pokémon que já sumiu do chão; `content.js` ignora o `slot` por 60 s se nenhum arremesso gastar bola.
- **ULTRA Economia:** Market e Mapa não abrem; HUD congela. Sempre restaurar o ULTRA se sair dele temporariamente.
- **Em combate ao trocar hunt:** o jogo exibe toast `"Em combate — espere Xs"`; respeitar o cooldown, nunca clicar em "Desistir do Combate".
