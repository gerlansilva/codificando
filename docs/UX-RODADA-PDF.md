# Rodada de usabilidade com PDFs reais

**Data:** 25/11/2026 · **Versão:** 0.2.4 + navegação por etapas · **Skills:** critique, web-design-guidelines

## Como foi feito

O app foi aberto no modo navegador (Chrome, 1440×900, `vite preview`) e conduzido por script, como um
pesquisador iniciante faria. Foram usados três PDFs reais do acervo CIEEE 1999, escolhidos por serem
tipos de documento diferentes:

| Documento | Páginas | Por que foi escolhido |
|---|---|---|
| Batanero (1999), *Taller sobre análisis exploratorio de datos* | 12 | Texto corrido de anais, em espanhol, com listas |
| Estepa (2002), *Stochastic Education in the Ibero-American Countries* | 6 | Artigo em inglês, coluna única |
| IASE/ISI *Newsletter* 23(2), 1999 | 4 | Diagramação em duas colunas, tabelas, foto |

Tarefas: importar os 3 PDFs → criar códigos e marcar trechos → reaproveitar código pelo menu do botão
direito → comentar um trecho → percorrer Trechos, Comentários, Redes, Relatórios e Busca → auditar
acessibilidade com **axe-core** (WCAG 2 A/AA) e navegação por **Tab**.

Capturas em `docs/ux/rodada-pdf/`.

## O que funciona bem

- **Importação rápida e sem erro:** 3 PDFs em 1,1 s, com confirmação clara e chance de renomear.
- **Codificar custa 3 ações:** selecionar → digitar o código → Enter. Bom para quem está começando.
- **Menu do botão direito** lista os códigos existentes e "Novo código com este texto".
- **Destaques coloridos** sobre a página do PDF são fiéis ao trecho selecionado.
- **Comentar custa 2 ações** (clicar no trecho → escrever), e o comentário aparece em Comentários com
  documento, página e data.
- **O texto gravado é completo** em texto corrido; quebras de linha são preservadas.
- **A tela Redes explica a si mesma** ("Como ler a rede"), o que ajuda o iniciante.

---

## Problemas, por prioridade

### Críticos: afetam a confiança no dado

**1. Em blocos tabulares, o texto do trecho é gravado fora de ordem.**
Na *Newsletter*, a seleção do bloco "President / Brian Phillips…" foi gravada como:

```
The new ExecutiveCommitteewill consistof:
President:
PresidentElect:
VicePresidents:
CarmenBatanero(Spain)
Lionel Pereira Mendoza (Singapore)
Gilberte Schuyten (Belgium
BrianPhillips(Australia)
OaniBen-Zvi(Israel)
JoanGarfield(USA)
```

Os rótulos se separam dos nomes, e a ordem não corresponde nem ao que se vê na página nem ao que o
navegador selecionou. É exatamente o que aparece depois em Trechos, nos relatórios e no DOCX
exportado. **Correção:** montar o texto do trecho na ordem da seleção do navegador
(`Selection.toString()`, que veio correta) ou, ao reconstruir pelos retângulos, ordenar por linha
visual com tolerância de altura. Os retângulos podem continuar como estão.
*Captura: `12-duas-colunas.png`.*

**2. A citação selecionada aparece cortada, sem reticências.**
O painel mostra `"…se ha extendido como fi"` quando a seleção tem 129 caracteres. O iniciante
conclui que a seleção falhou e refaz. Causa: `Editor.jsx`, `.slice(0, 90)` sem "…".
**Correção:** limitar por linhas com CSS (`-webkit-line-clamp: 3`) e mostrar o texto completo no `title`.
*Captura: `05-selecao.png`.*

**3. Em PDF de duas colunas, a busca mistura as colunas.**
A busca por "Batanero" devolveu o contexto `…Gilbert Saporta (France) PresidentElect:
CarmenBatanero(Spain) 3. TILE: A Toolkit…`, com frases das duas colunas intercaladas. Parte do
problema vem do próprio PDF (palavras coladas e ordem interna do arquivo), mas o usuário não tem como
saber disso. **Correção:** na extração, agrupar os itens de texto por coluna (blocos por posição x)
antes de juntar as linhas; sinalizar "PDF com layout complexo" quando a ordem for incerta.

### Altos: leitura e codificação

**4. O texto do PDF aparece com 9,2 px.**
O PDF abre em 95%, com a página ocupando só 565 px de uma área de ~820 px. Em textos de anais
com letra pequena, fica ilegível, e a seleção exige precisão de mouse. **Correção:** abrir
em "ajustar à largura" por padrão e lembrar o zoom por documento.

**5. O painel de códigos se contradiz.**
Num documento ainda sem trechos, o painel mostra "**Adicione um código.** Selecione um trecho no
documento…" em letra grande e, logo abaixo, os 4 códigos do projeto. **Correção:** mostrar o estado
vazio só quando o projeto não tem nenhum código; com códigos, trocar por uma dica de uma linha
("Selecione um trecho e clique num código").
*Captura: `11-iase.png`.*

