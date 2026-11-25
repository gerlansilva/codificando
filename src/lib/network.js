/**
 * Rede de relações do projeto.
 *
 * Nós: códigos, trechos (citações) e documentos.
 * Arestas: hierarquia do codebook, codificação de um trecho, vínculo
 * trecho↔trecho e vínculo código↔código.
 *
 * O layout é determinístico (sem aleatoriedade): as mesmas entradas produzem
 * o mesmo desenho, o que mantém a figura estável entre exportações.
 */

const GOLDEN = 2.399963229728653

/**
 * Capacidade medida da área de 1000×1000, por escala das caixas.
 * [total de citações, máximo de citações num mesmo código]
 * Acima do limite de "curto", só pontos cabem sem sobreposição.
 */
export const QUOTE_CAPACITY = {
  0.85: { text: [40, 28], short: [60, 40] },
  1: { text: [30, 20], short: [50, 30] },
  1.15: { text: [28, 18], short: [45, 26] }
}

/** Limite de cartões quando um código está em foco (medido: 0 sobreposições). */
export const FOCUS_CARD_LIMIT = 24

export const CODE_TEXT_COLOR = '#0b1b33'

/**
 * Modo de citação que cabe na área sem sobrepor cartões.
 * @param {object} counts { total, maxPer, scale, focus }
 * @returns {'text'|'short'|'dot'}
 */
export function quoteModeFor (counts = {}) {
  const scale = counts.scale || 1
  const key = scale <= 0.9 ? 0.85 : scale >= 1.1 ? 1.15 : 1
  const cap = QUOTE_CAPACITY[key]
  const total = counts.total || 0
  const maxPer = counts.maxPer || 0
  if (total <= cap.text[0] && maxPer <= cap.text[1]) return 'text'
  if (total <= cap.short[0] && maxPer <= cap.short[1]) return 'short'
  return 'dot'
}

/** O modo escolhido cabe na área sem sobrepor? Pontos sempre cabem. */
export function quoteModeFits (mode, counts = {}, scale = 1) {
  if (mode === 'dot') return true
  const key = scale <= 0.9 ? 0.85 : scale >= 1.1 ? 1.15 : 1
  const cap = QUOTE_CAPACITY[key]?.[mode]
  if (!cap) return false
  return (counts.total || 0) <= cap[0] && (counts.maxPer || 0) <= cap[1]
}

/**
 * Conta citações únicas do projeto (ou de um código) para decidir o modo.
 * @param {object} data projeto
 * @param {object} opts { focusCodeId }
 */
export function quoteCounts (data, opts = {}) {
  const excerpts = Array.isArray(data?.excerpts) ? data.excerpts : []
  const focusCodeId = opts.focusCodeId || null
  const byQuote = new Map()
  const perCode = new Map()
  for (const e of excerpts) {
    const key = String(e.quoteId || e.id)
    if (!byQuote.has(key)) byQuote.set(key, new Set())
    byQuote.get(key).add(e.codeId)
    if (!perCode.has(e.codeId)) perCode.set(e.codeId, new Set())
    perCode.get(e.codeId).add(key)
  }
  const scoped = focusCodeId ? (perCode.get(focusCodeId) || new Set()) : new Set(byQuote.keys())
  if (focusCodeId) return { total: scoped.size, maxPer: scoped.size }
  let maxPer = 0
  for (const set of perCode.values()) {
    if (set.size > maxPer) maxPer = set.size
  }
  return { total: scoped.size, maxPer }
}

const clip = (text, max) => {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}

/**
 * Monta nós e arestas a partir dos dados do projeto.
 * @param {object} data projeto (transcripts, codes, excerpts, quoteLinks, codeLinks)
 * @param {object} options { mode, showCodes, showQuotes, showDocs, maxQuotes, minDegree }
 */
