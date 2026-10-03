# Ateliê de Colagem

[![CI](https://github.com/eliasneto072/atelie-de-colagem/actions/workflows/ci.yml/badge.svg)](https://github.com/eliasneto072/atelie-de-colagem/actions/workflows/ci.yml)
[![Licença FSL-1.1-MIT](https://img.shields.io/badge/licen%C3%A7a-FSL--1.1--MIT-f2b13f)](LICENSE)

Editor de imagens e ferramentas de PDF no navegador: recorte, cole e junte imagens, remova
letras e objetos refazendo o fundo, troque cores, e junte, separe, organize, escreva e assine
PDFs. **Grátis, sem cadastro, sem marca d'água do site**, e os arquivos nunca saem do aparelho de
quem usa.

**Abrir o editor:** [ateliedecolagem.com.br](https://ateliedecolagem.com.br) · também em
[eliasneto072.github.io/atelie-de-colagem](https://eliasneto072.github.io/atelie-de-colagem/)

![Ateliê de Colagem](public/og-image.png)

## O que dá para fazer

- **Recortar e colar entre imagens.** Seleção retangular, elíptica, laço livre, laço poligonal
  e varinha mágica, com bordas suavizadas. Recorte de uma imagem e cole em outra, inclusive
  colando direto da área de transferência.
- **Remover objetos e refazer o fundo.** Pinte por cima de uma letra, número ou objeto e o fundo
  é reconstruído com o que existe em volta (céu, parede, grama, papel). Ao recortar algo, o
  buraco pode ser tapado automaticamente.
- **Trocar cores.** Conta-gotas com lupa, pincel (macio ou pixel), balde de tinta, pintar a
  seleção e "Cor da camada" para recolorir letras e logos de uma vez.
- **Tirar fundo de cor lisa** (fundo branco de logo, por exemplo) mantendo as bordas suaves.
- **Mover, girar, redimensionar e esticar** só na horizontal ou só na vertical.
- **Alinhar e centralizar** com a tela ou com outras camadas, com guias inteligentes que
  encaixam enquanto você arrasta.
- **Camadas** com opacidade, mesclagem, brilho, contraste, saturação, matiz e desfoque, sem
  estragar o original.
- **Desfazer e refazer** tudo, exportar em PNG ou JPG em até 2× o tamanho.
- **Funciona no celular** (painel em gaveta, gestos de pinça, dois dedos para desfazer) e
  **sem internet** depois da primeira visita, podendo ser instalado como aplicativo.

### PDF ([ateliedecolagem.com.br/pdf](https://ateliedecolagem.com.br/pdf/))

- **Juntar** PDFs e fotos em um arquivo só.
- **Organizar** páginas: arrastar para mudar a ordem, girar, tirar, desfazer.
- **Separar:** só as páginas escolhidas, uma página por arquivo ou partes por intervalo.
- **Editar e assinar:** escrever na página, marcar caixinhas (✓ ✗ •), assinar (desenhando ou
  pela foto da assinatura) e rubricar todas as páginas, **tarja que apaga de verdade** CPF e
  dados, cobrir, marca-texto, marca d'água de proteção e numeração de páginas.
- **Fotos → PDF** em A4, Carta ou no tamanho da foto; no celular, direto da câmera.
- **PDF → imagens** em JPG ou PNG.
- Abre **PDF com senha** (com a senha do arquivo) e baixa sem senha.

Guias no site: [assinar PDF](https://ateliedecolagem.com.br/assinar-pdf/),
[esconder CPF em PDF](https://ateliedecolagem.com.br/esconder-cpf-pdf/),
[foto para PDF](https://ateliedecolagem.com.br/foto-para-pdf/) e
[juntar PDF](https://ateliedecolagem.com.br/juntar-pdf/).

O passo a passo de cada ferramenta e os atalhos estão no [Guia de uso](docs/GUIA.md).

## Privacidade

Todo o processamento acontece no navegador. Não há servidor que receba imagens ou PDFs, não há contas,
anúncios nem cookies de rastreamento, e as fontes são servidas pelo próprio site. As visitas são
contadas de forma agregada e sem cookies pelo Cloudflare Web Analytics, só no domínio oficial.
Detalhes em [privacidade.html](privacidade.html).

## Rodar no seu computador

Você precisa do [Node.js](https://nodejs.org) 22.12 ou mais novo (o projeto usa a versão 24, a
de suporte longo; veja `.nvmrc`).

```bash
git clone https://github.com/eliasneto072/atelie-de-colagem.git
cd atelie-de-colagem
npm install
npm run dev
```

Abra o endereço que aparecer no terminal (normalmente http://localhost:5173). As alterações no
código aparecem na hora.

No VS Code, abra a pasta e aceite as extensões recomendadas (ESLint e Prettier): o código é
formatado ao salvar.

### Scripts

| Comando            | O que faz                                               |
| ------------------ | ------------------------------------------------------- |
| `npm run dev`      | Servidor de desenvolvimento com recarga automática      |
| `npm run build`    | Confere os tipos e gera a versão de produção em `dist/` |
| `npm run preview`  | Serve a pasta `dist/` para testar a versão de produção  |
| `npm test`         | Testes unitários (Vitest)                               |
| `npm run test:e2e` | Gera o build e roda os testes no navegador (Playwright) |
| `npm run lint`     | ESLint                                                  |
| `npm run format`   | Formata tudo com Prettier                               |
| `npm run check`    | Tipos, lint, formatação e testes unitários, como na CI  |

Antes do primeiro `npm run test:e2e`, instale o navegador de testes com
`npx playwright install chromium`.

## Estrutura

```
src/
  core/        matemática pura, sem DOM e com testes: cores, máscaras, guias, preenchimento, páginas
  editor/      estado, camadas, histórico, ferramentas, seleção, desenho na tela
  ui/          painéis, janelas e avisos
  workers/     preenchimento do fundo rodando fora da página
  pdf/         ferramentas de PDF (página /pdf/)
  styles/      tokens de cor e estilos
  main.ts      ponto de entrada
public/        ícones, manifest, service worker, robots e sitemap
pdf/           página das ferramentas de PDF
*-pdf/         guias (assinar, esconder CPF, foto para PDF, juntar)
tests/         testes unitários
e2e/           testes no navegador (computador e celular) e arquivos de exemplo
docs/          guia, arquitetura, publicação e planos
```

Como as peças se encaixam está em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Publicação

Cada push na branch `main` passa pela CI e é publicado no GitHub Pages. O passo a passo, incluindo
o domínio próprio no Registro.br, está em [docs/DEPLOY.md](docs/DEPLOY.md).

## Contribuir

Ideias, problemas e melhorias são bem-vindos: veja [CONTRIBUTING.md](CONTRIBUTING.md) e o
[código de conduta](CODE_OF_CONDUCT.md). Para falhas de segurança, siga o [SECURITY.md](SECURITY.md).
Os próximos passos planejados estão no [roadmap](docs/ROADMAP.md).

## Licença

O Ateliê de Colagem é de Elias Neto (Vértice). O código está publicado sob a
[Functional Source License 1.1, com licença futura MIT](LICENSE) (FSL-1.1-MIT):

- **Pode:** ler, estudar, usar, modificar e redistribuir o código para qualquer fim que não seja
  concorrer com o Ateliê de Colagem, como uso interno, estudo, pesquisa e contribuições.
- **Não pode:** usar o código para oferecer a outras pessoas um produto ou serviço comercial igual
  ou parecido.
- **Depois de 2 anos:** cada versão passa a valer também sob a licença MIT, sem restrições.

As versões publicadas até 3 de outubro de 2026 (até a 0.3.0 e os guias publicados logo depois)
saíram sob a licença MIT e continuam valendo assim para quem as obteve.

A licença não inclui os nomes "Ateliê de Colagem" e "Vértice" nem as identidades visuais.

---

Feito pela [Vértice](https://eliasneto072.github.io/vertice/).
