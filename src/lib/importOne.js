import { extractFile, parsePdf, MAX_CHARS } from './importers.js'
import { detectDialogue } from './transcript.js'
import { saveBinary, toBase64 } from './files.js'
import { bridge } from './bridge.js'

function extOf (name) {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export const ACCEPT = ['.pdf', '.doc', '.docx', '.txt', '.rtf']

/**
 * Importa UM arquivo (File ou objeto {name, arrayBuffer(), text()}).
 * Usado pela tela de importação e pelo arrastar-e-soltar na aba Documentos.
 */
export async function importOneFile (file, createTranscript, customName = '') {
  const ext = extOf(file.name)
  if (!ACCEPT.includes(ext)) return { ok: false, name: file.name, error: 'unsupported' }
  if (!file.name) return { ok: false, name: '?', error: 'nofilename' }

  let body
  let extra = { rendererType: 'text', kind: 'document' }

  if (ext === '.pdf') {
    const buffer = await file.arrayBuffer()
    const parsed = await parsePdf(buffer.slice(0))
    body = parsed.body
    if (!body || !body.trim()) return { ok: false, name: file.name, error: 'empty' }
    const fileKey = await saveBinary(file.name, buffer)
    extra = { ...extra, rendererType: 'pdf', fileKey, pageCount: parsed.pageCount, pageOffsets: parsed.pageOffsets }
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
