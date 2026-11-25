# Registro de mudanças

## [Não lançado] — novembro de 2026

Rodada de usabilidade para pesquisadores iniciantes: menos botões, mais arrastar e soltar,
e um caminho claro do primeiro documento à rede. Diagnóstico completo em
[docs/UX-DIAGNOSTICO.md](docs/UX-DIAGNOSTICO.md) e teste com PDFs reais em
[docs/UX-RODADA-PDF.md](docs/UX-RODADA-PDF.md). Guia de uso em
[docs/GUIA-RAPIDO.md](docs/GUIA-RAPIDO.md).

### Novo

- **Modo Área** para figuras, gráficos e quadros dentro do PDF: botão **▭ Área** (ou tecla
  **A**) e um retângulo desenhado sobre a página viram uma citação como qualquer outra,
  codificável por clique ou arraste. A citação guarda uma miniatura do recorte (mostrada
  na faixa da seleção, no inspetor, na lista do código e em Trechos) e o texto que houver
  dentro do retângulo, útil para quadros e tabelas.
- **Tela inicial** com a logo, Novo projeto, Abrir projeto, Recentes e uma explicação de
  como os projetos funcionam. Aparece na primeira abertura e pelo menu do projeto.
- **Arrastar e soltar no editor**, no estilo do ATLAS.ti: seleção → código, código →
  trecho marcado, código → seleção, código → código (subcódigo, reordenar ou mesclar).
  Uma etiqueta segue o cursor e diz o que acontecerá ao soltar.
- **Redes**: soltar um nó sobre outro cria uma relação; as exportações (SVG, figura de
  16 cm e PNG 3000 px) ficam num único menu **Exportar ▾**.
- **Próximo passo** na tela do projeto (Reunir os dados → Codificar → Analisar).
- **Créditos e citação**: cartão "Sobre o Codificando" em Configurações, com a referência
  ABNT para copiar; autoria no rodapé da tela inicial, na janela "Sobre" do sistema
  (`publisher`/`copyright` do bundle) e no README.
- Barra lateral organizada por etapas (Dados, Codificar, Analisar) e busca no projeto
  sempre visível.

### Melhorado

- O zoom do PDF se ajusta à largura na primeira abertura e é lembrado por documento;
  botão **Ajustar**.
- Faixa da seleção com até 3 linhas e uma linha "codificado em: ● código".
- Nomes de documentos limpos na importação (sem extensão nem sublinhados).
- Cabeçalho do editor mais enxuto, com as ações no menu **Documento ▾**.
- Trechos mostram até 3 linhas de texto e de comentário.
- Relatórios agrupados por uso, com Word em primeiro lugar.
- Caixas de código da rede com fundo claro e borda colorida: contraste do texto acima de
  7:1 para todas as cores (antes chegava a 1,9:1).
- Seleção em cinza-grafite, para não se confundir com um código azul.
- Terminologia: "documentos" no lugar de "transcrições".

### Corrigido

- **Projeto apagado ou movido**: o app abria um projeto vazio em silêncio e, na
  gravação seguinte, criava um arquivo vazio no lugar. Agora avisa, tira o projeto dos
  recentes e não grava nada por cima.
- Ordem de leitura em PDFs com **tabelas** (linhas reconstruídas da esquerda para a
  direita) e em **duas colunas** (texto extraído coluna por coluna).

### Acessibilidade

- Nenhuma violação WCAG 2 A/AA nas telas principais (verificação com axe-core).
- Contraste dos textos secundários e do botão principal ajustado.
- Rótulos nos filtros e nos botões de ícone, região `<main>` e cabeçalhos de tabela.
- Lista de códigos operável pelo teclado (Tab, Enter, Espaço).

### Testes

- 133 testes de unidade (Vitest), incluindo ordem de leitura de PDF, limpeza de nomes,
  projeto ausente e contraste das caixas da rede.
