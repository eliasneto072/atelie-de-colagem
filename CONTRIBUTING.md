# Como contribuir

Obrigado por querer ajudar o Ateliê de Colagem. Toda contribuição conta: relatar um problema,
sugerir uma ideia, melhorar um texto ou mandar código.

## Relatar um problema ou sugerir uma ideia

Abra uma [issue](https://github.com/eliasneto072/atelie-de-colagem/issues/new/choose) usando um dos
modelos. Para problemas, diga o navegador, o aparelho e os passos para repetir. Se for anexar uma
imagem de exemplo, use uma que possa ficar pública: as issues são visíveis para todo mundo.

## Preparar o ambiente

```bash
git clone https://github.com/eliasneto072/atelie-de-colagem.git
cd atelie-de-colagem
npm install
npm run dev
```

Requisitos: Node.js 22.12 ou mais novo (recomendado 24, veja `.nvmrc`).

## Fluxo de trabalho

1. Crie uma branch a partir da `main`: `git switch -c feat/ferramenta-texto`.
2. Faça mudanças pequenas e focadas. Um pull request por assunto.
3. Rode `npm run check` (tipos, lint, formatação e testes). Se mexeu em algo que o usuário vê,
   rode também `npm run test:e2e`.
4. Abra o pull request preenchendo o modelo. A CI roda as mesmas verificações.

### Mensagens de commit

Seguimos o [Conventional Commits](https://www.conventionalcommits.org/pt-br/v1.0.0/), em português:

```
feat: ferramenta de texto
fix: balde deixava borda clara em volta das letras
docs: atalhos do celular no guia
test: casos da varinha com fundo transparente
chore: atualiza dependências
```

## Princípios do projeto

Estes pontos valem mais que qualquer recurso novo:

- **A imagem não sai do aparelho.** Nada de enviar imagens para servidores, APIs ou serviços de
  terceiros. Recursos que precisariam disso não entram, ou rodam no próprio navegador.
- **Sem rastreamento.** Nada de analytics com cookies, pixels de anúncio ou fontes e scripts
  carregados de outros domínios.
- **Sem cadastro e sem marca d'água.**
- **Funciona no celular.** Toda ferramenta precisa funcionar com o dedo, não só com mouse e
  teclado.
- **Leve.** Sem frameworks de interface. Antes de adicionar uma dependência, pergunte se dá para
  resolver com poucas linhas.

## Organização do código

- `src/core/` só tem funções puras, sem acesso ao DOM. Toda lógica nova que puder morar aqui deve
  morar aqui, com testes em `tests/`.
- `src/editor/` e `src/ui/` têm dependências circulares entre si. Por isso, o código que roda ao
  importar um módulo só pode usar módulos "folha" (`core/*`, `dom`, `constants`, `state`,
  `layer`). Ligações de eventos ficam em funções `init*()` chamadas pelo `src/main.ts`.
- TypeScript estrito. Evite `any`; se precisar, explique por quê num comentário.
- Textos da interface em português do Brasil, curtos e no imperativo ("Abrir imagens",
  "Tirar essa cor").
- Comentários explicam o porquê, não o quê.

Mais detalhes em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Testes

- `npm test` roda os testes unitários (Vitest) de `tests/`.
- `npm run test:e2e` gera o build e roda os testes de navegador (Playwright) de `e2e/`, num
  computador e num celular simulado. Antes da primeira vez: `npx playwright install chromium`.

Mudou o preenchimento do fundo? Os testes de `tests/inpaint.test.ts` usam um gerador aleatório
com semente fixa, então os resultados se repetem e servem de comparação.

## Licença das contribuições

Ao enviar uma contribuição, você concorda que ela seja distribuída sob a [licença MIT](LICENSE)
do projeto.
