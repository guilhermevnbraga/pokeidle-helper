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
| 4 | Gerenciador de hunt | Simula combate e lucro real das hunts liberadas (4 focos) e troca quando compensa. |

### Gerenciador de hunt (v3 — simulador de combate e economia)

- **Por que não confiar só no Hunt Analyser do jogo:** o Analyser assume sempre uma taxa fixa (~983 abates/h), ignorando nível/defesa/HP do mob, seus golpes reais e o gasto de poções — o que faz hunts lentas de nível alto parecerem melhores do que são.
- **Simulação fiel à Wiki (`hunt.js`):** lê stats atuais, IV de Speed e lista real de golpes do seu Pokémon ativo (`#ativo-card` + ficha), escaneia rapidamente todas as regiões liberadas pelo modo **Lista** do Mapa (incluindo Outland), consulta o Hunt Analyser (com seus boosts ativos) e os stats-base / valor NPC / taxas de captura / pedras da Pokedex (salvos em cache local `pkbot-dex-cache`), e simula 5 min de combate real (rotação de golpes, cooldowns, Investida física no 1º tipo, HP ×5 e dano ×1,8 do selvagem, gasto de poções e pokébolas, retorno NPC das capturas, pedras de evolução, drops raros da Outland e Shiny).
- **4 focos configuráveis no painel (`Equilibrado`, `XP`, `Lucro/Outland`, `Shiny/Caça`):**
  - **Equilibrado (padrão):** combina XP/h real, lucro líquido/h (abate + venda NPC − poções − bolas), ritmo de abates/h, pedras e bônus de drops raros da Outland.
  - **XP:** maximiza XP/h real em hunts sustentáveis (descarta hunts lentas ou que queimam poções).
  - **Lucro/Outland:** maximiza lucro líquido/h + pedras + drops raros da Outland (selecionando automaticamente o maior tier de Outland liberado para o seu nível).
  - **Shiny/Caça:** exclui a Outland (onde Shiny não rola) e prioriza velocidade de abates/capturas com bom lucro e XP.
- **Automático + verificação manual (`Verificar`):** marque **4 Gerenc. hunt** e escolha o foco para avaliação automática (ao ligar, trocar foco, trocar/evoluir ativo, cruzar patamar/Outland, acordar no Centro ou a cada 10 min, com histerese de +10%), ou clique em **`Verificar`** para disparar a checagem manualmente na hora. Toda verificação do Gerenciador de Hunt (automática ou manual) encadeia automaticamente **Hunt → Radar RMT → Analisador de Pokébola** na mesma janela (com saída/retorno único do modo ULTRA). Um resumo discreto abaixo do checkbox mostra a hunt escolhida (`XP/h`, `Lucro líq/h`, `abates/h`, `poções/h`) e as alternativas.
- **Troca segura:** nunca troca para o mapa atual; aguarda a brecha de 3 s fora de combate (`#ir-centro` / `#eco-ir-centro`), cura no Centro Pokémon e só então entra na nova hunt. Nunca usa "Desistir do Combate".

### Analisador Otimizado de Pokébola

- Botão **`Analisar`** no painel (sob demanda ou disparado automaticamente ao final de cada verificação do Gerenciador de Hunt): lê a hunt atual no **Mapa / Hunt Analyser** (`ouro/h`, `xp/h`, nível e espécies) e a ficha da(s) espécie(s) na **Pokedex** (preço base do NPC, nível ao capturar, stats-base, chance de Shiny e tabela oficial de taxa/preço de cada Pokébola).
- Reaproveita automaticamente os pisos de Pokémon e a cotação Coins/Gema do **Radar RMT** (Sacrifício `N ≥ 3,5`, `P5` e `Shiny` já descontando comissões progressivas e pensão de `100k/dia`) e detecta boosts ativos no HUD (**Boost de Captura ×2** e **Shiny Secret Lure ×2**).
- Calcula o valor esperado por captura (`EV/captura = NPC + RMT N≥3,5 + P5 + Shiny`) usando a distribuição oficial de qualidade, potência (`P1..P5`) e nota (`ball.js`), e compara todas as bolas (incluindo *Nenhuma* e *Beast Ball* informativa) em 3 focos:
  - **Equilibrado** (padrão — Dinheiro + Raro/Shiny): escolhe a bola de maior taxa de captura que ainda dá lucro líquido na captura (ou, quando o EV é baixo, limita o investimento a uma fração segura do ouro dos abates).
  - **Dinheiro:** maximiza o lucro líquido total/hora (incluindo *Nenhuma* se capturar der prejuízo).
  - **Raro/Shiny:** maximiza a taxa de captura (e chances de Forte/P5/Shiny) mantendo a hunt sustentável.