**6. A seleção do navegador e o primeiro código têm o mesmo azul.**
Depois de aplicar o código "Análise exploratória de dados" (azul), o trecho continua parecendo apenas
selecionado. O usuário não tem certeza de que gravou. **Correção:** limpar a seleção ao aplicar e
piscar o destaque com a cor do código; tirar o azul da paleta automática ou mudar a cor de seleção.

**7. O nome do documento é o nome do arquivo.**
`Batanero_1999_Taller_analisis_exploratorio.pdf` vira título de página, entrada na barra lateral,
coluna de tabela e rótulo de relatório. O campo para renomear existe na confirmação, mas parece texto
fixo. **Correção:** sugerir o nome sem extensão e sem `_` ("Batanero 1999 Taller analisis
exploratorio"), com o campo claramente editável.

**8. A linha de informações da seleção é críptica.**
`pág. 1 · 129 car · 1 ✓ · já: Análise exploratória de dados` quebra em 3 linhas no painel.
**Correção:** uma linha só, "pág. 1 · codificado em: ● Análise exploratória".

**9. O popover da citação cobre o texto vizinho** e mistura idiomas ("Delete remove a citação").
**Correção:** ancorar o popover na margem direita da página ou no painel de códigos; usar
"Tecla Delete remove a citação".
*Captura: `13-clique-trecho.png`.*

### Médios: telas de análise

**10. Em Trechos, não dá para ler o trecho.** O texto é cortado em uma linha (~60 caracteres), e a coluna
Comentário ocupa espaço com "—". Para quem faz análise qualitativa, ler o trecho é a tarefa.
**Correção:** trecho em até 3 linhas, comentário embaixo do trecho (não em coluna), coluna Documento
mais estreita. *Captura: `20-snippets.png`.*

**11. A terminologia supõe entrevistas.** Relatórios fala em "3 **transcrições**" e na coluna
"**Transcrição**" para artigos em PDF; o rodapé diz "Salvo localmente em **localStorage**".
**Correção:** "documentos"; tirar o jargão técnico. *Captura: `20-reports.png`.*

**12. Rótulos dos trechos na Rede com ~7 px.** *Captura: `20-networks.png`.*

**13. A Home não orienta o primeiro passo.** "Abra as configurações pelo logo" esconde uma ação
importante atrás de um elemento que não parece botão.

### Acessibilidade (axe-core, WCAG 2 AA)

| Problema | Telas | Elementos |
|---|---|---|
| **Contraste insuficiente**: o cinza `#7d8a9c` sobre branco dá **3,51:1** (mínimo 4,5:1) | todas | 141 |
| `<select>` sem rótulo (filtros de Documentos e Trechos) | 2 | 3 |
| Caixa "selecionar todos" só com `title` | Trechos | 1 |
| Sem região `<main>` | todas | — |
| Cabeçalho de tabela vazio (coluna de ações) | 3 | 3 |

Teclado: por **Tab** chega-se a todos os botões, com foco visível, exceto o campo "Buscar no
documento" (sem indicador). Os códigos da lista **não recebem foco**: só os botões "⋯", que não têm
nome acessível. Na prática, aplicar um código exige mouse.

**Correção mínima:** trocar `--text-muted` por `#5a6678` (5,8:1); `aria-label` nos selects e
nos botões "⋯" ("Ações do código X"); envolver o conteúdo em `<main>`; tornar cada linha de código
um botão focável que aplica o código à seleção atual.

> Nesta rodada já corrigi o contraste dos dois elementos que eu tinha criado na barra lateral
> (campo de busca e rótulos dos grupos), que saíram com 3,35:1 e agora estão em 5,57:1.

---

## Ordem sugerida de correção

1. **Itens 1 e 2** (confiança no dado): pequenos e de alto impacto.
2. **Itens 4, 5 e 6** (abrir em largura, estado vazio, feedback de aplicação).
3. **Contraste + rótulos + `<main>`** (uma troca de token e alguns atributos).
4. **Item 10** (Trechos legível), junto com a fusão de Trechos e Consultas prevista no diagnóstico.
5. Itens 3, 7, 8, 9, 11, 12, 13.

## Limites desta rodada

- O teste foi automatizado e não substitui pessoas: mede o que quebra, não onde alguém hesita.
  Continua valendo o teste com 5 pesquisadores iniciantes descrito em `UX-DIAGNOSTICO.md`.
- Rodou no Chrome, no modo navegador. O app empacotado usa WebKit (macOS) e WebView2 (Windows).
  O item 1 deve ser conferido nos dois, porque depende da seleção nativa.
- Não foram testados PDFs escaneados (OCR) nem documentos com mais de 50 páginas.
