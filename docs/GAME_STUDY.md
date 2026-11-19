# GAME STUDY — pokeidle.io (`https://pokeidle.io/app`)

Fonte de verdade sobre DOM, mecânicas, eventos e regras do jogo. **Não leia inteiro**: use Grep pela seção desejada.
Sempre separe **Confirmado no DOM** de **Hipótese / NÃO confirmado**.

## Regras oficiais relevantes (Termos §5 — Automação)
- **Confirmado (README):** Termos (`https://pokeidle.io/terms`, seção 5) permitem automação desde que não explore falhas, não burle limites e não sobrecarregue o servidor.
- **Confirmado:** login usa verificação anti-robô (sempre manual).
- **Confirmado:** apenas **1 sessão por conta**; abrir outra aba/navegador exibe `"Account opened elsewhere"` e pausa a anterior.

## Seletores DOM conhecidos (extraídos de `content.js`)
> **Confirmado no código atual (revalidar ao vivo se o jogo atualizar):**
- **Modais gerais:** `.modal-caixa` (visível quando `offsetParent` truthy); botão fechar = `button` com `innerText.trim() === '×'`; abertura via `button[data-modal="<key>"]` (`market`, `mapa`).
- **HUD:**
  - Ouro: `#tr-gold`
  - Hunt atual: `#hud-hunt` (nome antes de `·`)
  - Log de combate: `#hud-log` (mensagens com `+X xp pokemon`, `poção usada`/`potion used`, `derrotado!`, `escapou e sumiu`)
  - Toasts: `#toast` (e elementos dinâmicos no `document.body`)
  - Pokébolas (auto-chip): `#auto-ball-opts .auto-chip` (`title` começa com nome da bola, `.q` = quantidade)
  - Poções (auto-chip): `#auto-potion-opts .auto-chip` (`title` = `"<nome> — ..."`, `.q` = quantidade, classe `.on` = ligada)
  - Tipos do Pokémon em campo: 1º grupo `.tipo` fora de `.modal-caixa,#hunt-analyser,#ficha,#caidos,#palco`
- **Captura ("Proximidade para Capturar"):**
  - Seleção de bola: `#caidos-bolas .caidos-bola` (`title`, classe `.on`)
  - Lista de alvos: `#caidos-lista .caido` (`dataset.slot`)
  - Regex de captura atual (`NÃO confirmado com captura real`): `/captur(ou|ad[oa]|a!|ed)|caught|gotcha/i` (excluindo `derrotado|defeated`)
- **Market (`data-modal="market"`):**
  - Categorias: `.mk-cat` (`0` = pokébolas, `1` = poções)
  - Card de item: `.mk-card`, nome em `.mk-nome[title]`, preço em `.mk-moeda`, estoque em `.mk-tem[data-tem]`
  - Quantidade: `.mk-atalho[data-q="<qty>"]` ou `input[type=number]`; compra em `.mk-acao`
- **Mapa & Hunt Analyser (`data-modal="mapa"`):**
  - Modo de visualização: `.mapa-modo-bt` (índice `0` = visão de mapa)
  - Regiões: `button.mapa-reg-bt` (bloqueadas têm `.mapa-area-travada`)
  - Marcadores: `#mapa-tela .marcador` (`dataset.travado === '0'`, `dataset.slug`, `title` = `"<nome> — ..."`)
  - Analyser (ao dar `mouseover`/`mouseenter` no marcador): `#hunt-analyser-corpo`; números folha em ordem = `[XP treinador/h, XP pokemon/h, Ouro/h]`; tipos do monstro = `.tipo` antes de `.ha-sec`
- **Configurações / Modos de tela:**
  - Botão config: `#btn-config`; aba desempenho: `button` com `/desempenho|performance/i`; toggle ULTRA: `#cfg-ultra` (classe `.on`)
  - Estado atual no `<html>`: `modo-ultra`, `modo-economia`, ou normal (nenhuma)
  - Sair do ULTRA: `#ultra-sair`

## Mecânicas confirmadas
- **Hunt Analyser ignora tipos:** Squirtle e Bulbasaur mostram o mesmo xp/h para Charmander; amplificação da Wiki: `×2 → ×2,5`, `×4 → ×5,5`, `×0,5 → ×0,33`, `×0,25 → ×0,17`.
- **ULTRA Economia:** congela HUD (ouro/bolas/poções) e zera lista de captura/cena (0 ms/s JS), mas `#hud-log` continua recebendo eventos e a caixa ULTRA atualiza a cada 10 s. Market e Mapa não abrem no ULTRA.
- **Modo Economia:** desliga a cena (captura não funciona), mas Market e Mapa abrem normalmente.

## Perguntas em aberto (para investigar com `/study-game`)
- **NÃO confirmado:** formato exato do toast/log ao capturar um Pokémon (PT e EN).
- **NÃO confirmado:** se combate/hunt considera só o Pokémon ativo ou o time inteiro.
- **NÃO confirmado:** demais telas/mecânicas do jogo (equipe, mochila, ginásios, raids, eventos, shinies, breeding, quests, etc.) ainda não mapeadas.
