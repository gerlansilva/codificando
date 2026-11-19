import { defineConfig } from 'vitest/config'

/**
 * Testes de unidade das funções puras de `src/lib`.
 *
 * O ambiente padrão é `node` (rápido e suficiente para códigos, transcrição,
 * busca, páginas e geração do DOCX). Testes que dependem de APIs do navegador
 * declaram `// @vitest-environment jsdom` no topo do próprio arquivo, de modo
 * que o jsdom é carregado apenas nesses casos.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/lib/__tests__/**/*.test.js'],
    reporters: 'default',
    coverage: {
      provider: 'v8',
      include: [
        'src/lib/codes.js',
        'src/lib/transcript.js',
        'src/lib/search.js',
        'src/lib/pages.js',
        'src/lib/exports.js'
      ],
      reporter: ['text']
    }
  }
})
