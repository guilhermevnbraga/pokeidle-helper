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

## Modos de tela do jogo (menos CPU)

O jogo tem três modos em Configurações → Desempenho. **A extensão nunca escolhe nem muda o modo**: ela funciona em qualquer um, e você liga ou desliga o que quiser pelo próprio jogo.

| Modo | O que o jogo faz | Na extensão |
|------|------------------|-------------|
| normal | Cena completa | Tudo funciona |
| Economia | Desliga a cena (mapa e animações), mantém menus e painéis | Tudo funciona (Market e Mapa abrem normalmente) |
| ULTRA Economia | Esconde o jogo todo e mostra só uma caixa de texto com XP e ouro, atualizada a cada 10 s | O Market e o Mapa **não abrem** nesse modo. Para comprar ou trocar de hunt, o bot sai do ULTRA por instantes, faz a ação e liga o ULTRA de novo, deixando tudo como estava. O painel da extensão continua visível. |

O modo é uma configuração do navegador, não da conta.

Ainda não foi verificado se o arremesso de bolas funciona durante o ULTRA com um Pokémon real no chão.

## Segundo plano

O Chrome limita os timers de abas ocultas (cerca de 1 por minuto) e pode até congelá-las. Para o bot não parar de repor poções, há três camadas:

- **Alarme de reserva:** o service worker (`background.js`) acorda a cada 30 s e manda a aba do jogo rodar a rotina.
- **Keep-alive:** um Web Lock eterno e um áudio inaudível (checkbox "Manter ativo em 2º plano", ligado por padrão). O áudio só liga depois de um clique na página, então clique uma vez no jogo depois de recarregar.
- **Vigia:** se o relógio ficar parado por mais de 8 s, o log registra "relógio ficou parado" e o estoque é checado na hora.

Dicas:
- Em `chrome://settings/performance`, desligue o **Economizador de memória** ou adicione `pokeidle.io` aos sites que ficam sempre ativos, senão o Chrome pode descartar a aba.
- Use um mínimo de poção maior que 10 (por exemplo 30 a 50). Assim sobra margem se o relógio atrasar.

## Rodar 24/7 num servidor (Proxmox)

Um Chromium numa tela virtual, com a extensão carregada, evita de vez o problema da aba oculta. Esta configuração ainda não foi testada.

1. Crie um CT (LXC) Debian 12 com 2 vCPU, 2 GB de RAM e 8 GB de disco. Em **Options → Features**, ligue **Nesting** e **keyctl**.
2. Instale o Docker no CT e clone este repositório.
3. Em `deploy/`, copie `.env.example` para `.env` e defina `WEB_PASSWORD`.
4. Rode `docker compose up -d` em `deploy/`.
5. Acesse `https://127.0.0.1:3001` pelo túnel (veja abaixo), faça login no jogo uma vez e ligue os modos no painel. O login fica salvo em `deploy/profile/`. A interface exige HTTPS, com certificado autoassinado: aceite o aviso do navegador. Em `http://...:3000` ela mostra "requires a secure connection".

Para acessar pela rede local, defina `BIND_IP=` com o IP do CT no `.env` (o padrão é `127.0.0.1`, só local) e rode `docker compose up -d` de novo. Para atualizar a extensão, rode `git pull` e `docker compose up -d` em `deploy/`.

O contêiner tem teto de 1,5 CPU e 2 GB de RAM. O consumo vem quase todo do jogo desenhando a cena, então, se o servidor esquentar, ligue o modo **ULTRA Economia** do próprio jogo (veja "Modos de tela"). Num teste, o CT foi de cerca de 15% de CPU, 1,2 GiB de RAM e 48% de swap para cerca de 5% de CPU, 770 MiB e 3% de swap.

**Uma sessão por conta:** o jogo só deixa uma sessão jogar por vez. Se você abrir o jogo em outro navegador ou aba, a do servidor pausa e mostra "Account opened elsewhere". Clique em "Play here" para retomar. Jogar de novo no servidor desconecta a outra.

Acesso remoto: a porta só escuta em `127.0.0.1`. Exponha com **Cloudflare Tunnel** protegido por Cloudflare Access, ou por Tailscale. Não abra a porta direto na internet, porque quem entrar controla o navegador com a sua conta logada.

Atenção: o login do jogo tem verificação anti-robô, então ele é feito à mão. Não sei se o jogo aceita a mesma conta em duas sessões ao mesmo tempo. Se uma derrubar a outra, jogue só pelo servidor.

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
- `types.js`: tabela de tipos e cálculo de vantagem.
- `content.js`: lógica dos modos e painel.
