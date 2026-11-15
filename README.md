# PokeIdle Helper

Extensão do Chrome que ajuda a jogar o [pokeidle.io](https://pokeidle.io/app) de forma idle. Ela lê a página e clica nos botões do próprio jogo, como um jogador faria. Não usa visão computacional, não faz chamadas diretas à API e funciona com a janela minimizada ou em outra aba.

## Instalação

1. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
2. Clique em **Carregar sem compactação** e escolha esta pasta.
3. Abra ou recarregue `https://pokeidle.io/app`. Um painel aparece no canto da tela.

Depois de editar o código, clique em **Recarregar** na extensão e recarregue a aba do jogo.

## Modos

| # | Modo | O que faz |
|---|------|-----------|
| 1 | Captura | Clica nos Pokémon de "Proximidade para Capturar" e para quando detectar uma captura. Mantém a Ultra Ball selecionada. |
| 2 | Repor bolas/poções | Quando a Ultra Ball chega a 10 ou menos, compra 100 no Market. Repõe as poções em uso quando chegam a 10 ou menos, também 100 por vez. Confere o ouro antes de comprar. |
| 3 | Captura eterna | Igual à captura, mas nunca para. |
| 4 | Gerenciador de hunt | Escolhe a hunt com mais xp/h para o Pokémon em campo e troca quando compensa. |

### Gerenciador de hunt

- Lê o **Hunt Analyser** do próprio jogo (hover nos marcadores do Mapa) para obter xp/h e ouro/h de todas as hunts liberadas, em todas as regiões abertas.
- O Analyser ignora o tipo, então o bot aplica a vantagem de tipo por conta própria (`types.js`). Usa os tipos do Pokémon em campo contra os da hunt, nos dois sentidos, com a amplificação da hunt descrita na Wiki: ×2 vira ×2,5, ×4 vira ×5,5, ×0,5 vira ×0,33 e ×0,25 vira ×0,17.
- Hunts desfavoráveis têm o xp/h descontado, e as muito ruins (`minRatio`) são descartadas.
- Só troca se a melhor render mais de 10% acima da atual (`huntGain`). Reavalia a cada 10 minutos (`huntEvalMs`).
- Se o jogo responder "Em combate — espere Xs", espera esse tempo e tenta de novo, até 8 vezes. Não usa "Desistir do Combate".

## Painel

- **Arrastar:** pelo cabeçalho. A posição fica salva.
- **Minimizar:** botão `—` ou duplo clique no título. O painel começa minimizado e mostra os modos ativos.
- **Esconder:** botão `×`, ou **Alt+P** para esconder e mostrar. Os modos continuam rodando escondido.

## Configuração

### Compras (no painel)

Expanda o painel para ver a seção de compras. Os valores são salvos no navegador e valem para o modo 2:

| Campo | Padrão | Descrição |
|-------|--------|-----------|
| Bola: item | `Ultra Ball` | Pokébola reposta. É também a bola usada nos arremessos. |
| Bola: mín. | 10 | Repõe quando tiver este tanto ou menos |
| Bola: comprar | 100 | Quantidade por refill |
| Poção: item | `auto (em uso)` | `auto` repõe as poções que você está usando. Ou escolha um tipo fixo. |
| Poção: mín. | 10 | Repõe quando tiver este tanto ou menos |
| Poção: comprar | 100 | Quantidade por refill |

Se o Market não vender o item escolhido ou o ouro não bastar, o bot registra isso no log e não compra.

### Outros ajustes (`CFG` no começo de `content.js`)

| Chave | Padrão | Descrição |
|-------|--------|-----------|
| `throwGapMs` | 1400 | Intervalo mínimo entre arremessos |
| `buyCooldownMs` | 60000 | Intervalo mínimo entre compras do mesmo item |
| `huntEvalMs` | 600000 | Intervalo entre avaliações de hunt |
| `huntGain` | 1.10 | Ganho mínimo para trocar de hunt |
| `minRatio` | 0.5 | Vantagem de tipo mínima aceita |
| `dry` | `false` | Com `true`, só escreve no log o que faria |

## Regras do jogo

Os [Termos do Pokeidle](https://pokeidle.io/terms) (seção 5, "Automação") permitem automação, desde que ela não explore falhas, não burle limites do jogo e não sobrecarregue o servidor. Por isso a extensão só faz cliques de interface, com intervalos conservadores. Releia os Termos antes de usar, porque eles podem mudar.

## Limitações conhecidas

- A detecção de captura usa uma expressão regular (`captureRe`) sobre os avisos do jogo e ainda não foi confirmada com uma captura real. Se o modo 1 não parar sozinho, ajuste essa expressão.
- A comparação de tipos considera só o Pokémon em campo. Se o jogo usar o time inteiro, a conta muda.
- O Analyser não considera desmaios. Uma hunt forte demais pode gastar poções.
- Em aba oculta, o navegador pode limitar a atualização da página.
- O bot abre brevemente o Mapa e o Market quando precisa, e essas telas aparecem se você estiver olhando o jogo.

## Arquivos

- `manifest.json`: manifesto da extensão (MV3).
- `types.js`: tabela de tipos e cálculo de vantagem.
- `content.js`: lógica dos modos e painel.