export function buildNetwork (data, options = {}) {
  const {
    mode = 'coding',
    showCodes = true,
    showQuotes = true,
    showDocs = false,
    maxQuotes = 220,
    minDegree = 1,
    focusCodeId = null,
    quoteLimit = 0
  } = options

  const codes = Array.isArray(data?.codes) ? data.codes : []
  const excerpts = Array.isArray(data?.excerpts) ? data.excerpts : []
  const transcripts = Array.isArray(data?.transcripts) ? data.transcripts : []
  const quoteLinks = Array.isArray(data?.quoteLinks) ? data.quoteLinks : []
  const codeLinks = Array.isArray(data?.codeLinks) ? data.codeLinks : []
  const nodeLinks = Array.isArray(data?.nodeLinks) ? data.nodeLinks : []

  const codeById = new Map(codes.map((c) => [c.id, c]))
  const docById = new Map(transcripts.map((t) => [t.id, t]))

  const quoteKey = (e) => String(e.quoteId || e.id)
  // Citações únicas por código (o peso do código e o foco usam essa contagem,
  // não o número de linhas de excerpt).
  const codeQuotes = new Map()
  const allByQuote = new Map()
  for (const e of excerpts) {
    const key = quoteKey(e)
    if (!allByQuote.has(key)) allByQuote.set(key, [])
    allByQuote.get(key).push(e)
    if (!codeQuotes.has(e.codeId)) codeQuotes.set(e.codeId, new Set())
    codeQuotes.get(e.codeId).add(key)
  }
  const weightOf = (id) => (codeQuotes.get(id) || new Set()).size

  const nodes = []
  const edges = []
  const seen = new Set()

  const addNode = (node) => {
    if (seen.has(node.id)) return null
    seen.add(node.id)
    nodes.push(node)
    return node
  }
  const addEdge = (edge) => {
    if (edge.a === edge.b) return
    edges.push(edge)
  }

  // Visão de coocorrência (como a Code Co-occurrence Table do atlas.ti):
  // só códigos; a espessura da aresta é o número de trechos em que os dois
  // códigos aparecem juntos.
  if (mode === 'cooccurrence') {
    for (const c of codes) {
      addNode({
        id: 'c:' + c.id,
        kind: 'code',
        refId: c.id,
        label: c.name,
        color: c.color || '#4A90E2',
        weight: weightOf(c.id),
        parentId: c.parentId || null
      })
    }

    const byQuote = new Map()
    for (const e of excerpts) {
      if (!codeById.has(e.codeId)) continue
      const key = quoteKey(e)
      if (!byQuote.has(key)) byQuote.set(key, new Set())
      byQuote.get(key).add(e.codeId)
    }

    const pairs = new Map()
    for (const set of byQuote.values()) {
      const ids = [...set]
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const [a, b] = ids[i] < ids[j] ? [ids[i], ids[j]] : [ids[j], ids[i]]
          const key = a + '\u0000' + b
          pairs.set(key, (pairs.get(key) || 0) + 1)
        }
      }
    }
    for (const [key, weight] of pairs) {
      const [a, b] = key.split('\u0000')
      addEdge({ id: 'co:' + a + ':' + b, a: 'c:' + a, b: 'c:' + b, kind: 'cooccurrence', weight })
    }

    // Sem coocorrência não há o que mostrar: códigos isolados só poluem a figura.
    const degree = new Map()
    for (const e of edges) {
      degree.set(e.a, (degree.get(e.a) || 0) + 1)
      degree.set(e.b, (degree.get(e.b) || 0) + 1)
    }
    const connected = nodes.filter((n) => (degree.get(n.id) || 0) > 0)

    return {
      nodes: connected,
      edges,
      stats: {
        codes: connected.length,
        quotes: byQuote.size,
        docs: 0,
        links: edges.length,
        totalQuotes: byQuote.size,
        hiddenQuotes: 0,
        focusCodeId: null,
        focusName: null
      }
    }
  }

  if (showCodes) {
    for (const c of codes) {
      addNode({
        id: 'c:' + c.id,
        kind: 'code',
        refId: c.id,
        label: c.name,
        color: c.color || '#4A90E2',
        weight: weightOf(c.id),
        parentId: c.parentId || null
      })
    }
    for (const c of codes) {
      if (!c.parentId || !codeById.has(c.parentId)) continue
      addEdge({ id: 'h:' + c.id, a: 'c:' + c.parentId, b: 'c:' + c.id, kind: 'hierarchy' })
    }
    for (const l of codeLinks) {
      if (!codeById.has(l.from) || !codeById.has(l.to)) continue
      addEdge({ id: 'cl:' + (l.id || l.from + l.to), a: 'c:' + l.from, b: 'c:' + l.to, kind: 'codeLink', type: l.type, label: l.label || '' })
    }
  }

  // Escopo das citações: todo o projeto ou só as de um código em foco.
  const focusSet = focusCodeId ? (codeQuotes.get(focusCodeId) || new Set()) : null
  const scopedKeys = focusSet ? [...focusSet] : [...allByQuote.keys()]
  const totalScoped = scopedKeys.length
  const quoteCap = focusCodeId
    ? (quoteLimit > 0 ? quoteLimit : totalScoped)
    : Math.max(0, maxQuotes)

  const visibleCodeCounts = new Map()
  let visibleQuotes = 0

  if (showQuotes) {
    const ordered = scopedKeys
      .map((key) => {
        const list = allByQuote.get(key) || []
        return { key, list, at: list[0]?.createdAt || '' }
      })
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, quoteCap)

    visibleQuotes = ordered.length

    for (const { key, list } of ordered) {
      const first = list[0]
      const doc = docById.get(first.transcriptId)
      addNode({
        id: 'q:' + key,
        kind: 'quote',
        refId: key,
        label: clip(first.text, 48),
        text: first.text || '',
        color: codeById.get(first.codeId)?.color || '#8a97a8',
        weight: list.length,
        transcriptId: first.transcriptId,
        docName: doc?.name || '',
        codeIds: list.map((e) => e.codeId),
        page: first.page || first.pages?.[0] || null
      })
      for (const e of list) {
        visibleCodeCounts.set(e.codeId, (visibleCodeCounts.get(e.codeId) || 0) + 1)
        if (showCodes && codeById.has(e.codeId)) {
          addEdge({ id: 'e:' + e.id, a: 'q:' + key, b: 'c:' + e.codeId, kind: 'codes' })
        }
        if (showDocs && docById.has(e.transcriptId)) {
          addEdge({ id: 'd:' + e.id, a: 'q:' + key, b: 'd:' + e.transcriptId, kind: 'inDoc' })
        }
      }
    }

    for (const l of quoteLinks) {
      const a = 'q:' + l.from
      const b = 'q:' + l.to
      if (!seen.has(a) || !seen.has(b)) continue
      addEdge({ id: 'ql:' + (l.id || l.from + l.to), a, b, kind: 'quoteLink', type: l.type, label: l.label || '' })
    }
  }

  if (showDocs) {
    const docCount = new Map()
    for (const e of excerpts) docCount.set(e.transcriptId, (docCount.get(e.transcriptId) || 0) + 1)
    for (const t of transcripts) {
      addNode({
        id: 'd:' + t.id,
        kind: 'doc',
        refId: t.id,
        label: t.name,
        color: '#8a97a8',
        weight: docCount.get(t.id) || 0
      })
    }
  }

  // Vínculos mistos (código↔trecho, código↔documento) usam ids de nó.
  for (const l of nodeLinks) {
    if (!seen.has(l.from) || !seen.has(l.to)) continue
    addEdge({
      id: 'nl:' + (l.id || l.from + l.to),
      a: l.from,
      b: l.to,
      kind: 'nodeLink',
      type: l.type,
      label: l.label || ''
    })
  }

  // Remove nós isolados abaixo do grau mínimo (ruído em redes grandes).
  let filtered = nodes
  if (minDegree > 1) {
    const degree = new Map()
    for (const e of edges) {
      degree.set(e.a, (degree.get(e.a) || 0) + 1)
      degree.set(e.b, (degree.get(e.b) || 0) + 1)
    }
    const keep = new Set(nodes.filter((n) => n.kind === 'doc' || (degree.get(n.id) || 0) >= minDegree).map((n) => n.id))
    filtered = nodes.filter((n) => keep.has(n.id))
    for (let i = edges.length - 1; i >= 0; i--) {
      if (!keep.has(edges[i].a) || !keep.has(edges[i].b)) edges.splice(i, 1)
    }
  }

  const codeCounts = {}
  const codeTotals = {}
  for (const c of codes) {
    codeCounts[c.id] = visibleCodeCounts.get(c.id) || 0
    codeTotals[c.id] = weightOf(c.id)
  }

  return {
    nodes: filtered,
    edges,
    stats: {
      codes: filtered.filter((n) => n.kind === 'code').length,
      quotes: filtered.filter((n) => n.kind === 'quote').length,
      docs: filtered.filter((n) => n.kind === 'doc').length,
      links: edges.length,
      totalQuotes: showQuotes ? totalScoped : 0,
      hiddenQuotes: showQuotes ? Math.max(0, totalScoped - visibleQuotes) : 0,
      focusCodeId: focusCodeId || null,
      focusName: focusCodeId ? (codeById.get(focusCodeId)?.name || null) : null,
      codeCounts,
      codeTotals
    }
  }
}

