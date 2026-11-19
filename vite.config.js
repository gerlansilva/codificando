import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * O app nativo (WKWebView) carrega a interface por file://.
 * Módulos ES não funcionam nesse esquema, então o build sai como um único
 * script clássico (IIFE) e sem a meta de CSP (que não se aplica a file://).
 */
function nativeBundle () {
  return {
    name: 'investigando-native-bundle',
    apply: 'build',
    transformIndexHtml (html) {
      return html
        .replace(/<meta http-equiv="Content-Security-Policy"[\s\S]*?\/>/, '')
        .replace(/<link rel="modulepreload"[^>]*>/g, '')
        .replace(/type="module"\s+crossorigin/g, 'defer')
        .replace(/type="module"/g, 'defer')
    }
  }
}

export default defineConfig({
  plugins: [react(), nativeBundle()],
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'assets/app.js',
        assetFileNames: 'assets/[name][extname]'
      }
    }
  }
})
