# Histórico de versões

Todas as mudanças relevantes ficam registradas aqui. O formato segue o
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e as versões seguem o
[Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [Não lançado]

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

[Não lançado]: https://github.com/eliasneto072/atelie-de-colagem/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/eliasneto072/atelie-de-colagem/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/eliasneto072/atelie-de-colagem/releases/tag/v0.1.0