/** Raio do nó conforme o tipo e o número de relações. */
export function nodeRadius (node) {
  if (node.kind === 'quote') return node.dotRadius || 4
  if (node.kind === 'doc') return 7 + Math.min(9, Math.sqrt(node.weight || 0) * 1.6)
  const box = nodeSize(node)
  return box.h / 2
}

/* Códigos e citações viram caixas, como no atlas.ti. */
const CODE_FONT = 12
const CODE_PAD_X = 12
const CODE_MIN_W = 64
const CODE_MAX_W = 168
const CODE_BASE_H = 28
const CODE_MAX_CHARS = 20
const CODE_PER_LINE = 20

/** Quebra o texto em linhas curtas, sem cortar palavras quando dá. */
function wrapLines (text, perLine, maxLines) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    if (!line) {
      line = word
    } else if ((line + ' ' + word).length <= perLine) {
      line += ' ' + word
    } else {
      lines.push(line)
      line = word
      if (lines.length === maxLines) break
    }
  }
  if (line && lines.length < maxLines) lines.push(line)
  if (!lines.length) return ['']
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const last = lines[maxLines - 1]
    lines[maxLines - 1] = last.length > perLine - 1 ? last.slice(0, perLine - 1) + '…' : last + '…'
  }
  return lines
}

/**
 * Calcula o tamanho de cada nó uma única vez. A decisão fica gravada no
 * próprio nó (`box`), então layout, bordas, tela e SVG usam a mesma medida.
 *
 * @param {Array} nodes
 * @param {object} opts { quotes: 'dot' | 'short' | 'text', scale: number }
 */
export function sizeNodes (nodes, opts = {}) {
  const { quotes = 'short', scale = 1, print = false } = opts
  const codeFont = print ? 20 : CODE_FONT * scale
  const codePerLine = print ? 16 : CODE_PER_LINE
  const codeMinW = print ? 118 : CODE_MIN_W * scale
  const codeMaxW = print ? 260 : CODE_MAX_W * scale
  const codePad = print ? 16 : CODE_PAD_X * scale
  const quoteFont = print ? 16 : 9.5 * Math.min(scale, 1.12)
  const dotRadius = scale >= 1.1 ? 6 : scale <= 0.9 ? 4 : 5

  for (const n of nodes) {
    if (n.kind === 'code') {
      // Nomes longos quebram em duas linhas em vez de esticar a caixa.
      const lines = wrapLines(n.label || '', codePerLine, 2)
      const longest = lines.reduce((m, l) => Math.max(m, l.length), 0)
      n.box = {
        w: Math.round(Math.max(
          codeMinW,
          Math.min(codeMaxW, longest * codeFont * 0.62 + codePad * 2)
        )),
        h: Math.round((print ? 46 : CODE_BASE_H * scale) + Math.min(8, Math.sqrt(n.weight || 0) * 1.6) + (lines.length - 1) * codeFont * 1.3),
        radius: Math.max(5, 7 * (print ? 1.2 : scale)),
        font: codeFont
      }
      n.lines = lines
    } else if (n.kind === 'quote') {
      if (quotes === 'dot') {
        n.box = null
        n.lines = []
        n.dotRadius = dotRadius
        continue
      }
      const full = quotes === 'text'
      const perLine = print ? 22 : full ? 26 : 28
      const maxLines = print ? (full ? 3 : 1) : full ? 3 : 1
      const lines = wrapLines(n.text || n.label || '', perLine, maxLines)
      const longest = lines.reduce((m, l) => Math.max(m, l.length), 0)
      n.box = {
        w: Math.round(Math.max((print ? 150 : 84) * (print ? 1 : scale), longest * quoteFont * 0.55 + (print ? 24 : 18))),
        h: Math.round(lines.length * quoteFont * 1.4 + (print ? 22 : 13)),
        radius: Math.max(4, 5 * (print ? 1.2 : scale)),
        font: quoteFont
      }
      n.lines = lines
    } else {
      n.box = null
      n.lines = []
    }
  }
  return nodes
}

/**
 * Dimensões da caixa de um nó. Trechos em modo ponto e documentos
 * continuam círculos e devolvem null.
 * @returns {{w:number,h:number,radius:number,font:number}|null}
 */
export function nodeSize (node) {
  if (node.box !== undefined) return node.box || null
  if (node.kind !== 'code') return null
  const text = clip(node.label || '', CODE_MAX_CHARS)
  const raw = text.length * CODE_FONT * 0.62 + CODE_PAD_X * 2
  return {
    w: Math.round(Math.max(CODE_MIN_W, Math.min(CODE_MAX_W, raw))),
    h: Math.round(CODE_BASE_H + Math.min(8, Math.sqrt(node.weight || 0) * 1.6)),
    radius: 7,
    font: CODE_FONT
  }
}

/** Meia largura e meia altura usadas no afastamento dos nós. */
function nodeHalf (node) {
  const box = nodeSize(node)
  if (box) return { hw: box.w / 2, hh: box.h / 2 }
  const r = nodeRadius(node)
  return { hw: r, hh: r }
}

/** Algum par de caixas ainda se sobrepõe? */
function hasOverlap (nodes) {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]
    const ha = nodeHalf(a)
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j]
      const hb = nodeHalf(b)
      if (Math.abs(b.x - a.x) < ha.hw + hb.hw - 0.5 &&
          Math.abs(b.y - a.y) < ha.hh + hb.hh - 0.5) return true
    }
  }
  return false
}

/**
 * Separa pares que continuam quase na mesma linha depois do resolvedor.
 * Empurrar no eixo vertical, nesse caso, não cabe na coluna; mover no eixo
 * horizontal usa o espaço vazio ao lado. Roda antes do ajuste final.
 */
