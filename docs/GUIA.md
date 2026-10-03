# Guia de uso

Tudo o que o Ateliê de Colagem faz, ferramenta por ferramenta. Nada é enviado para a internet:
as imagens ficam no seu aparelho do começo ao fim.

## Começando

1. Clique em **Abrir imagens** (ou arraste os arquivos para a tela, ou cole com **Ctrl+V**).
   Pode abrir várias de uma vez: cada uma vira uma camada.
2. A primeira imagem define o tamanho da tela. Para mudar, use **Tela** no topo.
3. Selecione, recorte, mova e pinte.
4. Clique em **Exportar** para salvar em PNG (com transparência) ou JPG.

Ao abrir o editor aparece um exemplo pronto (um balão e um pôr do sol) para você experimentar.
**Usar minhas imagens** troca o exemplo pelas suas.

## Ferramentas

| Ferramenta         | Tecla | Para que serve                                                              |
| ------------------ | :---: | --------------------------------------------------------------------------- |
| Mover              |   V   | Mover, girar, redimensionar, esticar e alinhar a camada ativa               |
| Seleção retangular |   M   | Selecionar um retângulo                                                     |
| Seleção elíptica   |   O   | Selecionar um círculo ou elipse                                             |
| Laço livre         |   L   | Desenhar o contorno à mão; ao soltar, ele fecha sozinho                     |
| Laço poligonal     |   P   | Contorno ponto a ponto, bom para formas retas                               |
| Varinha mágica     |   W   | Selecionar a área de cor parecida com a que você clicar                     |
| Pincel             |   B   | Pintar com a cor atual, com ponta macia ou ponta pixel                      |
| Balde de tinta     |   G   | Encher uma área parecida com a cor atual                                    |
| Borracha           |   E   | Apagar pixels da camada ativa                                               |
| Restaurar          |   R   | Pintar de volta o que a borracha ou o "Apagar área" tiraram                 |
| Remover objeto     |   J   | Pintar por cima de uma letra ou objeto para ele sumir e o fundo ser refeito |
| Conta-gotas        |   I   | Pegar uma cor da imagem; ela vira a cor do pincel                           |
| Mão                |   H   | Navegar pela tela                                                           |

### Seleções

- **Nova / Adicionar / Subtrair** decide o que acontece com a seleção que já existe. Com o mouse,
  segure **Shift** para adicionar e **Alt** para subtrair.
- **Suavizar borda** deixa o recorte com a borda macia, bom para colar algo sem parecer
  "recortado com tesoura".
- **Varinha mágica:** a **Tolerância** decide quão parecida a cor precisa ser.
  **Só áreas encostadas** limita à região ligada ao ponto clicado. Dica: para tirar um objeto de
  um fundo liso, selecione o fundo com a varinha e use **Inverter**.
- **Laço poligonal:** clique ponto a ponto. Feche clicando no primeiro ponto, com duplo clique
  ou **Enter**. **Backspace** volta um ponto e **Esc** cancela. No celular aparecem botões para
  isso.

Com uma seleção feita, o painel **Seleção** oferece:

- **Manter só a seleção:** apaga tudo fora dela (ótimo para tirar um objeto do fundo).
- **Remover e refazer o fundo:** apaga o que está selecionado e reconstrói o fundo.
- **Pintar a seleção com a cor atual.**
- **Recortar p/ camada** e **Copiar p/ camada:** levam o pedaço para uma camada nova, pronta
  para mover. Com **Ao recortar, tapar o buraco com o fundo** marcado, o lugar de onde saiu é
  refeito automaticamente.
- **Apagar área**, **Inverter**, **Tudo**, **Desmarcar** e **Cortar a tela na seleção**.

Atalho: com a ferramenta **Mover**, arraste de dentro da seleção para recortar e já mover.
Segurando **Alt**, copia em vez de recortar.

### Mover, redimensionar, esticar e alinhar

- Arraste para mover. Os **cantos** mudam o tamanho mantendo a proporção; as **alças do meio**
  esticam só na horizontal ou só na vertical; a **bolinha** de cima gira.
