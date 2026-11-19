import { ensurePdfJs } from './importers.js'
import { bridge } from './bridge.js'

/**
 * OCR de PDFs escaneados (sem camada de texto).
 *
 * Cada página é renderizada em canvas (escala 2x) e enviada como PNG base64
 * para o Vision do macOS. O texto é reunido no mesmo formato de parsePdf:
 * páginas separadas por "\n\n" e pageOffsets calculados sobre esse body.
 */

export const OCR_SCALE = 2
export const OCR_MIN_CHARS_PER_PAGE = 40

/** Média de caracteres por página abaixo do limite → provável PDF escaneado. */
export function needsOcr (parsed, minPerPage = OCR_MIN_CHARS_PER_PAGE) {
  if (!parsed || !parsed.pageCount) return false
  const chars = (parsed.body || '').trim().length
  return chars / parsed.pageCount < minPerPage
}

/** Só há OCR quando o app nativo está disponível (Vision no macOS). */
export function ocrAvailable () {
  return !!bridge.isNative
}

function canvasToBase64 (canvas) {
  const url = canvas.toDataURL('image/png')
  const comma = url.indexOf(',')
  return comma >= 0 ? url.slice(comma + 1) : ''
}

/**
 * Renderiza e reconhece todas as páginas do PDF.
 * @param {ArrayBuffer} arrayBuffer
 * @param {{ onPage?: (page:number,total:number)=>void }} opts
 * @returns {Promise<{body:string,pageCount:number,pageOffsets:number[]}>}
 */
export async function ocrPdf (arrayBuffer, opts = {}) {
  if (!ocrAvailable()) throw new Error('ocr-unavailable')
  const lib = await ensurePdfJs()
  const doc = await lib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  const pages = []

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const base = page.getViewport({ scale: 1 })
    // limita o lado maior para não estourar memória em páginas gigantes
    const scale = Math.min(OCR_SCALE, 4000 / Math.max(base.width, base.height))
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(viewport.width))
    canvas.height = Math.max(1, Math.ceil(viewport.height))
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    page.cleanup()

    let text = ''
    try {
      text = (await bridge.ocrImage(canvasToBase64(canvas))) || ''
    } catch (err) {
      console.error('OCR falhou na página', p, err)
    }
    pages.push(text.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '').trim())
    canvas.width = 0
    canvas.height = 0
    opts.onPage?.(p, doc.numPages)
  }

  const pageOffsets = []
  let acc = 0
  for (const page of pages) {
    pageOffsets.push(acc)
    acc += page.length + 2
  }
  const body = pages.join('\n\n').replace(/[ \t]+$/gm, '').trimEnd() + '\n'
  return { body, pageCount: doc.numPages, pageOffsets }
}