- **Aplicação automática na reposição:** toda vez que o analisador roda (ou ao clicar em **`Usar`**), atualiza automaticamente a Pokébola da reposição (`CFG.ball`) com **mínimo `10`** e **reposição `100`**, sobrescrevendo os valores anteriores.

### Radar RMT (Ouro → Gema)

- Funciona **100% sob demanda ou passivamente** (não varre em segundo plano, não compra nem anuncia nada e não sai do modo ULTRA sozinho).
- **Passivo:** ao abrir `RMT → Itens`, lê os preços da lista na hora e calcula o plano de ação apenas para itens com liquidez real comprovada (ignora Pedras/Stones, que não têm demanda orgânica em Gemas).
- **Botão `Escanear`:** percorre suavemente os books livres dos **8 itens fungíveis líquidos** (Fragmentos de Bicicleta, Chave, Shiny, Z-Move, MEGA, MEGA Shiny, AoE TM Piece e Bronze Boss Token — sem Pokémon, pois ativos únicos dependem de espécie, IV, meta e liquidez), descarta anúncios `Retido` e preços trolls, aplica a comissão oficial (`15%` com arredondamento para cima) e entrega **instruções prontas sem precisar analisar o mercado**:
  - **Veredito automático:** diz se compensa **COMPRAR AGORA** com o seu ouro atual ou **JUNTAR OURO** para a próxima meta eficiente (mostrando quantos % a mais de Gemas/Ouro ela rende e quanto falta juntar, sempre com a **META ÓTIMA** em destaque antes da **1ª ENTRADA**).
  - **Passo a passo (`ONDE` / `COMPRAR` / `VENDER`):** indica quantas unidades comprar no book real, por quantas Gemas anunciar e quanto você recebe líquido.
  - **Alternativa imediata:** quando compensa juntar, ainda mostra a melhor jogada real com o ouro que você tem hoje (evitando armadilhas como taxa de 25% em lotes pequenos) + ranking completo dobrável dos 8 itens.

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

## Modos de tela do jogo (menos CPU)

O jogo tem três modos em Configurações → Desempenho. **A extensão nunca escolhe nem muda o modo**: ela funciona em qualquer um, e você liga ou desliga o que quiser pelo próprio jogo.

| Modo | O que o jogo faz | Na extensão |
|------|------------------|-------------|
| normal | Cena completa | Tudo funciona |
| Economia | Desliga a cena (mapa e animações), mantém menus e painéis | Tudo funciona (Market e Mapa abrem normalmente) |
| ULTRA Economia | Esconde o jogo todo e mostra só uma caixa de texto com XP e ouro, atualizada a cada 10 s | O Market e o Mapa **não abrem** nesse modo. Para comprar ou trocar de hunt, o bot sai do ULTRA por instantes, faz a ação e liga o ULTRA de novo, deixando tudo como estava. O painel da extensão continua visível. |

O modo é uma configuração do navegador, não da conta.

### O que continua disponível no ULTRA

Medido com o jogo em ULTRA durante 20 s:

- O **HUD congela**: o ouro e (provavelmente) os contadores de bola e poção param de atualizar. Só a caixa do ULTRA atualiza, a cada 10 s, com XP, ouro, shinies e drops raros.
- O **log de combate continua atualizando**: aparecem "derrotado!", "poção usada" e "escapou e sumiu".
- A **lista de captura não recebe Pokémon novos**, e a cena para por completo (0 ms/s de JS).

Por isso, com o modo 2 ligado e o jogo em ULTRA, o bot sai do ULTRA a cada 3 minutos (`ultraCheckMs`), ou antes se o log mostrar 15 poções usadas, espera o HUD atualizar, repõe o que faltar e volta ao ULTRA. No servidor isso levou cerca de 6 s. A volta ao ULTRA foi confirmada; uma compra durante esse ciclo ainda não aconteceu, porque o estoque estava acima do mínimo.