function spreadThinOverlaps (nodes, opts = {}) {
  const { width = 0, height = 0, margin = 12, gap = 12, passes = 40 } = opts
  const n = nodes.length
  if (!width || !height || n < 2) return nodes
  const half = new Array(n)
  for (let i = 0; i < n; i++) half[i] = nodeHalf(nodes[i])
  const cx = width / 2

  for (let p = 0; p < passes; p++) {
    let moved = false
    for (let i = 0; i < n; i++) {
      const a = nodes[i]
      const ha = half[i]
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]
        const hb = half[j]
        const ox = ha.hw + hb.hw - Math.abs(b.x - a.x)
        const oy = ha.hh + hb.hh - Math.abs(b.y - a.y)
        if (ox <= 0.5 || oy <= 0.5) continue
        // Só atua em sobreposições rasas (caixas quase lado a lado).
        if (oy > Math.min(30, Math.min(ha.hh, hb.hh) * 0.7)) continue

        // Empurra para fora o nó mais afastado do centro; a figura cresce para
        // as laterais, onde há espaço, em vez de comprimir a coluna.
        const outerFirst = Math.abs(b.x - cx) >= Math.abs(a.x - cx)
        const order = outerFirst ? [[b, hb], [a, ha]] : [[a, ha], [b, hb]]
        for (const [node, h] of order) {
          const dir = node.x >= cx ? 1 : -1
          const room = dir > 0 ? width - margin - h.hw - node.x : node.x - margin - h.hw
          if (room < gap) continue
          node.x += dir * Math.min(ox + gap, room)
          node.x = Math.max(margin + h.hw, Math.min(width - margin - h.hw, node.x))
          moved = true
          break
        }
      }
    }
    if (!moved) break
  }
  return nodes
}
/**
 * Afasta nós que se sobrepõem, respeitando o tamanho de cada um.
 * Determinístico: roda sempre na mesma ordem, sem aleatoriedade.
 */
export function resolveOverlaps (nodes, opts = {}) {
  const { gap = 12, passes = 120, width = 0, height = 0, margin = 12, pinned = null } = opts
  const n = nodes.length
  const shiftX = new Float64Array(n)
  const shiftY = new Float64Array(n)
  const half = new Array(n)
  for (let i = 0; i < n; i++) half[i] = nodeHalf(nodes[i])

  for (let p = 0; p < passes; p++) {
    let moved = false
    shiftX.fill(0)
    shiftY.fill(0)

    // Par a par. A rede é limitada a ~250 nós, então comparar todos os pares
    // custa menos do que montar uma grade a cada passada.
    for (let i = 0; i < n; i++) {
      const a = nodes[i]
      const ha = half[i]
      const aFixed = pinned?.has(a.id)
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]
        const hb = half[j]
        const minX = ha.hw + hb.hw + gap
        const minY = ha.hh + hb.hh + gap
        const dx = b.x - a.x
        const dy = b.y - a.y
        if (Math.abs(dx) >= minX || Math.abs(dy) >= minY) continue
        const bFixed = pinned?.has(b.id)
        if (aFixed && bFixed) continue
        const ox2 = minX - Math.abs(dx)
        const oy2 = minY - Math.abs(dy)
        const wa = aFixed ? 0 : bFixed ? 1 : 0.5
        const wb = bFixed ? 0 : aFixed ? 1 : 0.5
        moved = true
        if (ox2 < oy2) {
          const s = dx >= 0 ? 1 : -1
          shiftX[i] -= ox2 * wa * s
          shiftX[j] += ox2 * wb * s
        } else {
          const s = dy >= 0 ? 1 : -1
          shiftY[i] -= oy2 * wa * s
          shiftY[j] += oy2 * wb * s
        }
      }
    }

    if (!moved) break
    // Aplica só parte do deslocamento: tudo de uma vez faz os nós oscilarem.
    const relax = 0.55
    for (let i = 0; i < n; i++) {
      const node = nodes[i]
      if (pinned?.has(node.id)) continue
      if (!shiftX[i] && !shiftY[i]) continue
      const { hw, hh } = half[i]
      let nx = node.x + shiftX[i] * relax
      let ny = node.y + shiftY[i] * relax
      if (width && height) {
        nx = Math.max(margin + hw, Math.min(width - margin - hw, nx))
        ny = Math.max(margin + hh, Math.min(height - margin - hh, ny))
      }
      node.x = nx
      node.y = ny
    }
  }
  return nodes
}

const EDGE_STYLE = {
  codes: { color: '#a9bacd', width: 1 },
  hierarchy: { color: '#c7cdd6', width: 1.4, dash: '5 4' },
  codeLink: { color: '#7d95b4', width: 1.6, dash: '2 3' },
  quoteLink: { color: '#c9a227', width: 1.5, dash: '6 3' },
  inDoc: { color: '#dde3ea', width: 1 },
  cooccurrence: { color: '#8fa6c0', width: 1.2 },
  nodeLink: { color: '#9a8bc4', width: 1.6, dash: '2 3' }
}

export function edgeStyle (edge) {
  return EDGE_STYLE[edge.kind] || EDGE_STYLE.codes
}

/** Espessura da linha: coocorrência cresce com o número de trechos compartilhados. */
export function edgeWidth (edge) {
  if (edge.kind === 'cooccurrence') {
    return 1 + Math.min(5, Math.log2(1 + Math.max(1, edge.weight || 1)) * 1.7)
  }
  return edgeStyle(edge).width
}

/**
 * Onde escrever o rótulo de uma aresta: no meio, deslocado para cima, e
 * deslizado ao longo da linha quando cai em cima de um nó. Evita que os
 * nomes dos vínculos se percam atrás das caixas.
 */
export function edgeLabelPos (a, b, nodes = []) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy) || 1
  let nx = -dy / d
  let ny = dx / d
  if (ny > 0) { nx = -nx; ny = -ny }
  const gap = 8
  const hits = (x, y) => nodes.some((n) => {
    if (n === a || n === b) return false
    const box = nodeSize(n)
    if (box) {
      return Math.abs(x - n.x) < box.w / 2 + 4 && Math.abs(y - n.y) < box.h / 2 + 4
    }
    const r = nodeRadius(n)
    return Math.hypot(x - n.x, y - n.y) < r + 4
  })
  for (const t of [0.5, 0.62, 0.38, 0.72, 0.28]) {
    const x = a.x + dx * t + nx * gap
    const y = a.y + dy * t + ny * gap
    if (!hits(x, y)) return { x, y }
  }
  return { x: a.x + dx * 0.5 + nx * gap, y: a.y + dy * 0.5 + ny * gap }
}

