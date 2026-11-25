/** Ordem de leitura do texto selecionado num PDF (colunas, tabelas). */

/**
 * Ordena as linhas de uma página em ordem de leitura.
 * As colunas vêm do layout da página inteira (não da seleção), e regiões que
 * cabem dentro de outra coluna (nomes alinhados à direita numa tabela, recuos)
 * são fundidas nela. Dentro da coluna, o que está na mesma altura vira uma
 * linha só, da esquerda para a direita — assim "Presidente:   Fulano" fica junto.
 */
export function orderLinesByColumn (items, colsPx) {
  if (!items.length) return []
  const cols = mergeColumns(colsPx || [])
  const colOf = (x) => {
    let idx = 0
    cols.forEach((c, i) => { if (x >= c.x0 - 4) idx = i })
    return idx
  }
  const buckets = new Map()
  for (const it of items) {
    const k = cols.length ? colOf(it.x) : 0
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k).push(it)
  }
  const out = []
  for (const k of [...buckets.keys()].sort((a, b) => a - b)) {
    const rows = []
    for (const it of buckets.get(k).sort((a, b) => a.y - b.y || a.x - b.x)) {
      const tol = Math.max(2, (it.h || 10) * 0.6)
      const row = rows.find((r) => Math.abs(r.y - it.y) <= tol)
      if (row) row.items.push(it)
      else rows.push({ y: it.y, items: [it] })
    }
    rows.sort((a, b) => a.y - b.y)
    for (const r of rows) out.push(r.items.sort((a, b) => a.x - b.x).map((i) => i.text).join(' '))
  }
  return out
}

/** Junta intervalos [x0,x1] que se tocam (até `gap` px); cada bloco é uma coluna. */
export function coverageColumns (intervals, gap = 8) {
  const out = []
  for (const iv of [...intervals].sort((a, b) => a.x0 - b.x0)) {
    const prev = out[out.length - 1]
    if (prev && iv.x0 <= prev.x1 + gap) prev.x1 = Math.max(prev.x1, iv.x1)
    else out.push({ x0: iv.x0, x1: iv.x1 })
  }
  return out
}

/** Funde regiões de coluna que começam dentro de outra (não são colunas de verdade). */
export function mergeColumns (cols) {
  const sorted = [...cols].sort((a, b) => a.x0 - b.x0)
  const out = []
  for (const c of sorted) {
    const prev = out[out.length - 1]
    if (prev && c.x0 < prev.x1 - 4) prev.x1 = Math.max(prev.x1, c.x1)
    else out.push({ ...c })
  }
  return out
}

