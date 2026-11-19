import { extractFile, parsePdf, MAX_CHARS } from './importers.js'
import { detectDialogue } from './transcript.js'
import { saveBinary, toBase64 } from './files.js'
import { bridge } from './bridge.js'
import { needsOcr, ocrPdf, ocrAvailable } from './ocr.js'

function extOf (name) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export const ACCEPT = ['.pdf', '.doc', '.docx', '.txt', '.rtf']

/**
 * Importa UM arquivo (File ou objeto {name, arrayBuffer(), text()}).
 * Usado pela tela de importação e pelo arrastar-e-soltar na aba Documentos.
 * options.onStatus recebe 'ocr' quando um PDF escaneado entra em OCR.
 */
export async function importOneFile (file, createTranscript, customName = '', options = {}) {
  const ext = extOf(file.name)
  if (!ACCEPT.includes(ext)) return { ok: false, name: file.name, error: 'unsupported' }
  if (!file.name) return { ok: false, name: '?', error: 'nofilename' }

  let body
  let extra = { rendererType: 'text', kind: 'document' }

  if (ext === '.pdf') {
    const buffer = await file.arrayBuffer()
    let parsed = await parsePdf(buffer.slice(0))
    let usedOcr = false

    if (needsOcr(parsed)) {
      if (!ocrAvailable()) return { ok: false, name: file.name, error: 'ocr-unavailable' }
      options.onStatus?.('ocr')
      try {
        const recognized = await ocrPdf(buffer.slice(0), {
          onPage: (p, total) => options.onOcrPage?.(p, total)
        })
        if (recognized.body.trim()) {
          parsed = recognized
          usedOcr = true
        }
      } catch (err) {
        console.error('OCR falhou', file.name, err)
        if (!parsed.body.trim()) return { ok: false, name: file.name, error: 'ocr-failed' }
      }
    }

    body = parsed.body
    if (!body || !body.trim()) {
      return { ok: false, name: file.name, error: usedOcr ? 'ocr-empty' : 'empty' }
    }
    const fileKey = await saveBinary(file.name, buffer)
    extra = {
      ...extra,
      rendererType: 'pdf',
      fileKey,
      pageCount: parsed.pageCount,
      pageOffsets: parsed.pageOffsets,
      ocr: usedOcr
    }
  } else if (ext === '.doc' || ext === '.rtf') {
    const buffer = await file.arrayBuffer()
    const converted = await bridge.convertDocument(toBase64(buffer), ext.slice(1))
    if (converted == null) return { ok: false, name: file.name, error: 'convert-unsupported' }
    body = converted.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
    if (!body.trim()) return { ok: false, name: file.name, error: 'empty' }
  } else {
    body = await extractFile(file)
    if (!body || !body.trim()) return { ok: false, name: file.name, error: 'empty' }
  }

  if (body.length > MAX_CHARS) return { ok: false, name: file.name, error: 'big' }
  if (extra.rendererType === 'text') extra.dialogue = detectDialogue(body)
  const title = (customName || '').trim() || file.name
  const created = createTranscript(title, body, extra)
  return { ok: true, name: title, id: created?.id }
}