/** Texto curto de um vínculo nomeado, para rótulos na figura. */
export const RELATION_TEXT = {
  associado: 'associado a',
  parte: 'é parte de',
  contém: 'contém',
  contradiz: 'contradiz',
  explica: 'explica',
  precede: 'precede',
  exemplifica: 'exemplifica',
  retoma: 'retoma'
}

/** Arestas que têm direção e, por isso, recebem seta. */
export function isDirected (edge) {
  return edge.kind === 'hierarchy' || edge.kind === 'codeLink' || edge.kind === 'quoteLink' || edge.kind === 'nodeLink'
}

/**
 * Encurta a linha até a borda do nó de destino, para a seta não ficar
 * escondida embaixo do círculo.
 */
export function edgeGeometry (a, b, edge) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const d = Math.hypot(dx, dy) || 1
  let trim = 0
  if (isDirected(edge)) {
    const box = nodeSize(b)
    if (box) {
      const tx = Math.abs(dx) < 1e-6 ? Infinity : (box.w / 2) / Math.abs(dx)
      const ty = Math.abs(dy) < 1e-6 ? Infinity : (box.h / 2) / Math.abs(dy)
      trim = d * Math.min(tx, ty) + 4
    } else {
      trim = nodeRadius(b) + 3
    }
  }
  return {
    x1: a.x,
    y1: a.y,
    x2: b.x - (dx / d) * trim,
    y2: b.y - (dy / d) * trim,
    midX: (a.x + b.x) / 2,
    midY: (a.y + b.y) / 2
  }
}

/**
 * Posição e alinhamento do rótulo, mantendo o texto dentro da figura.
 * Códigos e citações em caixa levam o texto para dentro; documentos à direita.
 */
export function nodeLabelLayout (n, width = 1000) {
  const box = nodeSize(n)

  // Nome do código e trecho da citação ficam dentro da caixa.
  if (box) {
    const lines = n.lines && n.lines.length ? n.lines : [clip(n.label || '', CODE_MAX_CHARS)]
    const lineHeight = box.font * (n.kind === 'quote' ? 1.4 : 1.3)
    const first = n.y - ((lines.length - 1) * lineHeight) / 2 + box.font * 0.35
    return {
      x: n.x,
      y: first,
      anchor: 'middle',
      size: box.font,
      weight: n.kind === 'code' ? 600 : 400,
      inside: true,
      lines,
      lineHeight
    }
  }

  const size = n.kind === 'doc' ? 11 : 10
  const weight = 400
  const text = String(n.label || '')
  const w = text.length * size * 0.56
  const r = nodeRadius(n)

  if (n.kind === 'quote') {
    let x = n.x + r + 6
    let anchor = 'start'
    if (x + w > width - 4) {
      x = n.x - r - 6
      anchor = 'end'
    }
    return { x, y: n.y + 4, anchor, size, weight }
  }

  let x = n.x
  let anchor = 'middle'
  if (n.x - w / 2 < 4) {
    x = 4
    anchor = 'start'
  } else if (n.x + w / 2 > width - 4) {
    x = width - 4
    anchor = 'end'
  }
  return { x, y: n.y + 4, anchor, size, weight }
}

const ARROW_ID = {
  hierarchy: 'arrow-hierarchy',
  codeLink: 'arrow-code',
  quoteLink: 'arrow-quote',
  nodeLink: 'arrow-node'
}

/**
 * Posições iniciais determinísticas.
 * Com códigos na rede, cada código ocupa um lugar na elipse central e os
 * trechos nascem ao redor do código que os marca — a força apenas acomoda
 * as distâncias, em vez de espalhar tudo sem estrutura.
 */
function seedPositions (nodes, edges, width, height, seed = 0) {
  const cx = width / 2
  const cy = height / 2
  const codes = nodes
    .filter((n) => n.kind === 'code')
    .sort((a, b) => (b.weight || 0) - (a.weight || 0) || String(a.label).localeCompare(String(b.label)))
  const quotes = nodes.filter((n) => n.kind === 'quote')
  const docs = nodes.filter((n) => n.kind === 'doc')

  for (const n of nodes) { n.vx = 0; n.vy = 0 }

  if (codes.length >= 2 && quotes.length) {
    const rx = width * 0.29
    const ry = height * 0.27
    const shift = seed % codes.length
    codes.forEach((n, i) => {
      const a = (((i + shift) % codes.length) / codes.length) * Math.PI * 2 - Math.PI / 2
      n.x = cx + Math.cos(a) * rx
      n.y = cy + Math.sin(a) * ry
    })
    const byId = new Map(codes.map((n) => [n.id, n]))
    const anchor = new Map()
    for (const e of edges) {
      if (e.kind !== 'codes') continue
      const code = e.a.startsWith('c:') ? e.a : e.b.startsWith('c:') ? e.b : null
      const quote = e.a.startsWith('q:') ? e.a : e.b.startsWith('q:') ? e.b : null
      if (code && quote && byId.has(code) && !anchor.has(quote)) anchor.set(quote, byId.get(code))
    }
    const perCode = new Map()
    for (const q of quotes) {
      const code = anchor.get(q.id)
      const idx = code ? (perCode.get(code.id) || 0) : 0
      if (code) perCode.set(code.id, idx + 1)
      const ring = Math.floor(idx / 8)
      const radius = 108 + ring * 74
      const angle = idx * GOLDEN + (code ? 0.4 : 0) + seed * 0.9
      const baseX = code ? code.x : cx
      const baseY = code ? code.y : cy
      q.x = baseX + Math.cos(angle) * radius
      q.y = baseY + Math.sin(angle) * radius * 0.82
    }
    docs.forEach((n, i) => {
      const a = (i / Math.max(1, docs.length)) * Math.PI * 2 + Math.PI / 9
      n.x = cx + Math.cos(a) * width * 0.42
      n.y = cy + Math.sin(a) * height * 0.4
    })
    return
  }

  const maxR = Math.min(width, height) * 0.42
  nodes.forEach((n, i) => {
    const angle = i * GOLDEN + seed * 1.3
    const r = nodes.length === 1 ? 0 : Math.sqrt((i + 0.5) / nodes.length) * maxR
    n.x = cx + Math.cos(angle) * r
    n.y = cy + Math.sin(angle) * r
  })
}

