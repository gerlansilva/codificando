import { ensurePdfJs } from './importers.js'

/**
 * Reconstrói o texto de citações antigas a partir da página + retângulos.
 * Os retângulos são normalizados (0..1) em relação à página.
 */
export async function buildTextIndex (bytes, pagesWanted) {
  const lib = await ensurePdfJs()
  const doc = await lib.getDocument({ data: bytes }).promise
  const index = new Map()

  for (const p of pagesWanted) {
    if (p < 1 || p > doc.numPages) continue
    const page = await doc.getPage(p)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items = content.items
      .filter((i) => typeof i.str === 'string' && i.str.length > 0)
      .map((i) => {
        const tx = lib.Util.transform(viewport.transform, i.transform)
        const h = Math.hypot(tx[2], tx[3]) || i.height || 10
        return {
          str: i.str,
          x: tx[4] / viewport.width,
          y: (tx[5] - h) / viewport.height,
          w: (i.width || 0) / viewport.width,
          h: h / viewport.height
        }
      })
    index.set(p, items)
  }
  return index
}

export function textForRects (items, rects) {
  if (!items || !rects || !rects.length) return ''
  const hits = []
  for (const r of rects) {
    for (const it of items) {
      const overlap = it.x < r.x + r.w && it.x + it.w > r.x && it.y < r.y + r.h && it.y + it.h > r.y
      if (overlap && !hits.includes(it)) hits.push(it)
    }
  }
  hits.sort((a, b) => (Math.abs(a.y - b.y) > 0.008 ? a.y - b.y : a.x - b.x))

  let out = ''
  let prev = null
  for (const it of hits) {
    if (prev) {
      if (Math.abs(it.y - prev.y) > 0.008) out += '\n'
      else if (it.x - (prev.x + prev.w) > 0.002) out += ' '
    }
    out += it.str
    prev = it
  }
  return out.replace(/[ \t]+\n/g, '\n').trim()
}
