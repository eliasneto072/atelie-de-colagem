# Publicação

O site é estático: `npm run build` gera a pasta `dist/` e qualquer hospedagem serve. Este projeto
usa o **GitHub Pages**, publicado automaticamente pelo GitHub Actions.

## 1. Ligar o GitHub Pages (uma vez)

1. No repositório, abra **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. Pronto. Cada push na `main` roda o workflow **Publicar** (`.github/workflows/deploy.yml`), que
   gera o build e publica.

Enquanto o Pages não estiver ligado, o workflow só gera o build e avisa no resumo, sem falhar.
Para publicar na hora, vá em **Actions → Publicar → Run workflow**.

O endereço inicial é `https://eliasneto072.github.io/atelie-de-colagem/`.

## 2. Domínio próprio: ateliedecolagem.com.br

### 2.1 Verificar o domínio no GitHub (recomendado)

Isso impede que outra conta use o seu domínio no GitHub Pages.

1. No GitHub, abra a sua foto → **Settings → Pages** (configurações da conta, não do
   repositório).
2. **Add a domain**, digite `ateliedecolagem.com.br`.
3. O GitHub mostra um registro **TXT** (nome parecido com `_github-pages-challenge-eliasneto072`
   e um valor). Crie esse registro no Registro.br (passo 2.2) e volte para clicar em **Verify**.

### 2.2 Registros no Registro.br

1. Entre em [registro.br](https://registro.br) → **Acessar conta** → **Domínios** →
   `ateliedecolagem.com.br`.
2. Em **DNS**, clique em **Configurar endereçamento** e escolha **Modo avançado** → **Confirmar**.
   O painel leva alguns minutos para liberar a edição.
3. Clique em **Nova entrada** e crie:

   | Tipo  | Nome                              | Valor                        |
   | ----- | --------------------------------- | ---------------------------- |
   | A     | vazio                             | `185.199.108.153`            |
   | A     | vazio                             | `185.199.109.153`            |
   | A     | vazio                             | `185.199.110.153`            |
   | A     | vazio                             | `185.199.111.153`            |
   | AAAA  | vazio                             | `2606:50c0:8000::153`        |
   | AAAA  | vazio                             | `2606:50c0:8001::153`        |
   | AAAA  | vazio                             | `2606:50c0:8002::153`        |
   | AAAA  | vazio                             | `2606:50c0:8003::153`        |
   | CNAME | `www`                             | `eliasneto072.github.io`     |
   | TXT   | o que o GitHub pediu no passo 2.1 | o valor mostrado pelo GitHub |

   No Registro.br, o campo **Nome** fica vazio para registros do próprio domínio (sem `www`).

4. **Salvar alterações**. A propagação costuma levar de alguns minutos a algumas horas.

Os endereços IP acima são os do GitHub Pages publicados na
[documentação do GitHub](https://docs.github.com/pt/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site).
Confira lá se mudaram antes de configurar.

### 2.3 Ligar o domínio no repositório

1. No repositório, **Settings → Pages → Custom domain**: `ateliedecolagem.com.br` → **Save**.
2. Espere a verificação de DNS ficar verde e marque **Enforce HTTPS** (pode levar até 24 h para
   ficar disponível).

Como a publicação é feita por GitHub Actions, **não** é preciso um arquivo `CNAME` no projeto: o
domínio fica guardado nas configurações do Pages.

O build usa caminhos relativos (`base: './'` no `vite.config.ts`), então funciona tanto em
`/atelie-de-colagem/` quanto na raiz do domínio, sem mudar nada no código.

## 3. Depois de publicar

- **Google Search Console:** adicione a propriedade de domínio `ateliedecolagem.com.br`
  (verificação por TXT no Registro.br) e envie o sitemap `https://ateliedecolagem.com.br/sitemap.xml`.
- **Bing Webmaster Tools:** dá para importar a propriedade direto do Search Console. O Bing também
  alimenta outros buscadores.
- **Prévia de links:** teste o endereço no depurador de compartilhamento do Facebook e no
  WhatsApp para ver se a imagem `og-image.png` aparece.
- **Site da Vértice:** adicione um link para `https://ateliedecolagem.com.br` com um texto que
  descreva o que o editor faz (ajuda a busca e quem chega pelo site).

## 4. Lançar uma versão

1. Atualize `version` no `package.json` e registre as mudanças no `CHANGELOG.md`.
2. Commit, tag e push:

   ```bash
   git commit -am "chore: versão 0.2.0"
   git tag v0.2.0
   git push && git push --tags
   ```

3. Em **Releases → Draft a new release**, escolha a tag e cole a parte do changelog.

A versão aparece na janela **Sobre** do editor. O service worker troca o cache sozinho quando os
arquivos mudam; quem estiver com o editor aberto recebe a versão nova ao recarregar.

## Outras hospedagens

Qualquer serviço de site estático funciona (Cloudflare Pages, Netlify, Vercel): comando de build
`npm run build`, pasta de saída `dist`. Sirva `sw.js` sem cache longo (ou com revalidação) para as
atualizações chegarem rápido.