/**
 * Layout de forças com resfriamento. Roda de forma síncrona e determinística.
 * @param {Array} nodes nós (mutados com x/y)
 * @param {Array} edges arestas
 * @param {object} opts { width, height, iterations, padding }
 */
export function layoutNetwork (nodes, edges, opts = {}) {
  const { width = 1000, height = 700, padding = 74, initial = null, seed = 0 } = opts
  if (!nodes.length) return nodes
  if (initial) {
    // Reaproveita o arranjo anterior: ao mudar tamanho ou modo de citação os
    // nós apenas se acomodam, em vez de saltar para posições novas.
    for (const n of nodes) {
      const prev = initial.get(n.id)
      if (prev) {
        n.x = prev.x
        n.y = prev.y
        n.vx = 0
        n.vy = 0
      }
    }
    // Nós novos (filtro recém-ligado) entram perto do centro, sem bagunçar o resto.
    nodes.filter((n) => typeof n.x !== 'number' || typeof n.y !== 'number')
      .forEach((n, i) => {
        const angle = i * GOLDEN
        n.x = width / 2 + Math.cos(angle) * (36 + i * 14)
        n.y = height / 2 + Math.sin(angle) * (36 + i * 14)
        n.vx = 0
        n.vy = 0
      })
  } else {
    seedPositions(nodes, edges, width, height, seed)
  }
  const iterations = opts.iterations ?? (initial ? 120 : 160)

  const index = new Map(nodes.map((n, i) => [n.id, i]))
  const ideal = (edge) => {
    if (edge.kind === 'codes') return 132
    if (edge.kind === 'hierarchy') return 124
    if (edge.kind === 'inDoc') return 128
    return 112
  }
  const linkList = edges
    .map((e) => ({ a: index.get(e.a), b: index.get(e.b), d: ideal(e) }))
    .filter((e) => e.a !== undefined && e.b !== undefined)

  const n = nodes.length
  const cx = width / 2
  const cy = height / 2
  const repel = n > 120 ? 2400 : n > 40 ? 3000 : n > 16 ? 3000 : 2100
  const gravity = n <= 10 ? 0.011 : 0.005

  // Com códigos e trechos, os códigos ficam ancorados em uma elipse regular:
  // a rede mantém a mesma estrutura a cada reorganização, em vez de virar um nó
  // embaralhado. Os trechos continuam livres ao redor.
  const codeNodes = nodes
    .filter((node) => node.kind === 'code')
    .sort((a, b) => (b.weight || 0) - (a.weight || 0) || String(a.label).localeCompare(String(b.label)))
  const hasQuotes = nodes.some((node) => node.kind === 'quote')
  const anchors = new Map()
  if (!initial && codeNodes.length >= 2 && hasQuotes) {
    const maxW = codeNodes.reduce((m, node) => Math.max(m, nodeHalf(node).hw * 2), 0)
    const maxH = codeNodes.reduce((m, node) => Math.max(m, nodeHalf(node).hh * 2), 0)
    const rx = Math.max(width * 0.27, (codeNodes.length * (maxW + 36)) / (Math.PI * 2))
    const ry = Math.max(height * 0.23, (codeNodes.length * (maxH + 44)) / (Math.PI * 2))
    codeNodes.forEach((node, i) => {
      const a = (((i + (seed % codeNodes.length)) % codeNodes.length) / codeNodes.length) * Math.PI * 2 - Math.PI / 2
      anchors.set(node.id, { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry })
    })
  }

  for (let it = 0; it < iterations; it++) {
    const cool = 1 - it / iterations

    for (let i = 0; i < n; i++) {
      const a = nodes[i]
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j]
        let dx = a.x - b.x
        let dy = a.y - b.y
        let d2 = dx * dx + dy * dy
        if (d2 < 0.01) { dx = 0.7 + i * 0.01; dy = 0.7; d2 = dx * dx + dy * dy }
        const d = Math.sqrt(d2)
        const f = (repel / d2) * cool
        const ux = (dx / d) * f
        const uy = (dy / d) * f
        a.vx += ux; a.vy += uy
        b.vx -= ux; b.vy -= uy
      }
    }

    for (const l of linkList) {
      const a = nodes[l.a]
      const b = nodes[l.b]
      const dx = b.x - a.x
      const dy = b.y - a.y
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01
      const f = ((d - l.d) / d) * 0.06 * cool
      const ux = dx * f
      const uy = dy * f
      a.vx += ux; a.vy += uy
      b.vx -= ux; b.vy -= uy
    }

    for (const node of nodes) {
      const anchor = anchors.get(node.id)
      if (anchor) {
        node.vx += (anchor.x - node.x) * 0.38 * cool
        node.vy += (anchor.y - node.y) * 0.38 * cool
      } else {
        node.vx += (cx - node.x) * gravity * cool
        node.vy += (cy - node.y) * gravity * cool
      }
      const damp = 0.72
      node.vx *= damp
      node.vy *= damp
      node.x += Math.max(-24, Math.min(24, node.vx))
      node.y += Math.max(-24, Math.min(24, node.vy))
      node.x = Math.max(padding, Math.min(width - padding, node.x))
      node.y = Math.max(padding, Math.min(height - padding, node.y))
    }
  }

  // Os códigos ocupam posições fixas na elipse; os trechos se acomodam ao
  // redor. A separação roda em coordenadas de tela, então cada caixa ocupa
  // exatamente o espaço que ocupa na figura.
  resolveOverlaps(nodes, {
    width,
    height,
    gap: 18,
    passes: 240,
    margin: padding
  })

  // Colunas quase alinhadas podem ficar presas com uma sobreposição fina.
  // Nesse caso, abrir no eixo horizontal usa o espaço ao lado; o resolvedor
  // abaixo limpa o que sobrar com a folga normal. Só vale para redes pequenas
  // (as figuras de artigo); em redes densas o custo não compensa.
  if (nodes.length <= 60 && hasOverlap(nodes)) {
    spreadThinOverlaps(nodes, {
      width,
      height,
      gap: 12,
      passes: 40,
      margin: padding
    })
    resolveOverlaps(nodes, {
      width,
      height,
      gap: 12,
      passes: 240,
      margin: padding
    })
  }

  // Se sobrou espaço, amplia o conjunto (nunca reduz): assim a figura ocupa a
  // área disponível sem aproximar caixas e criar sobreposição.
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const node of nodes) {
    const { hw, hh } = nodeHalf(node)
    minX = Math.min(minX, node.x - hw)
    maxX = Math.max(maxX, node.x + hw)
    minY = Math.min(minY, node.y - hh)
    maxY = Math.max(maxY, node.y + hh)
  }
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  // Amplia cada eixo separadamente: afastar nunca cria sobreposição e a
  // figura aproveita toda a área em vez de sobrar margem nas laterais.
  const growX = Math.min((width - padding * 2) / spanX, 3)
  const growY = Math.min((height - padding * 2) / spanY, 3)
  if (growX > 1.02 || growY > 1.02) {
    const offX = padding + (width - padding * 2 - spanX * growX) / 2
    const offY = padding + (height - padding * 2 - spanY * growY) / 2
    for (const node of nodes) {
      node.x = offX + (node.x - minX) * growX
      node.y = offY + (node.y - minY) * growY
    }
  }
  for (const node of nodes) {
    delete node.vx
    delete node.vy
  }
  return nodes
}