- **Alt** muda o tamanho a partir do centro. **Shift** solta a proporção nos cantos e trava o eixo
  ao mover. **Ctrl** desliga o encaixe nas guias.
- As **guias inteligentes** aparecem quando a borda ou o centro da camada encostam na borda ou no
  centro da tela ou de outra camada, e ela encaixa ali.
- Em **Alinhar com**, escolha a tela ou outra camada e use os botões para alinhar à esquerda,
  centro, direita, topo, meio, base ou centralizar de vez.
- Os campos X, Y, largura, altura e giro aceitam valores exatos. **Manter proporção** liga e
  desliga a proporção nos campos.
- As **setas** do teclado empurram 1 px (com **Shift**, 10 px).

### Pintar e trocar cores

- **Pincel:** a **ponta macia** tem **Dureza** e **Força**; a **ponta pixel** pinta pixel por pixel,
  com borda dura (dê zoom para ver a grade). **Shift+clique** faz linha reta do último ponto;
  **Alt+clique** pega uma cor; **[** e **]** mudam o tamanho.
- **Pintar só por cima do que já existe** protege as áreas transparentes: ótimo para recolorir
  uma letra sem borrar em volta.
- **Balde de tinta:** respeita a seleção. **Achar a área olhando todas as camadas** usa o que
  aparece na tela, não só a camada ativa. **Cobrir a franja da borda (1 px)** evita aquele
  contorno claro em volta de letras.
- **Conta-gotas:** escolha o tamanho da amostra (ponto, média 3×3 ou 5×5). No celular, segure o
  dedo para ver uma lupa e solte para pegar a cor.

### Remover objetos e refazer o fundo

1. Escolha **Remover objeto** (J).
2. Pinte por cima da letra, número ou objeto, cobrindo tudo com uma pequena sobra.
3. Solte: o objeto some e o fundo é refeito com o que existe em volta.
4. Não gostou? **Tentar outra versão** gera uma alternativa. **Ok** aceita.

Funciona melhor quando o fundo em volta tem cor contínua ou textura (céu, parede, grama, papel,
tecido). Em áreas grandes ou cheias de detalhes, remova em partes menores.

### Camadas

O painel **Camadas** lista tudo o que está na tela. Arraste para reordenar, clique no olho para
esconder e dê dois cliques no nome para renomear. Para a camada ativa:

- **Opacidade** e **Mesclagem** (multiplicar, tela, sobrepor e outras).
- **Cor da camada:** **Cobrir tudo com uma cor** recolore letras e logos de uma vez, mantendo o
  formato. **Tirar essa cor** remove um fundo liso (por exemplo, o branco de um logo) mantendo as
  bordas suaves; **Limpeza** ajusta quanto da cor próxima também sai.
- **Ajustes de cor:** brilho, contraste, saturação, matiz e desfoque, sem estragar o original.
  **Zerar ajustes** volta ao normal.

## Ferramentas de PDF

Em **ateliedecolagem.com.br/pdf** (ou no botão **PDF** ao lado do nome, no topo do editor) ficam
as ferramentas de PDF. Como no editor, nada é enviado: os arquivos são lidos e montados no seu
aparelho.

1. Escolha o que quer fazer na fileira de cima: **Juntar**, **Organizar**, **Editar e
   assinar**, **Separar**, **Fotos → PDF** ou **PDF → imagens**.
2. Abra os arquivos: botão **Adicionar**, arrastando para a página ou colando (Ctrl+V). PDFs e
   fotos podem ser misturados.
3. Cada página aparece como um cartão, na ordem em que vai sair.
4. O botão grande do painel gera o arquivo.

### Mexendo nas páginas

- **Clique** seleciona (Shift+clique pega um intervalo). **Esc** limpa a seleção.
- **Arraste** um cartão para mudar a ordem. No celular, segure a página um instante e então
  arraste; um deslize rápido só rola a tela.