A captura **não funciona em Economia nem em ULTRA**, e o painel avisa. Sair do ULTRA a cada abate (um a cada ~6 s) anularia a economia, então os modos 1 e 3 só valem em modo normal.

## Consumo de CPU no servidor

Medido no CT (2 vCPU) com o jogo em modo normal e capturando:

| Situação | CPU do CT |
|----------|-----------|
| Tela remota **fechada** | cerca de 15% (a thread principal do jogo gasta uns 14% de um core) |
| Tela remota **aberta** | cerca de 95% de um core: codificador de vídeo da tela remota (~21%), renderizador (~37%) e compositor (~17%) |
| ULTRA Economia (sem capturar) | cerca de 5% |

O que mais pesa é **deixar a tela remota aberta**. Feche a aba do Selkies quando não estiver mexendo.

O seletor **FPS** do painel limita **apenas** o desenho do mapa (`Campo.loop` em `campo.mjs`, que não afeta combate, XP/h, ouro nem a lista de captura `#caidos-lista`). Toda a interface do jogo (Market, Mapa, RMT, Coleção, filtros e cliques) continua em **60 FPS nativos** mesmo com o mapa em **`0.2` (quase parado · captura ON)** — padrão automático no deploy Docker via `deploy/server-flag.js`. Com a aba oculta/minimizada, o desenho do mapa pausa completamente (0% CPU de canvas) enquanto o Worker de timers mantém a captura ativa. O checkbox **Modo servidor (sem animações)** desliga animações CSS infinitas, transições e sombras. Se quiser ver o mapa liso ao jogar na mão, escolha `10`, `60` ou "sem limite".

Sobre GPU passthrough (`/dev/dri`): deixado **desativado** de propósito no deploy multi-conta porque, com a tela remota fechada e 1–2 FPS, manter a iGPU acordada pode impedir C-states profundos da CPU além de exigir mapeamento extra de GID no LXC. Só vale avaliar se você costuma deixar a tela remota aberta por longos períodos.

## Segundo plano

O Chrome limita os timers de abas ocultas (cerca de 1 por minuto) e pode até congelá-las. Para o bot não parar de repor poções, há três camadas:

- **Alarme de reserva:** o service worker (`background.js`) acorda a cada 30 s e manda a aba do jogo rodar a rotina.
- **Keep-alive:** um Web Lock eterno e um áudio inaudível (checkbox "Manter ativo em 2º plano", **desligado por padrão**). Ligue só se deixar o jogo numa aba oculta no PC: o áudio custa um pouco de CPU (o `pulseaudio` aparece no `top`) e não faz falta no servidor, onde a janela é sempre visível. O áudio só liga depois de um clique na página.
- **Timers do jogo:** `fps.js` troca `setTimeout`/`setInterval` da página por versões com um segundo despertador num Worker, que o Chrome não limita; em aba oculta/minimizada os timers do jogo (que alimentam a lista de captura) continuam a cada ~50 ms em vez de ~1/min.
- **Vigia:** se o relógio ficar parado por mais de 8 s, o log registra "relógio ficou parado" e o estoque é checado na hora.

Dicas:
- Em `chrome://settings/performance`, desligue o **Economizador de memória** ou adicione `pokeidle.io` aos sites que ficam sempre ativos, senão o Chrome pode descartar a aba.
- Use um mínimo de poção maior que 10 (por exemplo 30 a 50). Assim sobra margem se o relógio atrasar.

## Rodar no servidor (Proxmox — até 4 contas em 1 container)

Um **único** container Docker (`deploy/Dockerfile`, baseado em `lscr.io/linuxserver/chromium`) abre **1 única instância do Chromium com até 4 perfis** (`Default`, `Conta2`, `Conta3`, `Conta4`), **cada um em tela cheia** (sem cortes na interface do jogo nem da extensão), com uma barra inferior (`tint2`) para alternar entre as contas com 1 clique. As janelas são minimizadas automaticamente após o boot (zerando GPU/compositor enquanto roda em segundo plano; os timers continuam ativos via `fps.js`/`content.js`).

