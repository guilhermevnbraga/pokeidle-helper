---
name: study-game
description: >-
  Protocolo econômico de tokens para estudar o jogo pokeidle.io (DOM, seletores, mecânicas,
  eventos, WebSocket/HUD, modo ULTRA) usando o MCP chrome-devtools na aba aberta do usuário.
  Use quando o usuário pedir para investigar, mapear ou estudar qualquer parte do pokeidle.io.
---

# /study-game — estudo econômico do pokeidle.io via Chrome DevTools MCP

Antes de chamar qualquer ferramenta do MCP, leia `docs/BROWSER_QUIRKS.md`.

## 1. Conexão segura (1 sessão por conta)
1. Liste as abas (`list_pages`) e selecione a aba já aberta em `https://pokeidle.io/app` (`select_page`).
2. **Nunca** abra uma segunda aba do jogo (o servidor derruba a sessão anterior).
3. Se a aba não estiver aberta ou estiver na tela de login/anti-robô, **pare e peça ao usuário** para abrir/logar à mão (nunca tente contornar login ou anti-bot).

## 2. Inspeção econômica (prioridade de menor custo de tokens)
1. **DOM / Seletores / Estado:** use **1 `evaluate_script`** que colete tudo o que precisa de uma vez e retorne **JSON enxuto** (IDs, classes, atributos `data-*`, textos curtos, contagem de elementos). Evite retornar `innerHTML` bruto ou árvores gigantes.
2. **Snapshot de acessibilidade:** evite `take_snapshot` na página inteira — use só se precisar localizar um botão clicável que `evaluate_script` não clarificou.
3. **Screenshots:** use `take_screenshot` **apenas** para perguntas visuais (layout, ícones, overlays). Já está limitado a WebP ≤ 1280 px.
4. **Console / Rede:** use `list_console_messages` ou `list_network_requests` filtrando por tipo/padrão; nunca despeje logs inteiros sem filtro.
5. **Observação passiva:** ao estudar eventos dinâmicos (captura, toasts, log de combate, mudanças no HUD), prefira um snippet curto temporário em `evaluate_script` (ex.: `MutationObserver` com limite de tempo/amostras que se desconecta sozinho) e limpe qualquer listener temporário ao terminar.

## 3. Respeito às regras do jogo (Termos §5)
- Apenas leitura de DOM/eventos e cliques pontuais de investigação, sem flood, sem chamadas diretas à API interna, sem burlar limites.
- Se sair do modo ULTRA para inspecionar Market/Mapa, restaure o modo em que o usuário estava (ou avise).

## 4. Registro obrigatório
- Atualize a seção correspondente em `docs/GAME_STUDY.md` separando claramente **Confirmado no DOM** vs **Hipótese / NÃO confirmado**.
- Se encontrar comportamento inesperado do navegador, extensão ou MCP, adicione 1 linha em `docs/BROWSER_QUIRKS.md`.
- Responda ao usuário com um resumo direto (achados + implicação prática para a extensão).
