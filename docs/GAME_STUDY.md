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
  - Hunt atual: `#hud-hunt` e `#eco-onde` (nome antes de `·`, ex.: `"Geodude · nível 1"`, `"Geodude · Outland 2 · nível 100"`)
  - Estado da cena (`#palco` — confirmado no DOM em 2026-11-19): `.hunt-ativa` (em hunt ou safari), `.safari-ativo` (no Safari), `.centro-ativo` (Centro Pokémon ou Casa); botões de saída/cura sem `.hidden`: `#ir-centro` (`#ir-centro-conta`) / `#eco-ir-centro` (`#eco-ir-centro-conta`), `#centro-curar` / `#eco-curar` (praça do Centro Pokémon), `#casa-sair` (dentro da Casa), `#eco-abandonar` (Arena Boss). `#desistir-combate`/`#eco-desistir` nunca devem ser clicados.
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
  - Marcadores: `#mapa-tela .marcador` (`dataset.travado === '0'`, `dataset.slug`, `title` = `"<nome> — ..."`, classe `.on` indica `h.slug === estado.eu.huntSlug` — confirmado no DOM em 2026-11-19)
  - Analyser (ao dar `mouseover`/`mouseenter` no marcador): `#hunt-analyser-corpo`; números folha em ordem = `[XP treinador/h, XP pokemon/h, Ouro/h]`; tipos do monstro = `.tipo` antes de `.ha-sec`
- **Configurações / Modos de tela:**
  - Botão config: `#btn-config`; aba desempenho: `button` com `/desempenho|performance/i`; toggle ULTRA: `#cfg-ultra` (classe `.on`)
  - Estado atual no `<html>`: `modo-ultra`, `modo-economia`, ou normal (nenhuma)
  - Sair do ULTRA: `#ultra-sair`
- **Mercado da Comunidade (RMT — confirmado no DOM em 2026-11-18):**
  - Abrir modal: `button[data-modal="community"]`; moedas no HUD: `#tr-gold` (Coins/Ouro), `#tr-diamantes`, `#tr-gemas`.
  - Controles no `#modal-corpo`: `#cm-anunciar`, `#cm-meus`, `#cm-historico`, `#cm-historico-compras`, `#cm-historico-global` (abre `.cm-folha` "Tabela de preços"), `#cm-deposito`, `#cm-withdraw`.
  - Tabela de preços (`.cm-folha`): filtros `button.cm-filtro` (`Tudo|Pokemon|Itens|Depósitos|Saques` × `Todas|Coins|Gemas`), lista `.cm-hist-lista .cm-hist-linha`, paginação `.cm-hist-pags`, exportação CSV `#cm-hist-csv` (até 5.000 linhas recentes, limite 1/hora por conexão).
  - Aba Itens: lista `.cmi-linha` (39 itens); painel direito `.cmi-painel` com seletor `.cmp-op` (`Coins` / `Gemas`).
  - Aba Pokémon: filtros `#cm-shiny`, `#cm-p5`, `#cm-mega`, `#cm-lendario`, `#cm-tm-elemental`, `#cm-tm-aoe`, `#cm-limpar`, ordenação `select#cm-ordem` (`recentes|baratos|caros`), moeda `button.cm-moeda`; cards `.cm-card` com `.cm-nome-txt`, `.cm-sub` (Nv), `.cm-pot` (P1-P5), `.pk-selo-n` (Nota), `.cm-preco[title]` (valor exato sem abreviação; `.orb` = Gemas), `.cm-vend b` (vendedor), `.cm-fav[data-fav]` (ID).

## Mecânicas confirmadas
- **Hunt Analyser ignora tipos:** Squirtle e Bulbasaur mostram o mesmo xp/h para Charmander; amplificação da Wiki: `×2 → ×2,5`, `×4 → ×5,5`, `×0,5 → ×0,33`, `×0,25 → ×0,17`.
- **Trava de 3 s em combate ao sair/trocar hunt (confirmado em `app.js` 2026-11-19):** todo golpe dado/recebido rearma `centroLivreEm = agora + 3000`. O jogo atualiza `#ir-centro.disabled` (normal) e `#eco-ir-centro.disabled` (economia) a cada 80 ms com `restaCombateHuntMs() > 0` (e contador em `#ir-centro-conta`/`#eco-ir-centro-conta`). Em modo normal, sem mob vivo na onda (`huntSemMobVivoNoCampo`) o botão também libera imediatamente entre ondas; em Economia (`semCena()`), depende só dos 3 s reais. No Centro Pokémon (`#centro-curar`/`#eco-curar` visíveis), não há combate e a troca pelo mapa fica livre (salvo cooldown de porta `trocaHuntLivreEm`).
- **Mercado da Comunidade (RMT — Wiki + DOM 2026-11-18):** comissão de venda de itens em Gema é 15% fixa (arredondada para cima `Math.ceil`), paga pelo vendedor; Pokémon em Gema tem alíquota progressiva (`13% / 10% / 7,5%`) + pensão `100k Coins/dia`; retenção de `2 min` ao anunciar; 1 anúncio por item e `30 min` de cooldown após encerrar; preço mínimo `2` un. (Coins ou Gemas). Saque mínimo de Gemas: `1.000` (USDT Solana SPL, `US$ 0,009/Gema`).
- **ULTRA Economia:** congela HUD (ouro/bolas/poções) e zera lista de captura/cena (0 ms/s JS), mas `#hud-log` continua recebendo eventos e a caixa ULTRA atualiza a cada 10 s. Market e Mapa não abrem no ULTRA.
- **Modo Economia:** desliga a cena (captura não funciona), mas Market e Mapa abrem normalmente.

## Perguntas em aberto (para investigar com `/study-game`)
- **NÃO confirmado:** formato exato do toast/log ao capturar um Pokémon (PT e EN).
- **NÃO confirmado:** se combate/hunt considera só o Pokémon ativo ou o time inteiro.
- **NÃO confirmado:** demais telas/mecânicas do jogo (equipe, mochila, ginásios, raids, eventos, shinies, breeding, quests, etc.) ainda não mapeadas.
