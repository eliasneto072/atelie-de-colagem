# Segurança

## Versões cobertas

O Ateliê de Colagem é um site: a versão coberta é sempre a que está no ar em
[ateliedecolagem.com.br](https://ateliedecolagem.com.br) e na branch `main`.

## Como relatar uma falha

**Não abra uma issue pública para falhas de segurança.**

Use o relato privado do GitHub: na aba **Security** do repositório, clique em
**Report a vulnerability**. Descreva:

- o que encontrou e qual o impacto;
- como reproduzir (navegador, aparelho, passos, arquivo de exemplo, se houver);
- se já viu a falha sendo explorada.

Se não conseguir usar o relato privado, fale com a [Vértice](https://eliasneto072.github.io/vertice/)
e pediremos os detalhes por um canal privado.

## O que esperar

- Confirmação de recebimento em até 5 dias úteis.
- Uma avaliação inicial e, se a falha for confirmada, um prazo para a correção.
- Crédito no histórico de versões, se você quiser.

## O que conta como falha

Como tudo roda no navegador e não há contas nem servidor próprio, os riscos que mais importam são:

- uma imagem ou arquivo preparado que execute código na página (XSS) ou trave o navegador de
  forma grave;
- qualquer caminho pelo qual uma imagem do usuário saia do aparelho;
- problemas no service worker que sirvam conteúdo errado ou de outra origem;
- dependências com vulnerabilidades conhecidas que afetem o site publicado.
