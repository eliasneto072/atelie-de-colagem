# Roadmap

O que vem pela frente, em ordem de prioridade. Sugestões são bem-vindas nas
[issues](https://github.com/eliasneto072/atelie-de-colagem/issues).

## Agora: lançamento (0.1)

- [x] Editor em TypeScript, testes, documentação e publicação automática
- [x] Modo sem internet e instalação como aplicativo
- [x] Páginas de privacidade e termos
- [x] Domínio ateliedecolagem.com.br no ar, com HTTPS
- [ ] Cadastro no Google Search Console (em verificação) e no Bing
- [ ] Link no site da Vértice

## PDF, fase 1: organizar (0.2) ✔

- [x] Juntar PDFs e fotos
- [x] Organizar: reordenar arrastando, girar, tirar páginas, desfazer
- [x] Separar: páginas escolhidas, uma por arquivo, por intervalos
- [x] Fotos para PDF (A4, Carta ou tamanho da foto)
- [x] PDF para imagens (JPG ou PNG)
- [x] Abrir PDF com senha e baixar sem senha
- [x] Funciona sem internet depois da primeira visita

## PDF, fase 2: escrever por cima (0.3) ✔

- [x] **Texto** sobre a página: datas, nomes, tamanho, negrito e cor
- [x] **Marcas** ✓, ✗ e • para caixinhas
- [x] **Assinatura** desenhada com o dedo ou o mouse, ou a partir da foto de uma assinatura no
      papel, e rubrica em todas as páginas, com aviso de que não é assinatura digital e link para
      a do gov.br
- [x] **Tarja de verdade** para esconder CPF e dados: o conteúdo de baixo é removido
- [x] **Cobrir** um trecho para escrever por cima e **marca-texto**
- [x] **Marca d'água de proteção** ("Cópia para uso exclusivo em…")
- [x] **Numerar páginas**
- [ ] **Preencher formulários** de PDF (campos de texto, caixas e listas do próprio arquivo)

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

- [x] Guias para as buscas mais comuns de PDF, cada um com o passo a passo, uma imagem real da
      ferramenta, perguntas frequentes e um botão que abre a ferramenta na tarefa certa:
      [assinar PDF](https://ateliedecolagem.com.br/assinar-pdf/),
      [esconder CPF em PDF](https://ateliedecolagem.com.br/esconder-cpf-pdf/),
      [foto para PDF](https://ateliedecolagem.com.br/foto-para-pdf/) e
      [juntar PDF](https://ateliedecolagem.com.br/juntar-pdf/)
- [ ] Mais guias: separar PDF, PDF para imagem, numerar páginas, marca d'água em documento,
      remover texto de imagem, tirar fundo branco de logo
- [ ] Contador de visitas sem cookies (Cloudflare Web Analytics ou GoatCounter)
- Versões em inglês e espanhol.
- Melhorias de acessibilidade: navegação completa por teclado e leitores de tela no painel.

## Fora do escopo

Coisas que não combinam com a proposta: contas e login, armazenamento em nuvem, anúncios, marca
d'água do site nos arquivos e qualquer processamento que envie imagens para servidores.
