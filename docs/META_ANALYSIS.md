# META ANALYSIS — quanto upar antes de focar na Outland (2026-11-26)

Reproduzível: `node scripts/meta-model.mjs [nivelInicial] [dias]`. Dados lidos do jogo (Wiki, Pokedex, RMT, `pkbot-hunt`, `pkbot-rmt-hist`) em 2026-11-26; preços mudam, refaça a leitura antes de decidir de novo.

## Fatos medidos
- 40 Outlands = **mesmo mapa, mesmos mobs Nv 150**; só o multiplicador de drop muda (×1 em T150 … ×20 em T65.000). XP/h da Outland é igual em qualquer tier (≈15,3M xp/h na conta T860) e ~4,5–7× menor que a melhor hunt normal (Nv 500: 69M, Nv 700: 105M).
- Curva de XP: `xpTotal(L)=50/3·(L³−6L²+17L−12)`; custo de 1 nível ≈ `50·L²`. XP/h de hunt ≈ `15,3M·(h/150)^1,25`.
- Drops por abate = `mult/10.000` Boss Token e `mult/250.000` para cada Fragmento (Chave, Shiny Stone, Bicicleta) e Osso do Sacrifício. Preços (melhor oferta, gemas): Token 6, Chave 163, Bicicleta 129, Frag. Shiny Stone 83. Osso: sem preço (não negociado).
- Ouro→Gema ≈ 6,3M coins/gema. Hunts rendem 0,8–2,1M gold/h ⇒ ~0,1–0,3 gema/h (irrelevante).
- Shiny: 1/24.000 por arremesso, mas precisa **fechar a bola**: 1 captura de Shiny a cada **2,04M abates (Ultra)**, 1,02M (Beast, diamante). Outland não tem Shiny.
- Mercado de Pokémon em gema (1.260 vendas em ~14h): Shiny mediana **3.500**, média 6.158 (p10 400, p90 16.000), ~9 shinies vendidos/h no servidor. Preço depende de Nota: N 4–5 ≈ 400; 5–6 ≈ 1.700; 6+ ≈ 9.000. Não-shiny com N 3,5–4 vende a mediana ~16 gemas (piso); P5 mediana 200.
- Bosses: custam 1 Bronze Token (~6 gemas); drops/luta por região (Z-Move 196, AoE 448, Mega 120, M.Shiny 515 gemas) valem ≈3,4 (Kanto) · 6,5 (Johto) · 10 (Hoenn) · 13 (Sinnoh) · 17 (Unova) gemas ⇒ só compensam do Hoenn (T3.100) em diante, e o boss bate forte.
- Diamante: R$ 0,44 (R$ 0,22 na Black Friday). Pacote Shiny Hunter 30d = 2.000 💎 (R$ 440–880) ≈ 4× na chance de shiny ⇒ ~1,4 shiny/mês ≈ US$ 70: **não paga**. Loot Boost 30d = 1.290 💎: só compensa em tiers ≥ 30.
- Saque mín. 1.000 gemas (US$ 9) = US$ 0,009/gema; compra US$ 0,01 (spread 10%). Comissão 15% item / 13–7,5% Pokémon.

## Gemas/h (24/7, grátis, 888 abates/h, shiny líquido 3.000)
| Treinador | Outland (tier) | Hunt normal + Ultra (shiny+gold) |
|---|---|---|
| 750 | 1,8 (×1,15) | 1,6 |
| 1.500 | 2,4 (×1,5) | 1,8 |
| 3.000 | 3,7 (×2,3) | 2,0 |
| 5.000 | 4,8 (×3) | 2,2 |
| 10.000 | 6,3 (×4) | 2,7 |
| 40.000 | 15,9 (×10) | 4,6 |
| 65.000 | 31,7 (×20) | 5,7 |

## Resultado do modelo (sobe em hunt normal até T*, depois Outland para sempre)
Ponto de partida T860, melhor T*: 30 d → ~1.500 · 90 d → ~2.500 · 180 d → ~3.000 · 365 d → **~4.000–5.000** · 730 d → ~7.000. O ótimo é **achatado** (±1 tier muda <5%), e subir é quase de graça porque a hunt normal com Ultra já rende ~80–90% da Outland nos tiers baixos e dá 5–60× mais XP. Ganho absoluto: ~US$ 0,5–0,9/dia por conta em 24/7.

## Correção: Shiny capturado tem nível baixo (≤100)
Só vendas de Shiny Nv ≤100 (58 amostras): mediana **1.500**, média 4.684 (cauda por N≥6: mediana 6.000). Por Nota: N<5 ≈ 300 · N 5–6 ≈ 1.400 · N≥6 ≈ 6.000. Com EV líquido 1.350 a hunt normal rende só 0,9–1,5 gema/h; T* ótimo: 90 d → T2.000 · 1 ano → T4.000 · 2 anos → T5.000 (quase igual ao cenário otimista: o ganho vem do XP 5–60× maior, não do Shiny).

## Ressalvas (não validado)
- O modelo assume que a conta aguenta a hunt de nível ≈ 0,81×treinador (hoje T860 usa Nv 500–700) e kph constante 888; se o combate limitar, o XP/h real é menor e o T* ótimo sobe pouco.
- Preços usam melhor oferta, não preço realizado; fragmentos podem cair com mais oferta. Valor do Shiny usa mediana líquida 3.000 (amostra de 14h).
- Tabela de Nota/Nível x preço vem de vendas listadas (viés para itens bons).
- Utilidade do Osso do Sacrifício e retorno real de bosses não medidos.
