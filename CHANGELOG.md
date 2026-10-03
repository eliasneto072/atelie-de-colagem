# Histórico de versões

Todas as mudanças relevantes ficam registradas aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

## [0.4.0] - 2026-10-03

Texto na fonte do documento, guias para a busca e nova licença.

### Adicionado

- Em "Editar e assinar", o texto novo reconhece a fonte do documento: clicando na linha de um
  texto, ele sai com a mesma fonte, tamanho, negrito e cor, alinhado na mesma linha. O painel diz
  qual é a fonte do documento e qual a mais parecida quando ela não está disponível.
- Fontes para escrever: Arial, Times New Roman, Courier e Calibri (pela Carlito, que tem as mesmas
  medidas), com negrito e itálico, e qualquer cor.

- Guias para quem chega pela busca: assinar PDF, esconder CPF em PDF, foto para PDF e juntar
  PDF, com passo a passo, imagem da ferramenta, perguntas frequentes e um botão que já abre a
  tarefa certa. Links para eles na página de PDF e na janela Sobre.
- Links que abrem uma ferramenta de "Editar e assinar": `/pdf/#editar/tarja`,
  `/pdf/#editar/assinar` e os demais nomes da barra.
- Contagem de visitas com o Cloudflare Web Analytics: agregada, sem cookies e só no domínio
  oficial. A página de privacidade explica o que é contado.

### Mudado

- Licença: o código passa da MIT para a Functional Source License 1.1 com licença futura MIT
  (FSL-1.1-MIT), em nome de Elias Neto (Vértice). Pode ser usado e modificado para qualquer fim
  que não seja oferecer um produto ou serviço concorrente, e cada versão vira MIT depois de 2 anos.
  As versões anteriores continuam MIT.
- O site deixa de mostrar links de código aberto; os termos de uso explicam a quem pertencem o
  site, o código e a marca.

### Corrigido

- Com a ferramenta Assinar escolhida e nenhuma assinatura criada, clicar em zoom ou em Desfazer
  abria de novo a janela da assinatura.
- Um clique rápido na página logo depois de "Usar assinatura" podia abrir a janela de novo ou pôr
  outro item no lugar da assinatura.

## [0.3.0] - 2026-10-02

"Editar e assinar" nas ferramentas de PDF.

### Adicionado

- Escrever texto em qualquer lugar da página, com tamanho, negrito e cor, em várias linhas.
- Marcar caixinhas com ✓, X ou ponto.
- Assinatura desenhada com o dedo ou o mouse (tinta preta ou azul) ou a partir da foto de uma
  assinatura no papel, que fica com fundo transparente. Rubricar todas as páginas de uma vez.
  Aviso de que a assinatura desenhada não substitui a assinatura digital, com link para o
  assinador do gov.br.
- Tarja que apaga de verdade: a página com tarja vira imagem no arquivo final, sem o texto de
  baixo.
- Cobrir um trecho para escrever por cima, e marca-texto.
- Marca d'água em todas as páginas, com texto, cor e intensidade à escolha.
- Numeração de páginas: três formatos, três posições, número inicial e opção de pular a capa.
- Mover, aumentar, repetir em todas as páginas, excluir e desfazer; setas para ajuste fino;
  zoom.
- No celular: tocar para pôr, arrastar para mover e para desenhar caixas.
- As edições vão junto ao juntar, separar e gerar imagens.

## [0.2.0] - 2026-10-02

Ferramentas de PDF, em `/pdf/`.

### Adicionado

- Juntar PDFs e fotos, com a lista de arquivos para mudar a ordem de um arquivo inteiro.
- Organizar páginas: arrastar para reordenar (no celular, segurar e arrastar), girar, tirar,
  mover as selecionadas e desfazer.
- Separar: páginas escolhidas (clicando ou digitando `1-3, 5`), uma página por arquivo ou partes
  por intervalo, em ZIP quando há mais de um arquivo.
- Fotos para PDF em A4, Carta ou no tamanho da foto, com margem e qualidade à escolha; fotos de
  lado ficam em pé; botão para tirar foto no celular.
- PDF para imagens em JPG ou PNG, 150 ou 300 dpi.
- Abrir PDF com senha (a senha só é usada no aparelho) e baixar sem senha.
- As ferramentas de PDF funcionam sem internet depois da primeira visita.
- Botão "Imagens | PDF" no topo do editor e link na janela Sobre.

## [0.1.0] - 2026-10-01

Primeira versão pública.

### Adicionado

- Seleções: retangular, elíptica, laço livre, laço poligonal e varinha mágica, com modos
  nova/adicionar/subtrair, suavização de borda, inverter, tudo e desmarcar.
- Recortar e copiar para nova camada, colar da área de transferência, manter só a seleção e
  cortar a tela na seleção.
- Remover objeto e "Remover e refazer o fundo": preenchimento pelo conteúdo em volta
  (PatchMatch em várias escalas), rodando fora da página para não travar.
- Tapar automaticamente o buraco deixado ao recortar.
- Pincel macio e pixel, balde de tinta, borracha, restaurar, pintar a seleção e conta-gotas com
  lupa no celular.
- Cor da camada (recolorir letras e logos) e "Tirar essa cor" para remover fundos lisos.
- Mover, girar, redimensionar, espelhar e esticar só na horizontal ou na vertical, com campos
  numéricos.
- Guias inteligentes e botões de alinhar com a tela ou com outra camada.
- Camadas com opacidade, mesclagem e ajustes de brilho, contraste, saturação, matiz e desfoque.
- Desfazer e refazer, exportar PNG ou JPG em 0,5×, 1× e 2×.
- Modo celular com painel em gaveta, pinça para zoom e toque com dois dedos para desfazer.
- Funciona sem internet depois da primeira visita e pode ser instalado como aplicativo.
- Páginas de privacidade e termos de uso.

[Não lançado]: https://github.com/eliasneto072/atelie-de-colagem/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/eliasneto072/atelie-de-colagem/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/eliasneto072/atelie-de-colagem/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/eliasneto072/atelie-de-colagem/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/eliasneto072/atelie-de-colagem/releases/tag/v0.1.0
