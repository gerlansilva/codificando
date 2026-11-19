/**
 * Hierarquia de códigos: parentId + ordem entre irmãos.
 * As funções aqui são puras — recebem a lista e devolvem uma nova lista.
 */

export const CODE_COLORS = [
  '#4A90E2', '#E2A64A', '#7BB661', '#C16AA8',
  '#5BB8C4', '#D96B5B', '#8B7BD8', '#C9A227',
  '#2F855A', '#B7791F', '#9B2C2C', '#6B7280'
]

const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0)

export function childrenOf (codes, parentId) {
  return codes.filter((c) => (c.parentId || null) === (parentId || null)).sort(byOrder)
}

export function descendantsOf (codes, id) {
  const out = []
  const walk = (pid) => {
    for (const c of codes.filter((x) => x.parentId === pid)) {
      out.push(c.id)
      walk(c.id)
    }
  }
  walk(id)
  return out
}

/** Linha achatada em ordem de árvore, com profundidade. */
export function flattenTree (codes, parentId = null, depth = 0, acc = []) {
  for (const c of childrenOf(codes, parentId)) {
    acc.push({ code: c, depth })
    flattenTree(codes, c.id, depth + 1, acc)
  }
  return acc
}

export function codeStats (codes, excerpts) {
  const direct = new Map()
  for (const e of excerpts) direct.set(e.codeId, (direct.get(e.codeId) || 0) + 1)
  const stats = new Map()
  for (const c of codes) {
    const total = [c.id, ...descendantsOf(codes, c.id)]
      .reduce((sum, id) => sum + (direct.get(id) || 0), 0)
    stats.set(c.id, { direct: direct.get(c.id) || 0, total })
  }
  return stats
}

/**
 * Move `dragId` para perto de `targetId`.
 * mode: 'before' | 'after' (mesmo nível do alvo) | 'inside' (vira filho do alvo)
 */
export function moveCode (codes, dragId, targetId, mode) {
  if (!dragId || !targetId || dragId === targetId) return codes
  const drag = codes.find((c) => c.id === dragId)
  const target = codes.find((c) => c.id === targetId)
  if (!drag || !target) return codes

  const forbidden = new Set([dragId, ...descendantsOf(codes, dragId)])
  if (forbidden.has(targetId)) return codes

  const newParent = mode === 'inside' ? targetId : (target.parentId || null)

  const siblings = codes
    .filter((c) => (c.parentId || null) === newParent && c.id !== dragId)
    .sort(byOrder)

  let index = siblings.length
  if (mode !== 'inside') {
    const ti = siblings.findIndex((c) => c.id === targetId)
    index = ti + (mode === 'after' ? 1 : 0)
    if (index < 0) index = siblings.length
  }
  siblings.splice(index, 0, { ...drag, parentId: newParent })

  const orderById = new Map(siblings.map((c, i) => [c.id, i + 1]))
  return codes.map((c) => {
    if (c.id === dragId) return { ...c, parentId: newParent, order: orderById.get(c.id) }
    if (orderById.has(c.id)) return { ...c, order: orderById.get(c.id) }
    return c
  })
}

export function nextColor (codes) {
  return CODE_COLORS[codes.length % CODE_COLORS.length]
}

/** Mescla `fromId` em `intoId` sem criar ciclos (absorver um pai no próprio filho). */
export function mergeCodeList (codes, fromId, intoId) {
  if (!fromId || !intoId || fromId === intoId) return codes
  const from = codes.find((c) => c.id === fromId)
  const into = codes.find((c) => c.id === intoId)
  if (!from || !into) return codes
  const intoParent = into.parentId === fromId ? (from.parentId || null) : into.parentId
  return codes
    .filter((c) => c.id !== fromId)
    .map((c) => {
      if (c.id === intoId) return { ...c, parentId: intoParent }
      return c.parentId === fromId ? { ...c, parentId: intoId } : c
    })
}
