/** Utilitários de página para PDFs (offsets do texto extraído). */

import { makeSearchRegex } from './search.js'

export function pageForOffset (offsets, offset) {
  if (!offsets || !offsets.length) return null
  let lo = 0
  let hi = offsets.length - 1
  let ans = 0
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (offsets[mid] <= offset) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans + 1
}

/** Todas as ocorrências de `term` no texto, com a página de cada uma. */
export function findHits (body, term, pageOffsets) {
  if (!term || !body) return []
  const re = makeSearchRegex(term)
  const out = []
  let m
  while ((m = re.exec(body))) {
    out.push({ offset: m.index, page: pageForOffset(pageOffsets, m.index) })
    if (m[0].length === 0) re.lastIndex++
  }
  return out
}

/** Índice da ocorrência dentro da própria página (para marcar no PDF). */
export function indexOnPage (hits, pos) {
  const hit = hits[pos]
  if (!hit) return 0
  let n = 0
  for (let i = 0; i < pos; i++) {
    if (hits[i].page === hit.page) n++
  }
  return n
}
