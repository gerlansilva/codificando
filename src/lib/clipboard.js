/**
 * Cópia de trechos para a área de transferência.
 * Formato usado no app: "texto do trecho" (p.12)
 */

export function quoteToText (text, page) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  return `"${clean}"` + (page ? ` (p.${page})` : '')
}

export async function copyText (text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // WKWebView antigo pode exigir o caminho clássico
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
}
