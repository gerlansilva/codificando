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
    minDegree = 1
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
  const codeCount = new Map()
  for (const e of excerpts) codeCount.set(e.codeId, (codeCount.get(e.codeId) || 0) + 1)

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
        weight: codeCount.get(c.id) || 0,
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
        links: edges.length
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
        weight: codeCount.get(c.id) || 0,
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

  if (showQuotes) {
    const byQuote = new Map()
    for (const e of excerpts) {
      const key = quoteKey(e)
      if (!byQuote.has(key)) byQuote.set(key, [])
      byQuote.get(key).push(e)
    }

    const ordered = [...byQuote.entries()]
      .map(([key, list]) => ({ key, list, at: list[0]?.createdAt || '' }))
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, maxQuotes)

    for (const { key, list } of ordered) {
      const first = list[0]
      const doc = docById.get(first.transcriptId)
      addNode({
        id: 'q:' + key,
        kind: 'quote',
        refId: key,
        label: clip(first.text, 48),
        color: codeById.get(first.codeId)?.color || '#8a97a8',
        weight: list.length,
        transcriptId: first.transcriptId,
        docName: doc?.name || '',
        codeIds: list.map((e) => e.codeId),
        page: first.page || first.pages?.[0] || null
      })
      for (const e of list) {
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

  return {
    nodes: filtered,
    edges,
    stats: {
      codes: filtered.filter((n) => n.kind === 'code').length,
      quotes: filtered.filter((n) => n.kind === 'quote').length,
      docs: filtered.filter((n) => n.kind === 'doc').length,
      links: edges.length
    }
  }
}

/** Raio do nó conforme o tipo e o número de relações. */
export function nodeRadius (node) {
  if (node.kind === 'quote') return 4
  if (node.kind === 'doc') return 7 + Math.min(9, Math.sqrt(node.weight || 0) * 1.6)
  return 6 + Math.min(12, Math.sqrt(node.weight || 0) * 2.6)
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
  const trim = isDirected(edge) ? nodeRadius(b) + 3 : 0
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
 * Códigos ficam centralizados acima do nó; trechos e documentos à direita.
 */
export function nodeLabelLayout (n, width = 1000) {
  const size = n.kind === 'doc' ? 11 : n.kind === 'code' ? 12 : 10
  const weight = n.kind === 'code' ? 600 : 400
  const r = nodeRadius(n)
  const text = String(n.label || '')
  const w = text.length * size * 0.56

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
  return { x, y: n.kind === 'code' ? n.y - r - 9 : n.y + 4, anchor, size, weight }
}

const ARROW_ID = {
  hierarchy: 'arrow-hierarchy',
  codeLink: 'arrow-code',
  quoteLink: 'arrow-quote',
  nodeLink: 'arrow-node'
}

/** Posições iniciais em espiral (determinísticas). */
function seedPositions (nodes, width, height) {
  const cx = width / 2
  const cy = height / 2
  const maxR = Math.min(width, height) * 0.42
  nodes.forEach((n, i) => {
    const angle = i * GOLDEN
    const r = nodes.length === 1 ? 0 : Math.sqrt((i + 0.5) / nodes.length) * maxR
    n.x = cx + Math.cos(angle) * r
    n.y = cy + Math.sin(angle) * r
    n.vx = 0
    n.vy = 0
  })
}

/**
 * Layout de forças com resfriamento. Roda de forma síncrona e determinística.
 * @param {Array} nodes nós (mutados com x/y)
 * @param {Array} edges arestas
 * @param {object} opts { width, height, iterations, padding }
 */
export function layoutNetwork (nodes, edges, opts = {}) {
  const { width = 1000, height = 700, iterations = 260, padding = 74 } = opts
  if (!nodes.length) return nodes
  seedPositions(nodes, width, height)

  const index = new Map(nodes.map((n, i) => [n.id, i]))
  const ideal = (edge) => {
    if (edge.kind === 'codes') return 78
    if (edge.kind === 'hierarchy') return 66
    if (edge.kind === 'inDoc') return 120
    return 96
  }
  const linkList = edges
    .map((e) => ({ a: index.get(e.a), b: index.get(e.b), d: ideal(e) }))
    .filter((e) => e.a !== undefined && e.b !== undefined)

  const n = nodes.length
  const cx = width / 2
  const cy = height / 2
  const repel = n > 120 ? 2400 : n > 40 ? 2900 : n > 16 ? 2900 : 1500
  const gravity = n <= 10 ? 0.011 : 0.005

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
      node.vx += (cx - node.x) * gravity * cool
      node.vy += (cy - node.y) * gravity * cool
      const damp = 0.72
      node.vx *= damp
      node.vy *= damp
      node.x += Math.max(-24, Math.min(24, node.vx))
      node.y += Math.max(-24, Math.min(24, node.vy))
      node.x = Math.max(padding, Math.min(width - padding, node.x))
      node.y = Math.max(padding, Math.min(height - padding, node.y))
    }
  }

  // Normaliza para a área visível, preservando proporções.
  const xs = nodes.map((n) => n.x)
  const ys = nodes.map((n) => n.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const spanX = Math.max(1, maxX - minX)
  const spanY = Math.max(1, maxY - minY)
  const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY, 2.2)
  for (const node of nodes) {
    node.x = padding + (node.x - minX) * scale
    node.y = padding + (node.y - minY) * scale
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

  codes.forEach((n, i) => {
    const a = (i / Math.max(1, codes.length)) * Math.PI * 2 - Math.PI / 2
    const r = Math.min(width, height) * (codes.length === 1 ? 0 : 0.16)
    n.x = cx + Math.cos(a) * r
    n.y = cy + Math.sin(a) * r
  })

  const neighbor = new Map()
  for (const e of edges) {
    const a = nodes.find((n) => n.id === e.a)
    const b = nodes.find((n) => n.id === e.b)
    if (!a || !b) continue
    if (a.kind === 'quote' && b.kind === 'code') { if (!neighbor.has(a.id)) neighbor.set(a.id, b); continue }
    if (b.kind === 'quote' && a.kind === 'code') { if (!neighbor.has(b.id)) neighbor.set(b.id, a) }
  }

  const ringR = Math.min(width, height) * 0.36
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
export function networkSvg (nodes, edges, opts = {}) {
  const {
    width = 1400,
    height = 900,
    title = '',
    subtitle = '',
    showLabels = true,
    scale = 1,
    background = '#ffffff'
  } = opts

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

  const edgeLabels = showLabels
    ? edges.map((e) => {
        if (!e.type || e.kind === 'hierarchy') return ''
        const a = byId.get(e.a)
        const b = byId.get(e.b)
        if (!a || !b) return ''
        const g = edgeGeometry(a, b, e)
        return `<text x="${g.midX.toFixed(1)}" y="${(g.midY - 5).toFixed(1)}" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="10.5" fill="#6b7280" stroke="#ffffff" stroke-width="3" paint-order="stroke">${escapeXml(e.label || RELATION_TEXT[e.type] || e.type)}</text>`
      }).join('')
    : ''

  const nodeShapes = nodes.map((n) => {
    const r = nodeRadius(n)
    const opacity = n.kind === 'quote' ? 0.85 : 1
    const ring = n.kind === 'code' ? `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${(r + 2).toFixed(1)}" fill="none" stroke="${n.color}" stroke-opacity="0.28" stroke-width="1.4" />` : ''
    return `<g><circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${n.color}" fill-opacity="${opacity}" stroke="#ffffff" stroke-width="${n.kind === 'quote' ? 0.8 : 1.6}" />${ring}</g>`
  }).join('')

  const labels = showLabels
    ? nodes.map((n) => {
        if (n.kind === 'quote' && !n.selected) return ''
        const pos = nodeLabelLayout(n, width)
        const color = n.kind === 'quote' ? '#4b5563' : '#1f2937'
        return `<text x="${pos.x.toFixed(1)}" y="${pos.y.toFixed(1)}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="${pos.size}" font-weight="${pos.weight}" fill="${color}" text-anchor="${pos.anchor}">${escapeXml(clip(n.label, 42))}</text>`
      }).join('')
    : ''

  const stats = {
    codes: nodes.filter((n) => n.kind === 'code').length,
    quotes: nodes.filter((n) => n.kind === 'quote').length,
    docs: nodes.filter((n) => n.kind === 'doc').length
  }

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
${title ? `<text x="56" y="64" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="28" font-weight="700" fill="#15294b">${escapeXml(title)}</text>` : ''}
${subtitle ? `<text x="56" y="92" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="13" fill="#6b7280">${escapeXml(subtitle)}</text>` : ''}
<g transform="translate(${offsetX.toFixed(1)}, ${top}) scale(${k.toFixed(4)})">${edgeLines}${edgeLabels}${nodeShapes}${labels}</g>
<g transform="translate(56, ${height - 44})">
  <text font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="12" fill="#6b7280">${stats.codes} códigos · ${stats.quotes} trechos${stats.docs ? ` · ${stats.docs} documentos` : ''} · Codificando</text>
</g>
<g transform="translate(${width - 232}, ${height - 48})" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="12" fill="#6b7280">
  <circle cx="6" cy="-4" r="6" fill="#4A90E2" />
  <text x="18" y="0">código</text>
  <circle cx="94" cy="-4" r="3.2" fill="#8a97a8" />
  <text x="104" y="0">trecho</text>
</g>
</svg>`
}