/** Layout radial: códigos no centro, trechos em anéis. */
export function layoutRadial (nodes, edges, opts = {}) {
  const { width = 1000, height = 700, padding = 74 } = opts
  if (!nodes.length) return nodes
  const cx = width / 2
  const cy = height / 2
  const codes = nodes.filter((n) => n.kind === 'code')
  const docs = nodes.filter((n) => n.kind === 'doc')
  const quotes = nodes.filter((n) => n.kind === 'quote')

  const minSide = Math.min(width, height)
  const codeWidths = codes.reduce((sum, n) => sum + (nodeSize(n)?.w || 64) + 18, 0)
  const codeRing = codes.length === 1
    ? 0
    : Math.min(minSide * 0.32, Math.max(minSide * 0.18, codeWidths / (Math.PI * 2)))
  codes.forEach((n, i) => {
    const a = (i / Math.max(1, codes.length)) * Math.PI * 2 - Math.PI / 2
    n.x = cx + Math.cos(a) * codeRing
    n.y = cy + Math.sin(a) * codeRing
  })

  const neighbor = new Map()
  for (const e of edges) {
    const a = nodes.find((n) => n.id === e.a)
    const b = nodes.find((n) => n.id === e.b)
    if (!a || !b) continue
    if (a.kind === 'quote' && b.kind === 'code') { if (!neighbor.has(a.id)) neighbor.set(a.id, b); continue }
    if (b.kind === 'quote' && a.kind === 'code') { if (!neighbor.has(b.id)) neighbor.set(b.id, a) }
  }

  const ringR = Math.min(width, height) * 0.38 + codeRing * 0.4
  quotes.forEach((n, i) => {
    const anchor = neighbor.get(n.id)
    const base = anchor
      ? Math.atan2(anchor.y - cy, anchor.x - cx)
      : (i / Math.max(1, quotes.length)) * Math.PI * 2
    const spread = (i % 7) * 0.06 - 0.18
    const jitter = (i % 5) * 0.03
    const a = base + spread + jitter
    n.x = cx + Math.cos(a) * (ringR * (0.72 + (i % 3) * 0.12))
    n.y = cy + Math.sin(a) * (ringR * (0.72 + (i % 3) * 0.12))
  })

  const docR = Math.min(width, height) * 0.47
  docs.forEach((n, i) => {
    const a = (i / Math.max(1, docs.length)) * Math.PI * 2 + Math.PI / 8
    n.x = cx + Math.cos(a) * docR
    n.y = cy + Math.sin(a) * docR
  })

  for (const node of nodes) {
    node.x = Math.max(padding, Math.min(width - padding, node.x))
    node.y = Math.max(padding, Math.min(height - padding, node.y))
  }
  resolveOverlaps(nodes, { width, height, gap: 18, passes: 140, margin: padding })
  return nodes
}

const escapeXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

/**
 * Gera um SVG autocontido da rede, pronto para exportar como figura.
 * @param {Array} nodes com x/y
 * @param {Array} edges
 * @param {object} opts { width, height, title, subtitle, showLabels }
 */
/**
 * Fundo claro para a caixa do código (cor do código a ~24% sobre branco).
 * O texto escuro fica legível com qualquer cor (contraste ≥ 7:1); a cor
 * do código aparece na borda.
 */
export function codeFill (color, amount = 0.24) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color || '').trim())
  if (!m) return '#eef2f8'
  const n = parseInt(m[1], 16)
  const mix = (c) => Math.round(255 - (255 - c) * amount)
  const r = mix((n >> 16) & 255); const g = mix((n >> 8) & 255); const b = mix(n & 255)
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

