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

- **Pokedex (confirmado no DOM e `app.js` em 2026-11-19):**
  - Abrir modal: `button[data-modal="pokedex"]`; filtro `#f-dex`; cards `.dex-card`; ficha `#ficha-corpo` (`#ficha-titulo`, `#ficha-fechar`).
  - Placas `.fi-placa`: `Nível na hunt`, `Nível ao capturar`, `XP por derrota`, `O NPC paga` (`sellValueBaseDe`), `Chance na tentativa de captura` (Shiny, `1 em 24.000` sem Lure, `1 em 12.000` com Shiny Secret Lure — ausente em variantes Outland sem forma Shiny).
  - Tabelas `.fi-tabela`: tabela de captura normal (5 colunas: `Pokebola | Eficiência | Chance | Derrotas (média) | Preço`) e tabela `Captura do shiny` (4 colunas).
  - Stats-base da espécie: `.fi-stat` (`HP, ATK, DEF, SP.ATK, SP.DEF, SPD`); boosts ativos do treinador no HUD em `#tr-ativos .tr-ativo`.

## Mecânicas confirmadas
- **Combate de Hunt, Hunt Analyser e Outland (confirmado em `hunt-analyser.mjs`, `pokepedia.mjs`, `shared/*.mjs` e DOM 2026-11-19):**
  - **Hunt Analyser do jogo é cego ao combate real:** `killsPorHora` usa taxa fixa (~983 abates/h, `3,5 s/abate` + `2,6 s/onda`), ignorando tipos, nível, stats-base, golpes, poções e velocidade real de abate.
  - **Fórmula real de dano na hunt:** `base = ((2 * lv / 5 + 2) * power * (atk / def)) / 50 + 2`; `final = base * STAB(1.5) * efetividadeAmplificada * rand(0.85..1.00)`. Amplificação: `×0→0`, `×0.25→0.167`, `×0.5→0.333`, `×1→1`, `×2→2.5`, `×4→5.5`.
  - **Combate usa apenas o Pokémon ativo:** recarga só corre com o ativo em campo (suplente só entra se desmaiar sem Revive). Golpes recarregam conforme o poder (`30→14s` até `600→60s`), com desconto de até `7%` pelo Speed base + IV SPD. Nos gaps usa **Investida** (física, `power 30`, STAB `×1.5`, **sempre no 1º tipo**, só usa o 2º se imune; cooldown `2s - 0.01s * ivSpd`, GCD `0.9s - 0.01s * ivSpd`, piso `400ms`).
  - **Selvagem na hunt:** `hpCombate = round(hp * 12) * 5` (HP ×5), dano `×1.8`, intervalo mínimo `1.4 s` entre golpes.
  - **Outland (40 tiers, Nv 150..65.000):** mesmo mapa Nv 150, sem Shiny, mas única área com os 5 drops raros (Bronze Boss Token `1/10.000` e 4 fragmentos/osso `1/250.000` × multiplicador do tier `1×..20×`), pedras de evolução com chance de forma final (`0.5%` por tipo) e seletores em `.mapa-outland select`.
  - **Modo Lista do Mapa (`#mapa-lista .ml-linha`):** lista todas as áreas da região com `data-slug`, `.ml-nome`, `.ml-nv` e `.tipo` sem esperar imagem do mapa.
  - **Poções no Market:** Small (`+60 HP`, `50g`), Great (`+150`, `150g`), Ultra (`+400`, `400g`), Hyper (`+1.000`, `800g`), Ultimate (`+3.000`, `1.500g`), Golden (`50% HP máx`, `2.500g`).
- **Captura, venda NPC, Potência, Nota e Shiny (confirmado em `shared/*.mjs` + Wiki 2026-11-19):**
  - Captura: 1 arremesso por Pokémon derrotado (`hpFrac = 0`); `chance = clamp(0.003, 0.10, 0.0075 * (catchRate / fator) * 1.4)` (`FATOR_CAPTURA_DO_DEGRAU = { 20: 2.8669, 40: 3.5745, 100: 4.4681 }`); bolas no Market NPC: Poke (`×1`, `5`), Great (`×2`, `20`), Super (`×3`, `50`), Ultra (`×4`, `130`); Beast (`×8`, só Diamante). Boost de Captura dobra a chance respeitando o teto de `10%`.
  - Venda NPC (`shared/sell-value.mjs`): `baseNpc * (1 + min(nivelCap, 100) / 50) * qualidade * (shiny ? 10 : 1)`; média exata de `BANDAS_QUALIDADE` = `1,17692`. Ouro por abate (`shared/recompensa-hunt.mjs`): `ouroPorKillDoNivel(n)` (`36` no Nv 1 → `6.000` no Nv 5.000, teto Nv 25.000) + `+15%` de loot base (+ bônus de loot/guild/evento).
  - Potência (`P1..P5`, Wiki): `P1 74,5% (+0%)`, `P2 20% (+5%)`, `P3 5% (+10%)`, `P4 0,5% (+25%)`, `P5 0,005% (+100%)`.
  - Elegibilidade RMT (`shared/nota-pokemon.mjs`): Shiny (sempre, só em Gemas), P5 (sempre), demais exigem `level >= 50` e `nota >= 3,5`. Brilho Shiny é sorteado no arremesso (`1/24.000`, `1/12.000` com Shiny Secret Lure); qualidade/IV/potência só rolam se a captura fechar.
- **Trava de 3 s em combate ao sair/trocar hunt (confirmado em `app.js` 2026-11-19):** todo golpe dado/recebido rearma `centroLivreEm = agora + 3000`. O jogo atualiza `#ir-centro.disabled` (normal) e `#eco-ir-centro.disabled` (economia) a cada 80 ms com `restaCombateHuntMs() > 0` (e contador em `#ir-centro-conta`/`#eco-ir-centro-conta`). Em modo normal, sem mob vivo na onda (`huntSemMobVivoNoCampo`) o botão também libera imediatamente entre ondas; em Economia (`semCena()`), depende só dos 3 s reais. No Centro Pokémon (`#centro-curar`/`#eco-curar` visíveis), não há combate e a troca pelo mapa fica livre (salvo cooldown de porta `trocaHuntLivreEm`).
- **Mercado da Comunidade (RMT — Wiki + DOM 2026-11-18):** comissão de venda de itens em Gema é 15% fixa (arredondada para cima `Math.ceil`), paga pelo vendedor; Pokémon em Gema tem alíquota progressiva (`13% / 10% / 7,5%`) + pensão `100k Coins/dia`; retenção de `2 min` ao anunciar; 1 anúncio por item e `30 min` de cooldown após encerrar; preço mínimo `2` un. (Coins ou Gemas). Saque mínimo de Gemas: `1.000` (USDT Solana SPL, `US$ 0,009/Gema`).
- **ULTRA Economia:** congela HUD (ouro/bolas/poções) e zera lista de captura/cena (0 ms/s JS), mas `#hud-log` continua recebendo eventos e a caixa ULTRA atualiza a cada 10 s. Market e Mapa não abrem no ULTRA.
- **Modo Economia:** desliga a cena (captura não funciona), mas Market e Mapa abrem normalmente.

## Perguntas em aberto (para investigar com `/study-game`)
- **NÃO confirmado:** formato exato do toast/log ao capturar um Pokémon (PT e EN).
- **NÃO confirmado:** demais telas/mecânicas do jogo (equipe, mochila, ginásios, raids, eventos, shinies, breeding, quests, etc.) ainda não mapeadas.