- A barra de cima gira, move para trás ou para frente e tira as páginas selecionadas.
  **Desfazer** (Ctrl+Z) volta o último passo.
- No computador, cada cartão também tem botões para girar e tirar a página.
- Teclado: **R** gira, **Delete** tira, **Ctrl+setas** movem a página, **Ctrl+A** seleciona
  todas.

### Cada tarefa

- **Juntar:** as páginas saem na ordem da grade. A lista de arquivos no painel move um arquivo
  inteiro para cima ou para baixo, ou tira o arquivo.
- **Organizar:** gire, tire e reordene, e baixe o PDF arrumado.
- **Editar e assinar:** escreva, assine e esconda dados (veja abaixo).
- **Separar:** só as páginas escolhidas (clicando ou digitando, como `1-3, 5`), cada página em
  um PDF ou em partes por intervalos (`1-3, 4-10, 11-`). Mais de um arquivo vem num ZIP.
- **Fotos → PDF:** tamanho da página A4, Carta ou igual à foto, com ou sem margem, e qualidade
  normal (arquivo menor) ou alta. Fotos tiradas de lado ficam em pé sozinhas. No celular, o
  botão **Tirar foto** abre a câmera.
- **PDF → imagens:** JPG ou PNG, em 150 ou 300 dpi, de todas as páginas ou só das selecionadas.

### Editar e assinar

Em **Editar e assinar**, as páginas aparecem grandes, uma embaixo da outra, e a barra de cima
troca para as ferramentas de escrever. O que você põe na página aparece exatamente como vai sair
no arquivo.

- **Texto:** clique onde quer escrever e digite. Enter pula linha; clique fora para terminar.
  Dois cliques num texto voltam a editá-lo.
  - **Na fonte do documento:** clicando na mesma linha de um texto do documento (por exemplo, no
    espaço depois de "Nome: ______"), o texto novo sai com a mesma fonte, tamanho, negrito e cor,
    alinhado na linha. Perto de um texto, ele pega só o estilo. O painel mostra qual é a fonte do
    documento e, se ela não for uma das que o Ateliê tem, qual é a mais parecida.
  - **No painel:** fonte (Arial, Times New Roman, Courier ou Calibri), tamanho (A− e A+), negrito,
    itálico e cor (preto, azul, vermelho, a cor do documento ou qualquer outra).
- **Certo, X e Ponto:** clique nas caixinhas do formulário para marcar.
- **Assinar:** na primeira vez, abre a janela da assinatura. Desenhe com o dedo ou o mouse, em
  tinta preta ou azul, ou escolha **Foto** e use a foto de uma assinatura feita no papel (o papel
  fica transparente; funciona melhor com papel branco e caneta escura). Depois, clique na página
  para pôr a assinatura. **Rubricar todas as páginas** repete a assinatura no mesmo lugar em
  todas as outras.
- **Cobrir:** arraste sobre um trecho para cobri-lo de branco (ou cor de papel) e escrever por
  cima. O que está embaixo continua no arquivo.
- **Tarja:** arraste sobre o que precisa sumir (CPF, número de conta, endereço). A tarja **apaga
  de verdade**: no arquivo final, a página com tarja vira uma imagem com a faixa preta, e o texto
  de baixo não pode mais ser copiado nem pesquisado. As outras páginas continuam como eram.
- **Destacar:** marca-texto amarelo sobre um trecho.
- **Mover:** clique num item para selecioná-lo. Arraste para mover, puxe o canto para aumentar ou
  diminuir, use as setas para ajustes finos (Shift: passos maiores) e **Delete** para excluir.
  **Repetir em todas as páginas** copia o item para as outras páginas.
- **Desfazer** (Ctrl+Z) volta o último passo. Os botões **−** e **+** mudam o zoom.

No painel ficam também:

- **Marca d'água em todas as páginas:** um texto na diagonal, como "CÓPIA — uso exclusivo para
  inscrição no concurso", em cinza, vermelho ou azul, leve, média ou forte. Serve para proteger
  cópias de documentos que você envia.
