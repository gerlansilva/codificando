# Diagnóstico de UX/UI do Codificando

Etapas 1 e 2 do plano de redesign: **redesign-existing-projects** (auditoria) e **distill/quieter**
(o que tirar e o que silenciar). A nova identidade visual (**frontend-design**) e a verificação
(**web-design-guidelines + critique**) vêm depois, sobre esta base.

As skills estão em `.claude/skills/`. O Claude Code as encontra sozinho quando abre a pasta do projeto.

---

## 1. Para quem é a interface

Pesquisador iniciante, com pouca experiência em software, fazendo **qualquer** análise qualitativa:
análise de conteúdo, análise temática, grounded theory, fenomenológica-hermenêutica, ATD...

O que essas abordagens têm em comum é um ciclo, e não um conjunto de ferramentas:

```
Reunir os dados  →  Ler e marcar  →  Organizar as marcas  →  Interrogar e relacionar  →  Escrever
(Documentos)        (Editor)          (Códigos/Trechos)        (Consultas/Redes)            (Memos/Relatórios)
                         ↑______________ volta várias vezes _______________|
```

Cada método muda **o nome** das coisas (código, categoria, unidade de significado, tema, conceito)
e **a ordem de ênfase**, mas não muda o ciclo. A interface deve mostrar o ciclo, e não esconder as
etapas numa lista plana de 9 itens.

**Tarefa principal (a que vale 80%):** ler um documento e marcar trechos. Tudo o mais é secundário
a ela e deve ficar ao alcance sem tirar o pesquisador do texto.

---

## 2. O que o webQDA ensina

O webQDA organiza tudo em **três pilares + gestão**: *Fontes*, *Codificação*, *Questionamento* e
*Gestão*. A revisão da Universidade de Surrey (2018) elogia exatamente isso: com só quatro áreas,
é fácil transitar entre elas, e o programa é simples de aprender.

| webQDA | O que adotar no Codificando | O que **não** copiar |
|---|---|---|
| 3 pilares no painel lateral (Fontes · Codificação · Questionamento) | Agrupar a navegação nas mesmas etapas: **Dados · Codificar · Analisar** (feito nesta rodada) | — |
| **Descritores** separados dos códigos (dados factuais: sexo, escola, ano) e **Classificações/Atributos** | Criar **atributos de documento** (participante, escola, turma, data). Hoje não existem, e são o que permite perguntar "o que dizem os professores do ensino médio?" | Não criar uma 3ª árvore paralela à de códigos; atributos ficam no próprio documento |
| Recodificar direto na lista de referências recuperadas | Em **Trechos**, permitir trocar/adicionar código no próprio trecho, sem abrir o editor | — |
| Questionamentos salvos automaticamente | Consultas já são salvas; manter | — |
| **Diário de bordo** (logbook) central do projeto | Um **memo do projeto** (diário de análise) acessível de qualquer tela — essencial na fenomenologia e na grounded theory | — |
| Fraquezas apontadas: sem visão de margem, sem anotar referências, poucos atalhos de teclado | Codificando já anota trechos (comentários). Adicionar **faixas de código na margem** do editor e **atalhos** (1–9 aplicam os códigos favoritos) | — |

---

## 3. Problemas encontrados (redesign-existing-projects)

Ordenados por impacto no iniciante.

### 3.1 Arquitetura da informação
1. **Navegação plana com 9 itens de mesmo peso**, sem dizer em que etapa o pesquisador está.
   *Corrigido nesta rodada:* grupos **Dados / Codificar / Analisar**; Buscar virou campo no topo.
2. **Três maneiras de procurar trechos que competem entre si**: Buscar (global), Trechos (tabela com
   filtros) e Consultas (tabela com filtros + consultas salvas). Trechos e Consultas mostram **a mesma
   tabela**. Proposta: **fundir Trechos em Consultas** → uma só tela "Trechos", com os filtros em
   cima e "Salvar este filtro" como ação secundária. Buscar fica como busca rápida (campo no topo).
3. **Comentários** é uma tela solta. Comentários, memos e o futuro diário de análise são a mesma
   coisa para o pesquisador: **escrita analítica**. Proposta: renomear para **Memos** e reunir ali
   comentários de trecho, memos de código e o diário do projeto.
4. **A lista de documentos aparece duas vezes** (barra lateral e tela Documentos) e a de códigos
   também (painel do editor e tela Códigos). A barra lateral pode manter só os documentos recentes
   (5) e "Ver todos".
5. **Faltam atributos de documento** (ver webQDA acima). Sem eles, Consultas e Relatórios não
   conseguem comparar grupos de participantes.

### 3.2 Editor (a tela principal)
6. **Título do documento em ~48 px** e cabeçalho de página de site ocupam ~15% da altura
   útil. No editor, o título deve ser discreto (16–18 px na barra superior), e o texto deve começar
   logo abaixo.
7. **"Exportar PDF" com destaque no editor** compete com a codificação. Mover para o menu `···`.
8. O painel de códigos à direita tem **título "Códigos" em 30 px** e um botão "+ Código" que repete
   o campo "Buscar ou adicionar códigos". Deixar só o campo (Enter cria o código).
