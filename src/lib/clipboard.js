/**
 * Cópia de trechos para a área de transferência.
 * Formato usado no app: "texto do trecho" (p.12)
 *
 * No app (Tauri) usa o plugin nativo clipboard-manager; no navegador cai
 * em navigator.clipboard, com o caminho clássico como último recurso.
 */

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export function quoteToText (text, page) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  return `"${clean}"` + (page ? ` (p.${page})` : '')
}

async function legacyCopy (text) {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

export async function copyText (text) {
  const value = String(text ?? '')

  if (isTauri) {
    try {
      const { writeText } = await import('@tauri-apps/plugin-clipboard-manager')
      await writeText(value)
      return true
    } catch (err) {
      console.warn('Clipboard nativo indisponível, usando o navegador.', err)
    }
  }

  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    // WKWebView antigo pode exigir o caminho clássico
    return legacyCopy(value)
  }
}

export async function pasteText () {
  if (isTauri) {
    try {
      const { readText } = await import('@tauri-apps/plugin-clipboard-manager')
      return String((await readText()) || '')
    } catch (err) {
      console.warn('Leitura do clipboard nativo indisponível.', err)
    }
  }
  try {
    return String((await navigator.clipboard.readText()) || '')
  } catch {
    return ''
  }
}
