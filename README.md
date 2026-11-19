# Codificando (Tauri)

Análise qualitativa de dados — importação de PDF/DOCX/TXT/RTF, codificação direta na página
do PDF, codebook hierárquico, trechos, consultas, comentários, relatórios e busca.
Aplicativo 100% local para macOS (Apple Silicon).

Esta versão substitui o shell Swift/WKWebView por **Tauri 2 + Rust**, mantendo o frontend React/Vite
e o mesmo formato de dados do aplicativo anterior.

## Requisitos

- macOS 11+
- Node.js 20+
- Rust (stable) e Xcode Command Line Tools

## Desenvolvimento

```bash
npm install
npm run app          # tauri dev (abre a janela nativa)
```

Somente a interface no navegador (sem ponte nativa, dados em localStorage):

```bash
npm run dev
```

## Build

```bash
npm start            # tauri build + abre o .app
# ou
npx tauri build
```

Artefatos:

- `src-tauri/target/release/bundle/macos/Codificando.app`
- `src-tauri/target/release/bundle/dmg/Codificando_0.2.0_aarch64.dmg`

## Dados

Os dados continuam em:

```
~/Library/Application Support/Investigando/
  investigando.json      # projeto atual
  files/                 # PDFs importados
```

O app lê e grava o mesmo formato do Codificando anterior, então os projetos existentes
abrem sem migração. Projetos `.investigando` podem ser abertos/salvos pelo menu do projeto.

## Arquitetura

- `src/` — React 18 + Vite (interface, editor de PDF com PDF.js, codebook, relatórios).
- `src/lib/bridge.js` — ponte única para Tauri; mantém fallback para navegador e para os
  shells antigos (Swift/Electron).
- `src-tauri/src/lib.rs` — comandos nativos: leitura/gravação do projeto, binários,
  seletores de arquivos, conversão `.doc`/`.rtf` via `textutil` e impressão.
- `src-tauri/tauri.conf.json` — janela, bundle e identificador.

## Observações

- A impressão usa o diálogo nativo do macOS (`WebviewWindow::print`).
- `.doc` e `.rtf` são convertidos com o `textutil` do sistema.
- O diretório `electron/` é legado e não participa do build Tauri.