1. Crie um CT (LXC) Debian/Ubuntu com 2 vCPU, 3 GB (recomendado 4 GB para 4 contas sem swap) de RAM e 16 GB de disco. Em **Options → Features**, ligue **Nesting** e **keyctl**.
2. Instale o Docker no CT e clone este repositório.
3. Em `deploy/`, copie `.env.example` para `.env`, defina `WEB_PASSWORD` e, se quiser acessar pela LAN, `BIND_IP=<IP do CT>`.
4. Garanta `mkdir -p deploy/profile/.config/openbox && chown 1000:1000 deploy/profile/.config/openbox` e rode `docker compose up -d --build` em `deploy/`.
5. Acesse `https://<IP>:3001` (certificado autoassinado), clique em cada conta na barra inferior para abrir em tela cheia, faça o login manual (anti-robô) e ajuste o painel (**Modo servidor** ligado + **FPS = 1 ou 2** se for capturar, ou **ULTRA Economia** do jogo se não for capturar). Ao terminar, clique novamente na conta ativa na barra inferior para minimizar e **feche a aba remota**.

**Uso sob demanda no Proxmox:** deixe o CT desligado quando não precisar; ao clicar **Start** no Proxmox, o Docker sobe automaticamente as 4 contas já logadas nas configurações da última sessão (salvas em `deploy/profile/`) e minimiza todas após carregar. Ao parar de usar, dê **Shutdown** (gracioso) no CT.

Para atualizar a extensão no servidor: `git pull` e `docker compose up -d --build` em `deploy/`. O limite de CPU vem do próprio CT no Proxmox (evitando engasgos de CFS quota do Docker ao digitar na tela remota).

**Uma sessão por conta:** o jogo só deixa uma sessão jogar por vez. Se você abrir o jogo em outro navegador ou aba, a do servidor pausa e mostra "Account opened elsewhere". Clique em "Play here" para retomar. Jogar de novo no servidor desconecta a outra.

Acesso remoto: por padrão a porta só escuta em `127.0.0.1`. Exponha fora de casa apenas por **Cloudflare Tunnel** (com Cloudflare Access) ou **Tailscale** — nunca abra a porta direto na internet.

## Regras do jogo

Os [Termos do Pokeidle](https://pokeidle.io/terms) (seção 5, "Automação") permitem automação, desde que ela não explore falhas, não burle limites do jogo e não sobrecarregue o servidor. Por isso a extensão só faz cliques de interface, com intervalos conservadores. Releia os Termos antes de usar, porque eles podem mudar.

## Limitações conhecidas

- O bot encontra os elementos do jogo por atributos e classes (`data-modal`, `.mk-acao` etc.), então funciona com o jogo em português ou inglês. As mensagens de combate e captura ainda são reconhecidas por texto, em português e inglês.
- A lista "Proximidade para Capturar" às vezes mantém um Pokémon que já sumiu do chão. O bot ignora esse alvo por 60 s quando um clique não gasta bola.
- A detecção de captura usa uma expressão regular (`captureRe`) sobre os avisos do jogo e ainda não foi confirmada com uma captura real. Se o modo 1 não parar sozinho, ajuste essa expressão.
- A comparação de tipos considera só o Pokémon em campo. Se o jogo usar o time inteiro, a conta muda.
- O Analyser não considera desmaios. Uma hunt forte demais pode gastar poções.
- Em aba oculta, o navegador pode limitar a atualização da página.
- O bot abre brevemente o Mapa e o Market quando precisa, e essas telas aparecem se você estiver olhando o jogo.

## Arquivos

- `manifest.json`: manifesto da extensão (MV3).
- `fps.js`: limitador de FPS e espelhamento de timers em Worker (`world: MAIN`).
- `types.js`: tabela de tipos e cálculo de vantagem.
- `hunt.js`: lógica pura do gerenciador de hunt.
- `rmt.js`: lógica pura do Radar RMT (Ouro → Gema).
- `ball.js`: lógica pura do Analisador Otimizado de Pokébola.
- `content.js`: interface do painel e interação com o DOM.
- `background.js`: service worker (alarme de 30 s e `autoDiscardable: false`).
