# Arquitetura

Como o Ateliê de Colagem funciona por dentro. Leia antes de mexer em algo grande.

## Visão geral

É um aplicativo de uma página, sem servidor e sem framework de interface: TypeScript estrito,
Canvas 2D e um Web Worker. O [Vite](https://vite.dev) junta tudo em arquivos estáticos que
qualquer hospedagem serve.

```
index.html ── src/main.ts ──┬─ editor/   estado, camadas, histórico, ferramentas, desenho
                            ├─ ui/       painéis, janelas, avisos
                            ├─ core/     funções puras (testadas)
                            └─ pwa.ts    registra o service worker
                                  │
          editor/heal.ts ── workers/inpaint.worker.ts ── core/inpaint.ts
```

## Pastas e responsabilidades

| Pasta / arquivo           | O que tem                                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/`               | Matemática pura, sem DOM: cores, máscaras, guias de encaixe, geometria e o preenchimento do fundo. Roda igual no navegador, no worker e nos testes. |
| `src/editor/state.ts`     | O estado compartilhado (veja abaixo).                                                                                                               |
| `src/editor/layer.ts`     | Modelo de camada, transformações e como cada camada é desenhada.                                                                                    |
| `src/editor/history.ts`   | Desfazer e refazer.                                                                                                                                 |
| `src/editor/view.ts`      | Canvases da tela, zoom, rolagem e conversão tela ↔ documento.                                                                                       |
| `src/editor/render.ts`    | Desenha a imagem composta (`#scene`) e o que fica por cima (`#overlay`).                                                                            |
| `src/editor/pointer.ts`   | Mouse, caneta e toque: o que cada gesto faz em cada ferramenta.                                                                                     |
| `src/editor/tools.ts`     | Barra de ferramentas e opções de cada uma.                                                                                                          |
| `src/editor/selection.ts` | Construir seleções, testá-las e recortar pixels com elas.                                                                                           |
| `src/editor/heal.ts`      | Remover objeto, refazer o fundo e tapar buracos.                                                                                                    |
| `src/editor/*`            | Pincéis, baldes, conta-gotas, alinhamento, área de transferência, arquivos.                                                                         |
| `src/ui/`                 | Painel de camadas e de seleção, janelas (tela, exportar, sobre), avisos e a gaveta do celular.                                                      |
| `src/workers/`            | O worker que roda o preenchimento sem travar a página.                                                                                              |
| `public/sw.js`            | Service worker do modo sem internet.                                                                                                                |

## Estado

`src/editor/state.ts` exporta três objetos:

- **`S`**: o documento (tamanho e fundo da tela, camadas, camada ativa, seleção). É o que o
  histórico guarda.
- **`opts`**: preferências do usuário (cor, tamanhos, tolerâncias), lembradas no
  `localStorage`.
- **`rt`**: estado passageiro (o arraste em andamento, rascunhos, flags de redesenho). Nunca é
  salvo.

## Camadas

Cada camada (`Layer` em `types.ts`) tem um `canvas` com os pixels atuais, um `source` com os
originais (para o pincel Restaurar), posição do **centro** em pixels do documento, escala em x e
y, giro, espelhamento, opacidade, mesclagem, ajustes de cor e a "cor da camada". A matriz de
cada camada é montada com `DOMMatrix` (translação, giro, escala, espelho).

Ajustes e recoloração não alteram os pixels: são aplicados na hora de desenhar, e a versão
recolorida fica em cache (`_fc`). A caixa dos pixels visíveis (`_cb`) também fica em cache, porque guias e alinhamento
trabalham com o conteúdo visível, não com o retângulo da camada.

## Desfazer e refazer

Cada passo do histórico guarda uma cópia rasa do documento. Os canvases das camadas são
**compartilhados** entre passos, o que deixa o histórico barato. Isso só é seguro porque nenhuma
edição de pixels altera um canvas existente: `pixelCtx()` sempre devolve uma cópia nova
(_copy-on-write_), e a camada passa a apontar para ela. Quem escrever uma ferramenta nova que
pinta precisa usar `pixelCtx()`; desenhar direto em `layer.canvas` corrompe o histórico.

`commit(rótulo)` fecha um passo; o rótulo aparece na dica do botão desfazer ("Desfazer: Mover").

## Desenho na tela

Há dois canvases empilhados:

- **`#scene`**: a imagem composta, redesenhada só quando `rt.sceneDirty` é marcado.
- **`#overlay`**: seleção (formigas marchando), alças, guias, pincel e lupa, redesenhado quando
  `rt.overlayDirty` é marcado.

Um laço com `requestAnimationFrame` olha essas flags a cada quadro. Código que muda o documento
chama `dirtyAll()`; código que só muda o que está por cima chama `markOverlay()`.

## Seleções

Uma seleção é um contorno (polígonos, das ferramentas de forma e laço) ou uma máscara de pixels
(varinha mágica), mais o modo de combinação. Para recortar, a seleção é rasterizada no espaço da
camada ativa, com a suavização de borda feita por `filter: blur()` do canvas quando o navegador
suporta.

## Remover objeto e refazer o fundo

`core/inpaint.ts` implementa um preenchimento pelo conteúdo:

1. **Pirâmide de imagens:** a imagem é reduzida pela metade até o buraco ter mais ou menos a
   largura de um retalho.
2. **PatchMatch** (Barnes e outros, 2009): para cada pixel do buraco, procura o retalho 7×7 mais
   parecido no resto da imagem, propagando bons palpites entre vizinhos e testando palpites
   aleatórios.
3. **Votação** (Wexler e outros, 2007): cada pixel recebe a média ponderada dos retalhos que o
   cobrem; o ciclo procura-e-vota se repete algumas vezes em cada escala, da menor para a maior.
4. **Rascunhos e reinícios:** na menor escala, várias tentativas aleatórias competem e fica a de
   menor erro; alguns rascunhos completos são comparados antes de refinar o melhor em tamanho
   cheio. Isso evita, por exemplo, tijolos desalinhados.
5. **Correção de baixa frequência:** um preenchimento harmônico (suave) corrige as cores médias,
   para degradês ficarem lisos enquanto a textura mantém o grão.

Os parâmetros ficam em `TUNING`, ajustados com degradês, texturas de ruído e paredes de tijolo.
A função é pura e aceita um gerador aleatório, o que permite testes reproduzíveis.

`editor/heal.ts` recorta só a região em volta do buraco e, se ela for grande, reduz a escala antes
(limites `MAX_HOLE_PX` e `MAX_REGION_SIDE`) e amplia o resultado depois. Pixels transparentes fora
do buraco são marcados como "ruins" para não servirem de material. O trabalho vai para o
**worker** (`workers/inpaint.worker.ts`); se o worker não puder ser criado ou falhar, o mesmo código
roda na página.

## Modo celular

Abaixo de 820 px de largura, o painel lateral vira uma gaveta aberta pelas abas da barra de
baixo. No toque, o primeiro dedo espera cerca de 90 ms antes de começar um traço, para que uma
pinça com dois dedos nunca deixe marca. Toque rápido com dois dedos desfaz. O conta-gotas mostra
uma lupa e pega a cor ao soltar.

## Modo sem internet (PWA)

- `public/manifest.webmanifest` e os ícones em `public/icons/` permitem instalar o editor.
- `public/sw.js` é o service worker. No build, um plugin em `vite.config.ts` escreve nele a lista
  de todos os arquivos gerados e um identificador da versão. Na instalação, ele baixa tudo; ao
  ativar, apaga o cache de versões antigas.
- Páginas usam **rede primeiro** (com internet, sempre a versão mais nova); o resto usa **cache
  primeiro** (os nomes dos arquivos mudam a cada versão, então nunca ficam velhos).
- O service worker só é registrado no build de produção.

Só arquivos do próprio aplicativo passam pelo cache. Imagens abertas pelo usuário são lidas direto
do aparelho para a memória.

## Regra de importação

Os módulos de `editor/` e `ui/` dependem uns dos outros em ciclo (a ferramenta chama o painel,
que chama a ferramenta). Com módulos ES isso funciona, desde que **nenhum código rode na hora da
importação** usando um módulo que talvez ainda não tenha terminado de carregar. Por isso:

- o nível superior de um módulo só pode chamar módulos "folha": `core/*`, `editor/dom`,
  `editor/constants`, `editor/state` e `editor/layer`;
- ligar eventos e montar a interface fica em funções `init*()`, chamadas em ordem pelo
  `src/main.ts`.

## Testes

- **Unitários** (`tests/`, Vitest): tudo de `src/core/`, incluindo o preenchimento com semente
  fixa.
- **Navegador** (`e2e/`, Playwright): rodam no build de produção, num computador e num celular
  simulado. Cobrem abrir, selecionar, mover, esticar, alinhar, remover objeto, exportar e o modo
  sem internet. O teste sem internet derruba um servidor próprio em vez de usar a emulação de
  "offline" do navegador, porque ela também bloqueia o que o service worker responderia do cache.

## Decisões

- **Sem framework de interface:** a maior parte do trabalho é desenho em canvas; um framework
  aumentaria o tamanho sem simplificar o essencial.
- **Fontes servidas pelo próprio site** (pacotes `@fontsource`), para não chamar o Google Fonts
  e não vazar visitas a terceiros.
- **`base: './'` no Vite:** o mesmo build funciona em `/atelie-de-colagem/` no GitHub Pages e na
  raiz do domínio próprio.