- **Numerar as páginas:** "1", "1 / 9" ou "Página 1 de 9", embaixo no meio, no canto de baixo ou
  no canto de cima, começando no número que quiser e, se preferir, sem número na capa.

Para mandar alguém direto para uma ferramenta, use o endereço com o nome dela:
`ateliedecolagem.com.br/pdf/#editar/assinar`, `#editar/tarja`, `#editar/texto` e assim por
diante. Para as outras tarefas: `#juntar`, `#organizar`, `#separar`, `#fotos` e `#imagens`.

O que você escreveu vai junto em todas as tarefas: ao juntar, separar ou gerar imagens, as
páginas saem com os textos, assinaturas e tarjas.

> **Sobre a validade da assinatura:** a assinatura desenhada é uma imagem na página, como uma
> assinatura escaneada. Ela serve quando quem recebe aceita isso, mas não tem a validade jurídica
> de uma assinatura digital. Para assinar documentos com validade, use o
> [assinador gratuito do gov.br](https://assinador.iti.br).

### PDF com senha

Se o arquivo pedir senha, digite a senha dele. Ela só é usada no seu aparelho para abrir o
arquivo, e o PDF que você baixar sai **sem senha**. Arquivos protegidos apenas contra alteração
abrem direto, sem perguntar.

## Atalhos de teclado

No Mac, use **Cmd** no lugar de **Ctrl**.

| Atalho                   | Ação                                        |
| ------------------------ | ------------------------------------------- |
| Ctrl+Z / Ctrl+Shift+Z    | Desfazer / refazer (Ctrl+Y também refaz)    |
| Ctrl+O                   | Abrir imagens                               |
| Ctrl+S                   | Exportar                                    |
| Ctrl+C / Ctrl+X / Ctrl+V | Copiar / recortar / colar                   |
| Ctrl+J                   | Copiar a seleção para camada (ou duplicar)  |
| Ctrl+Shift+J             | Recortar a seleção para camada              |
| Ctrl+A / Ctrl+D          | Selecionar tudo / desmarcar                 |
| Ctrl+Shift+I             | Inverter a seleção                          |
| Ctrl+E                   | Juntar com a camada de baixo                |
| Delete                   | Apagar a seleção (ou a camada, sem seleção) |
| Alt+Delete               | Pintar a seleção com a cor atual            |
| [ e ]                    | Diminuir / aumentar o pincel                |
| Setas (Shift: 10 px)     | Empurrar a camada com a ferramenta Mover    |
| Espaço + arrastar        | Navegar com qualquer ferramenta             |
| Ctrl+0 / Ctrl+1          | Caber na tela / 100%                        |
| Ctrl++ / Ctrl+-          | Zoom                                        |
| Esc                      | Desmarcar ou cancelar                       |

## No celular

- A barra de baixo tem as ferramentas e três abas que abrem o painel em gaveta: a da ferramenta
  atual (com as opções dela), **Seleção** e **Camadas**.
- **Pinça** com dois dedos dá zoom e move a tela.
- **Toque rápido com dois dedos** desfaz.
- O conta-gotas mostra uma **lupa** enquanto o dedo está na tela.
- Ao apertar uma ação no painel, a gaveta fecha sozinha para você ver o resultado.

## Instalar e usar sem internet

Depois da primeira visita, o editor funciona sem internet. Para ter um ícone na tela inicial:

- **Android (Chrome):** menu ⋮ → **Instalar app** ou **Adicionar à tela inicial**.
- **iPhone (Safari):** botão de compartilhar → **Adicionar à Tela de Início**.
- **Computador (Chrome ou Edge):** ícone de instalar na barra de endereço.

## Exportar

**Exportar** salva PNG (mantém transparência) ou JPG (com fundo branco onde estiver
transparente, e qualidade ajustável), em 0,5×, 1× ou 2× o tamanho da tela. Se o navegador não
baixar o arquivo direto, a imagem aparece na janela: segure ou clique com o botão direito para
salvar.

O trabalho não fica salvo sozinho: exporte antes de fechar a aba.