9. Os números "0 / 6" na árvore (próprios / com filhos) não se explicam. Mostrar só o total, com o
   detalhe no `title`.
10. **Sem visão de margem**: não dá para ver a sequência dos códigos ao longo do documento.
    Faixas coloridas na margem resolvem e diferenciam do webQDA.

### 3.3 Redes
11. **Barra com 13 controles** (Visão, 4 caixas, Citações, Tamanho, Reorganizar, Figura 16 cm,
    PNG, SVG). Primeiro nível: Visão + Foco. O restante vai para um painel "Exibição" recolhível,
    e as 3 exportações para um único botão "Exportar ▾".
12. Faixa verde "Mostrando 6 de 6 citações..." repete o painel lateral. Basta o painel.
13. Rótulos dos nós em ~8 px; ilegíveis no tamanho padrão.

### 3.4 Relatórios
14. **Cinco botões de exportação com o mesmo peso**. Agrupar em "Exportar ▾" com DOCX em
    primeiro lugar (é o que vai para a tese).
15. Quatro cartões de número repetem a Visão geral do projeto (Home). Tirar daqui ou da Home.

### 3.5 Visual (quieter)
16. **Duas camadas de tokens CSS** (o conjunto antigo `--delve-*` e o novo a partir da linha
    ~1850) e regras duplicadas (`.nav-item` definida 3 vezes, `.sidebar` 2 vezes). Consolidar antes
    de mudar a aparência, senão cada ajuste briga com uma regra antiga.
17. **Três tipografias sem papel definido**: Inter (interface), Libre Baskerville (estados vazios)
    e Helvetica (restos). Definir: uma sans para a interface; a serifada só para o **texto dos
    dados** no editor, onde ajuda a leitura longa.
18. Títulos de página em 30–36 px, extrabold, em telas de ferramenta. Reduzir para 22–24 px,
    semibold.
19. Cabeçalhos de tabela em CAIXA ALTA espaçada (DOCUMENTO, PÁG., CÓDIGOS). Trocar por
    sentence case, cinza, 12 px.
20. A coluna "PÁG." mostra "—" em todas as linhas de documentos de texto. Ocultar quando não
    houver página.
21. Uma só cor de destaque (o azul) para ações; as cores dos códigos já carregam muita cor.
    Os botões azuis cheios ("Salvar consulta", "SVG", "Adicionar documentos") devem ser **um por
    tela**, no máximo.

---

## 4. Uma interface para qualquer método

Proposta de baixo custo e alto efeito para o iniciante: ao criar o projeto, perguntar
**"Que tipo de análise você vai fazer?"** e guardar um *perfil*. O perfil **só muda os nomes e as
dicas**; as funções são as mesmas para todos.

| Perfil | "Código" vira | "Código pai" vira | Dica na tela vazia |
|---|---|---|---|
| Análise de conteúdo (Bardin) | Unidade de registro / categoria | Categoria | "Comece pela pré-análise: leia tudo antes de codificar" |
| Análise temática (Braun & Clarke) | Código | Tema | "Fase 2: gere códigos iniciais; os temas vêm depois" |
| Grounded theory | Código aberto | Categoria (axial) | "Escreva memos desde o primeiro código" |
| Fenomenológica-hermenêutica | Unidade de significado | Convergência / núcleo de ideias | "Destaque o que responde à sua interrogação" |
| Livre | Código | Categoria | — |

Isso também resolve a terminologia: o iniciante vê as palavras do método que estuda, e não as do
software.

---

## 5. Plano das próximas rodadas

| Rodada | Skill | Escopo |
|---|---|---|
| ✅ 1 | redesign-existing-projects + distill | Navegação por etapas, Buscar no topo, ícone próprio de Consultas, foco visível |
| 2 | distill | Fundir Trechos + Consultas; Comentários → Memos; editor com cabeçalho compacto; barra de Redes em 2 níveis; exportações agrupadas |
| 3 | quieter | Consolidar tokens CSS; escala tipográfica 12/14/16/22; um botão primário por tela |
| 4 | frontend-design | Identidade visual (sobre a base limpa) |
| 5 | web-design-guidelines + critique | Acessibilidade, contraste, teclado; teste com 3 a 5 pesquisadores iniciantes |
| depois | — | Atributos de documento; perfil de análise; faixas na margem; atalhos 1–9 |

**Teste de usabilidade sugerido (rodada 5):** 5 participantes, 5 tarefas cronometradas, pensando em
voz alta: (1) importar uma entrevista; (2) criar 3 códigos e marcar 5 trechos; (3) achar todos os
trechos de um código; (4) escrever um memo sobre um código; (5) exportar o relatório em DOCX.
Registrar tempo, erros e onde a pessoa hesitou; aplicar o SUS ao final.

---

### Referências
- Surrey CAQDAS Networking Project. *webQDA review* (2018).
- Neri de Souza, Costa & Moreira (2011). Questionamento no processo de análise de dados
  qualitativos com apoio do software webQDA. *EduSer*, 3(1).
