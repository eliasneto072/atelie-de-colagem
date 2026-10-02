# Roadmap

O que vem pela frente, em ordem de prioridade. Sugestões são bem-vindas nas
[issues](https://github.com/eliasneto072/atelie-de-colagem/issues).

## Agora: lançamento (0.1)

- [x] Editor em TypeScript, testes, documentação e publicação automática
- [x] Modo sem internet e instalação como aplicativo
- [x] Páginas de privacidade e termos
- [ ] Domínio ateliedecolagem.com.br no ar
- [ ] Cadastro no Google Search Console e no Bing
- [ ] Link no site da Vértice

## PDF, fase 1: organizar (0.2) ✔

- [x] Juntar PDFs e fotos
- [x] Organizar: reordenar arrastando, girar, tirar páginas, desfazer
- [x] Separar: páginas escolhidas, uma por arquivo, por intervalos
- [x] Fotos para PDF (A4, Carta ou tamanho da foto)
- [x] PDF para imagens (JPG ou PNG)
- [x] Abrir PDF com senha e baixar sem senha
- [x] Funciona sem internet depois da primeira visita

## PDF, fase 2: escrever por cima (0.3)

- **Texto** sobre a página: datas, nomes, "X" em caixinhas (a mesma ferramenta de texto do
  editor de imagens).
- **Assinatura desenhada** com o dedo ou o mouse, e rubrica em todas as páginas. Com aviso
  claro de que não é assinatura digital com validade jurídica, indicando a do gov.br.
- **Tarja de verdade** para esconder CPF e dados: o conteúdo de baixo é removido, não só coberto.
- **Marca d'água de proteção** ("Cópia para uso exclusivo em…").
- **Preencher formulários** de PDF e **numerar páginas**.

## PDF, fase 3: avançado (0.4)

- **Diminuir o tamanho** para caber nos limites de sites do governo (2 ou 5 MB).
- **Escanear com o celular:** endireitar a folha e melhorar o contraste.
- **OCR** em português: PDF escaneado vira PDF pesquisável.
- **Ponte com o editor de imagens:** abrir uma página no editor (remover objeto, trocar cor) e
  voltar para o PDF.

## Editor de imagens (junto com as fases do PDF)

- **Texto:** escrever com fontes, cor, contorno e sombra. Junto com remover objeto, cobre o caso
  "trocar um texto numa imagem". Serve também para a fase 2 do PDF.
- **Salvamento automático:** guardar o trabalho no próprio aparelho (IndexedDB) para não perder
  nada ao fechar a aba.
- **Recorte com proporções prontas:** 1:1, 4:5, 9:16 e 16:9 para redes sociais, foto 3×4 e
  documentos.
- **Borrar e pixelar** uma área (esconder placa, rosto ou dado pessoal antes de compartilhar).

### Depois

- **Colagem em grade:** modelos de 2, 3, 4 e 6 fotos com espaçamento e cantos arredondados.
- **Tirar fundo automático** com um modelo de IA rodando no navegador, sem enviar a foto.
- **Seleção de várias camadas**, distribuir com espaçamento igual e agrupar.
- **Abrir imagens compartilhadas** de outros apps no celular (alvo de compartilhamento do PWA).

## Alcance

- Páginas de entrada para tarefas comuns ("juntar PDF", "separar PDF", "foto para PDF",
  "remover texto de imagem", "tirar fundo branco de logo") com um exemplo e um botão que abre a
  ferramenta certa.
- Versões em inglês e espanhol.
- Melhorias de acessibilidade: navegação completa por teclado e leitores de tela no painel.

## Fora do escopo

Coisas que não combinam com a proposta: contas e login, armazenamento em nuvem, anúncios, marca
d'água e qualquer processamento que envie imagens para servidores.