export function networkSvg (nodes, edges, opts = {}) {
  const {
    width = 1400,
    height = 900,
    title = '',
    subtitle = '',
    showLabels = true,
    showEdgeLabels = showLabels,
    scale = 1,
    background = '#ffffff',
    print = false,
    totalQuotes = 0,
    hiddenQuotes = 0,
    focusLabel = ''
  } = opts

  const titleSize = print ? 30 : 28
  const subtitleSize = print ? 15 : 13
  const footerSize = print ? 15 : 12
  const edgeFont = print ? 15 : 10.5

  // Área útil: evita que nós encostem no título ou no rodapé da figura.
  const top = title ? 104 : 24
  const bottom = 64
  const k = Math.min(1, (height - top - bottom) / height)
  const offsetX = (width - width * k) / 2
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const edgeLines = edges.map((e) => {
    const a = byId.get(e.a)
    const b = byId.get(e.b)
    if (!a || !b) return ''
    const style = edgeStyle(e)
    const dash = style.dash ? ` stroke-dasharray="${style.dash}"` : ''
    const g = edgeGeometry(a, b, e)
    const marker = isDirected(e) ? ` marker-end="url(#${ARROW_ID[e.kind]})"` : ''
    return `<line x1="${g.x1.toFixed(1)}" y1="${g.y1.toFixed(1)}" x2="${g.x2.toFixed(1)}" y2="${g.y2.toFixed(1)}" stroke="${style.color}" stroke-width="${edgeWidth(e)}"${dash}${marker} />`
  }).join('')

  const edgeLabels = showEdgeLabels
    ? edges.map((e) => {
        if (!e.type || e.kind === 'hierarchy') return ''
        const a = byId.get(e.a)
        const b = byId.get(e.b)
        if (!a || !b) return ''
        const pos = edgeLabelPos(a, b, nodes)
        return `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${edgeFont}" fill="#4b5563" stroke="#ffffff" stroke-width="3" paint-order="stroke">${escapeXml(e.label || RELATION_TEXT[e.type] || e.type)}</text>`
      }).join('')
    : ''

  const nodeShapes = nodes.map((n) => {
    const box = nodeSize(n)
    if (box) {
      const x = (n.x - box.w / 2).toFixed(1)
      const y = (n.y - box.h / 2).toFixed(1)
      if (n.kind === 'quote') {
        // Cartão de citação: fundo branco, borda na cor do código e faixa à esquerda.
        return `<g><rect x="${x}" y="${y}" width="${box.w}" height="${box.h}" rx="${box.radius}" fill="#ffffff" stroke="${n.color}" stroke-width="${print ? 1.9 : 1.1}" /><rect x="${x}" y="${y}" width="${print ? 5 : 3}" height="${box.h}" rx="1.5" fill="${n.color}" /></g>`
      }
      const ring = `<rect x="${(n.x - box.w / 2 - 2.5).toFixed(1)}" y="${(n.y - box.h / 2 - 2.5).toFixed(1)}" width="${box.w + 5}" height="${box.h + 5}" rx="${box.radius + 2}" fill="none" stroke="${n.color}" stroke-opacity="0.3" stroke-width="${print ? 2 : 1.4}" />`
      return `<g><rect x="${x}" y="${y}" width="${box.w}" height="${box.h}" rx="${box.radius}" fill="${codeFill(n.color)}" stroke="${n.color}" stroke-width="${print ? 2.4 : 1.8}" />${ring}</g>`
    }
    const r = nodeRadius(n)
    const opacity = n.kind === 'quote' ? 0.85 : 1
    return `<g><circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${n.color}" fill-opacity="${opacity}" stroke="#ffffff" stroke-width="${n.kind === 'quote' ? 0.8 : 1.6}" /></g>`
  }).join('')

  const labels = showLabels
    ? nodes.map((n) => {
        const pos = nodeLabelLayout(n, width)
        if (n.kind === 'quote' && !pos.inside && !n.selected) return ''
        const color = pos.inside
          ? (n.kind === 'quote' ? '#374151' : CODE_TEXT_COLOR)
          : n.kind === 'quote' ? '#4b5563' : '#1f2937'
        const family = 'Helvetica Neue, Helvetica, Arial, sans-serif'
        if (pos.inside && pos.lines.length > 1) {
          const spans = pos.lines.map((line, i) =>
            `<tspan x="${pos.x.toFixed(1)}" y="${(pos.y + i * pos.lineHeight).toFixed(1)}">${escapeXml(line)}</tspan>`
          ).join('')
          return `<text font-family="${family}" font-size="${pos.size.toFixed(1)}" font-weight="${pos.weight}" fill="${color}" text-anchor="middle">${spans}</text>`
        }
        const text = pos.inside ? pos.lines[0] : clip(n.label, 42)
        return `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" font-family="${family}" font-size="${pos.size.toFixed(1)}" font-weight="${pos.weight}" fill="${color}" text-anchor="${pos.anchor}">${escapeXml(text)}</text>`
      }).join('')
    : ''

  const stats = {
    codes: nodes.filter((n) => n.kind === 'code').length,
    quotes: nodes.filter((n) => n.kind === 'quote').length,
    docs: nodes.filter((n) => n.kind === 'doc').length
  }

  const shownQuotes = stats.quotes
  const quoteLabel = totalQuotes > shownQuotes
    ? `${shownQuotes} de ${totalQuotes} trechos`
    : `${shownQuotes} trechos`
  const focusNote = focusLabel ? ` · ${focusLabel}` : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * scale)}" height="${Math.round(height * scale)}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${background}" />
<defs>
  <marker id="arrow-code" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
    <path d="M0,0 L10,5 L0,10 z" fill="#7d95b4" />
  </marker>
  <marker id="arrow-quote" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
    <path d="M0,0 L10,5 L0,10 z" fill="#c9a227" />
  </marker>
  <marker id="arrow-hierarchy" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
    <path d="M0,0 L10,5 L0,10 z" fill="#b8c0cb" />
  </marker>
  <marker id="arrow-node" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
    <path d="M0,0 L10,5 L0,10 z" fill="#9a8bc4" />
  </marker>
</defs>
${title ? `<text x="56" y="${64}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${titleSize}" font-weight="700" fill="#15294b">${escapeXml(title)}</text>` : ''}
${subtitle ? `<text x="56" y="${92}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${subtitleSize}" fill="#4b5563">${escapeXml(subtitle)}</text>` : ''}
<g transform="translate(${offsetX.toFixed(1)}, ${top}) scale(${k.toFixed(4)})">${edgeLines}${edgeLabels}${nodeShapes}${labels}</g>
<g transform="translate(56, ${height - 44})">
  <text font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${footerSize}" fill="#4b5563">${stats.codes} códigos · ${quoteLabel}${stats.docs ? ` · ${stats.docs} documentos` : ''}${focusNote} · Codificando</text>
</g>
<g transform="translate(${width - (print ? 300 : 250)}, ${height - 48})" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${footerSize}" fill="#4b5563">
  <rect x="0" y="-12" width="18" height="13" rx="3" fill="${codeFill('#4A90E2')}" stroke="#4A90E2" stroke-width="1.4" />
  <text x="26" y="0">código</text>
  ${nodes.some((n) => n.kind === 'quote' && nodeSize(n))
    ? '<rect x="102" y="-11" width="18" height="12" rx="2" fill="#ffffff" stroke="#8a97a8" /><text x="128" y="0">trecho</text>'
    : '<circle cx="110" cy="-5" r="3.4" fill="#8a97a8" /><text x="122" y="0">trecho</text>'}
</g>
</svg>`
}
