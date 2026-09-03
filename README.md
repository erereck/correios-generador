# Correios Generador

Gerador estático de autorização para retirada de encomendas nos Correios.

## O que faz

- fluxo rápido em 3 etapas;
- adapta automaticamente `portador/portadora` e `o/a`;
- CPF obrigatório e RG opcional (a menção ao RG desaparece do texto se estiver vazio);
- quantos códigos de rastreio forem necessários;
- data de retirada preenchida com o dia atual, mas editável;
- PDF A4 gerado no próprio navegador e aberto em uma nova aba, pronto para imprimir;
- linha de assinatura no rodapé, seguindo o documento de referência;
- pessoas e rascunho salvos somente em `localStorage` no aparelho;
- sem backend, sem conta, sem envio dos dados e sem dependências externas.

## Rodar

É um site 100% estático. Basta abrir `index.html` ou publicar a raiz do repositório no GitHub Pages / Vercel.
