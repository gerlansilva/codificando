import workerCode from 'pdfjs-dist/build/pdf.worker.min.js?raw'
import mammoth from 'mammoth'

/**
 * pdf.js é carregado sob demanda como script clássico (public/pdfjs/pdf.min.js).
 * O worker é criado a partir do código embutido, via Blob URL — necessário em
 * file://, onde workers a partir de arquivos locais são bloqueados.
 */
let pdfjsPromise = null
const workerBlob = new Blob([workerCode], { type: 'text/javascript' })

export function ensurePdfJs () {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = new URL('pdfjs/pdf.min.js', document.baseURI).href
      script.onload = () => {
        if (!window.pdfjsLib) { reject(new Error('pdf.js indisponível')); return }
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob)
        resolve(window.pdfjsLib)
      }
      script.onerror = () => reject(new Error('Falha ao carregar pdf.js'))
      document.head.appendChild(script)
    })
  }
  return pdfjsPromise
}

/* ------------------------------------------------------------------ *
 * Normalização de timecodes (mesma regra do Delve, testada no relatório)
 * ------------------------------------------------------------------ */

const TIMECODE_RANGE = /^(\d{1,2}:\d{2}(?::\d{2})?)(?:[,.]\d{1,3})?\s*-->\s*[\d:.,]+\s*(.*)$/

export function cleanTimecodes (text) {
  const lines = text.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\d+$/.test(line.trim()) && TIMECODE_RANGE.test((lines[i + 1] || '').trim())) continue

    const m = line.trim().match(TIMECODE_RANGE)
    if (m) {
      let rest = (m[2] || '').trim()
      if (!rest) {
        rest = (lines[i + 1] || '').trim()
        if (rest) i++
      }
      out.push(rest ? `${m[1]} ${rest}` : m[1])
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

export function normalizeText (raw) {
  let text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  text = cleanTimecodes(text)
  return text.replace(/[ \t]+$/gm, '').trimEnd() + '\n'
}

/* ------------------------------------------------------------------ *
 * PDF com consciência de layout
 * ------------------------------------------------------------------ */

export async function extractPdf (arrayBuffer) {
  return (await parsePdf(arrayBuffer)).body
}

export async function parsePdf (arrayBuffer) {
  const lib = await ensurePdfJs()
  const doc = await lib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise
  const pages = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    pages.push(layoutPage(content.items))
  }
  // offsets de início de cada página dentro do body (para buscar → página)
  const pageOffsets = []
  let acc = 0
  for (const page of pages) {
    pageOffsets.push(acc)
    acc += page.length + 2 // separador "\n\n"
  }
  return {
    body: pages.join('\n\n').replace(/[ \t]+$/gm, '').trimEnd() + '\n',
    pageCount: doc.numPages,
    pageOffsets
  }
}

function layoutPage (items) {
  const glyphs = items
    .filter((i) => typeof i.str === 'string' && i.str.length > 0)
    .map((i) => ({
      text: i.str,
      x: i.transform[4],
      y: i.transform[5],
      w: i.width || i.str.length * (i.height || 10) * 0.5,
      h: i.height || 10
    }))
  if (!glyphs.length) return ''

  const lines = []
  for (const g of glyphs) {
    const line = lines.find((l) => Math.abs(l.y - g.y) <= Math.max(2, g.h * 0.35))
    if (line) {
      line.items.push(g)
      line.y = (line.y * (line.items.length - 1) + g.y) / line.items.length
    } else {
      lines.push({ y: g.y, items: [g], h: g.h })
    }
  }
  lines.sort((a, b) => b.y - a.y)
  lines.forEach((l) => l.items.sort((a, b) => a.x - b.x))

  const charWidths = lines.flatMap((l) => l.items.map((i) => i.w / Math.max(1, i.text.length))).sort((a, b) => a - b)
  const charW = charWidths[Math.floor(charWidths.length / 2)] || 5

  const rendered = lines.map((l) => {
    let s = ''
    let prev = null
    for (const it of l.items) {
      if (prev) {
        const gap = it.x - (prev.x + prev.w)
        if (gap > charW * 0.9 && !/\s$/.test(s) && !/^\s/.test(it.text)) s += ' '
        else if (gap > charW * 6) s += '   '
      }
      s += it.text
      prev = it
    }
    return { text: s.replace(/\s+$/, ''), y: l.y, h: l.h }
  }).filter((l) => l.text.trim().length > 0)

  let out = ''
  let prev = null
  for (const l of rendered) {
    if (!prev) out = l.text
    else {
      const gap = prev.y - l.y
      out += gap > prev.h * 1.75 ? '\n\n' : '\n'
      out += l.text
    }
    prev = l
  }
  return out
}

export async function extractDocx (arrayBuffer) {
  const result = await mammoth.extractRawText({ arrayBuffer })
  return (result.value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd() + '\n'
}

export function extractTxt (text) {
  return normalizeText(text)
}

export const SUPPORTED = ['.txt', '.pdf', '.docx']
// Documentos longos (teses, relatórios) passam fácil dos 270k caracteres do
// Delve; aqui o limite é local e generoso.
export const MAX_CHARS = 5000000

export function isSupported (name) {
  return SUPPORTED.some((ext) => name.toLowerCase().endsWith(ext))
}

export async function extractFile (file) {
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.txt')) return extractTxt(await file.text())
  if (lower.endsWith('.pdf')) return extractPdf(await file.arrayBuffer())
  if (lower.endsWith('.docx')) return extractDocx(await file.arrayBuffer())
  throw new Error('unsupported')
}
