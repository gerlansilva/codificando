import { describe, expect, it } from 'vitest'
import {
  buildNetwork,
  edgeGeometry,
  edgeLabelPos,
  edgeStyle,
  edgeWidth,
  nodeSize,
  sizeNodes,
  layoutNetwork,
  layoutRadial,
  networkSvg,
  nodeRadius
} from '../network.js'

const data = {
  project: { name: 'Práticas de leitura' },
  codes: [
    { id: 'c1', name: 'Mediação docente', color: '#4A90E2' },
    { id: 'c2', name: 'Escuta do erro', color: '#7BB661', parentId: 'c1' },
    { id: 'c3', name: 'Sem trechos', color: '#C9A227' }
  ],
  transcripts: [{ id: 't1', name: 'Entrevista 01' }],
  excerpts: [
    { id: 'e1', quoteId: 'q1', codeId: 'c1', transcriptId: 't1', text: 'A professora retoma a fala.', page: 3 },
    { id: 'e2', quoteId: 'q1', codeId: 'c2', transcriptId: 't1', text: 'A professora retoma a fala.', page: 3 },
    { id: 'e3', quoteId: 'q2', codeId: 'c2', transcriptId: 't1', text: 'O erro virou conteúdo.', page: 4 }
  ],
  quoteLinks: [{ id: 'ql1', from: 'q1', to: 'q2', type: 'contradiz' }],
  codeLinks: [{ id: 'cl1', from: 'c1', to: 'c3', type: 'associado' }]
}

describe('buildNetwork', () => {
  it('cria nós de códigos e trechos com as arestas de codificação', () => {
    const net = buildNetwork(data)
    expect(net.nodes.filter((n) => n.kind === 'code')).toHaveLength(3)
    expect(net.nodes.filter((n) => n.kind === 'quote')).toHaveLength(2)
    expect(net.edges.filter((e) => e.kind === 'codes')).toHaveLength(3)
    expect(net.stats).toMatchObject({ codes: 3, quotes: 2, docs: 0 })
  })

  it('inclui hierarquia, vínculo entre códigos e vínculo entre trechos', () => {
    const net = buildNetwork(data)
    expect(net.edges.some((e) => e.kind === 'hierarchy')).toBe(true)
    expect(net.edges.some((e) => e.kind === 'codeLink' && e.type === 'associado')).toBe(true)
    expect(net.edges.some((e) => e.kind === 'quoteLink' && e.type === 'contradiz')).toBe(true)
  })

  it('respeita os filtros de exibição', () => {
    const onlyCodes = buildNetwork(data, { showQuotes: false })
    expect(onlyCodes.nodes.every((n) => n.kind === 'code')).toBe(true)
    expect(onlyCodes.edges.some((e) => e.kind === 'codes')).toBe(false)

    const withDocs = buildNetwork(data, { showDocs: true })
    expect(withDocs.stats.docs).toBe(1)
    expect(withDocs.edges.filter((e) => e.kind === 'inDoc')).toHaveLength(3)
  })

  it('ignora referências órfãs sem quebrar', () => {
    const net = buildNetwork({
      ...data,
      excerpts: [...data.excerpts, { id: 'e9', codeId: 'inexistente', transcriptId: 't9', text: 'x' }],
      quoteLinks: [{ id: 'ql9', from: 'q1', to: 'q404' }],
      codeLinks: [{ id: 'cl9', from: 'c1', to: 'c404' }]
    })
    expect(net.edges.some((e) => e.b === 'c:inexistente')).toBe(false)
    expect(net.edges.some((e) => e.id === 'ql:ql9')).toBe(false)
    expect(net.edges.some((e) => e.id === 'cl:cl9')).toBe(false)
  })

  it('remove nós isolados quando minDegree é maior que 1', () => {
    const net = buildNetwork(data, { minDegree: 2 })
    expect(net.nodes.some((n) => n.id === 'c:c3')).toBe(false)
  })

  it('lida com projeto vazio', () => {
    const net = buildNetwork({})
    expect(net.nodes).toEqual([])
    expect(net.edges).toEqual([])
    expect(net.stats).toEqual({ codes: 0, quotes: 0, docs: 0, links: 0 })
  })
})

describe('buildNetwork — coocorrência', () => {
  it('gera só códigos e arestas ponderadas pelos trechos compartilhados', () => {
    const net = buildNetwork(data, { mode: 'cooccurrence' })
    expect(net.nodes.every((n) => n.kind === 'code')).toBe(true)
    expect(net.nodes).toHaveLength(2)
    expect(net.edges.every((e) => e.kind === 'cooccurrence')).toBe(true)
    const pair = net.edges.find((e) => e.id === 'co:c1:c2')
    expect(pair.weight).toBe(1)
    expect(net.stats).toMatchObject({ codes: 2, quotes: 2, docs: 0, links: 1 })
  })

  it('soma um por trecho em que o par aparece junto', () => {
    const net = buildNetwork({
      ...data,
      excerpts: [
        { id: 'a', quoteId: 'q1', codeId: 'c1', transcriptId: 't1' },
        { id: 'b', quoteId: 'q1', codeId: 'c2', transcriptId: 't1' },
        { id: 'c', quoteId: 'q2', codeId: 'c1', transcriptId: 't1' },
        { id: 'd', quoteId: 'q2', codeId: 'c2', transcriptId: 't1' },
        { id: 'e', quoteId: 'q2', codeId: 'c3', transcriptId: 't1' }
      ]
    }, { mode: 'cooccurrence' })
    const pair = net.edges.find((e) => e.id === 'co:c1:c2')
    expect(pair.weight).toBe(2)
    expect(net.edges.filter((e) => e.a === e.b)).toHaveLength(0)
    expect(net.edges.find((e) => e.id === 'co:c2:c3').weight).toBe(1)
  })

  it('oculta códigos sem coocorrência', () => {
    const net = buildNetwork(data, { mode: 'cooccurrence' })
    expect(net.nodes.some((n) => n.refId === 'c3')).toBe(false)
    expect(net.edges.some((e) => e.a === 'c:c3' || e.b === 'c:c3')).toBe(false)
  })
})

describe('vínculos mistos e rótulos', () => {
  const mixed = {
    ...data,
    nodeLinks: [
      { id: 'n1', from: 'c:c1', to: 'q:q1', type: 'exemplifica', label: 'ilustra a condução' }
    ]
  }

  it('conecta código a trecho com rótulo próprio', () => {
    const net = buildNetwork(mixed)
    const edge = net.edges.find((e) => e.kind === 'nodeLink')
    expect(edge).toBeTruthy()
    expect(edge.a).toBe('c:c1')
    expect(edge.b).toBe('q:q1')
    expect(edge.label).toBe('ilustra a condução')
  })

  it('ignora vínculo cujo nó não está na rede', () => {
    const net = buildNetwork({
      ...mixed,
      nodeLinks: [...mixed.nodeLinks, { id: 'n2', from: 'c:c1', to: 'q:inexistente', type: 'associado' }]
    })
    expect(net.edges.filter((e) => e.kind === 'nodeLink')).toHaveLength(1)
  })

  it('desenha o rótulo próprio no SVG e encurta a linha até o nó', () => {
    const net = buildNetwork(mixed)
    const nodes = layoutNetwork(net.nodes.map((n) => ({ ...n })), net.edges, { width: 600, height: 400 })
    const svg = networkSvg(nodes, net.edges, { width: 600, height: 400, title: 'Rede' })
    expect(svg).toContain('ilustra a condução')
    expect(svg).toContain('marker-end="url(#arrow-node)"')
  })
})

describe('layoutNetwork', () => {
  it('posiciona todos os nós dentro da área e de forma determinística', () => {
    const a = layoutNetwork(
      buildNetwork(data).nodes.map((n) => ({ ...n })),
      buildNetwork(data).edges,
      { width: 800, height: 600, padding: 40 }
    )
    const b = layoutNetwork(
      buildNetwork(data).nodes.map((n) => ({ ...n })),
      buildNetwork(data).edges,
      { width: 800, height: 600, padding: 40 }
    )
    for (const n of a) {
      expect(n.x).toBeGreaterThanOrEqual(40)
      expect(n.x).toBeLessThanOrEqual(760)
      expect(n.y).toBeGreaterThanOrEqual(40)
      expect(n.y).toBeLessThanOrEqual(560)
    }
    expect(a.map((n) => [n.id, Math.round(n.x), Math.round(n.y)])).toEqual(
      b.map((n) => [n.id, Math.round(n.x), Math.round(n.y)])
    )
  })
})

describe('layoutRadial', () => {
  it('coloca códigos perto do centro e trechos em anel externo', () => {
    const net = buildNetwork(data)
    const nodes = layoutRadial(net.nodes.map((n) => ({ ...n })), net.edges, { width: 1000, height: 700 })
    const center = { x: 500, y: 350 }
    const dist = (n) => Math.hypot(n.x - center.x, n.y - center.y)
    const codeAvg = nodes.filter((n) => n.kind === 'code').reduce((s, n) => s + dist(n), 0) / 3
    const quoteAvg = nodes.filter((n) => n.kind === 'quote').reduce((s, n) => s + dist(n), 0) / 2
    expect(codeAvg).toBeLessThan(quoteAvg)
  })
})

describe('networkSvg', () => {
  const net = buildNetwork(data)
  const nodes = layoutNetwork(net.nodes.map((n) => ({ ...n })), net.edges, { width: 600, height: 400 })

  it('gera SVG autocontido com título e legenda', () => {
    const svg = networkSvg(nodes, net.edges, { width: 600, height: 400, title: 'Rede & afins', subtitle: '2026' })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(svg).toContain('Rede &amp; afins')
    expect(svg).toContain('3 códigos · 2 trechos')
    expect(svg.match(/<circle/g).length).toBeGreaterThanOrEqual(3)
    expect(svg.match(/<rect/g).length).toBeGreaterThanOrEqual(3)
  })

  it('aplica a escala de exportação sem alterar o viewBox', () => {
    const svg = networkSvg(nodes, net.edges, { width: 600, height: 400, scale: 3 })
    expect(svg).toContain('width="1800" height="1200"')
    expect(svg).toContain('viewBox="0 0 600 400"')
  })

  it('escapa rótulos e respeita showLabels', () => {
    const alt = buildNetwork({ ...data, codes: [{ id: 'c1', name: '<script>x</script>', color: '#000' }] })
    const altNodes = layoutNetwork(alt.nodes.map((n) => ({ ...n })), alt.edges, { width: 400, height: 300 })
    const svg = networkSvg(altNodes, alt.edges, { width: 400, height: 300 })
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('&lt;script&gt;')
    const noLabels = networkSvg(nodes, net.edges, { width: 600, height: 400, showLabels: false })
    expect(noLabels).not.toContain('Mediação docente')
    const withLabels = networkSvg(nodes, net.edges, { width: 600, height: 400 })
    expect(withLabels).toContain('Mediação docente')
  })
})

describe('caixas de código e citação', () => {
  const sized = (opts = {}) => sizeNodes(
    buildNetwork(data).nodes.map((n) => ({ ...n })),
    opts
  )

  it('desenha o código como caixa e leva o nome para dentro', () => {
    const nodes = sized()
    const code = nodes.find((n) => n.kind === 'code' && n.refId === 'c1')
    expect(nodeSize(code).w).toBeGreaterThan(0)
    expect(code.lines.join(' ')).toBe('Mediação docente')
    expect(nodeSize(code).font).toBeGreaterThan(0)
  })

  it('quebra nomes longos em duas linhas em vez de esticar a caixa', () => {
    const nodes = sizeNodes(
      [{ id: 'c:c1', kind: 'code', label: 'Formalização depois da tentativa', weight: 4 }],
      { quotes: 'dot' }
    )
    expect(nodes[0].lines).toHaveLength(2)
    expect(nodeSize(nodes[0]).w).toBeLessThanOrEqual(168)
  })

  it('mostra o começo do trecho na citação e aceita o modo ponto', () => {
    const nodes = sized({ quotes: 'short' })
    const quote = nodes.find((n) => n.kind === 'quote')
    expect(quote.lines).toHaveLength(1)
    expect(quote.lines[0].length).toBeGreaterThan(10)
    expect(nodeSize(quote).h).toBeLessThan(40)

    const dots = sized({ quotes: 'dot' })
    expect(dots.filter((n) => n.kind === 'quote').every((n) => n.box === null)).toBe(true)
  })

  it('respeita a escala pequena e grande', () => {
    const small = sized({ scale: 0.85 }).find((n) => n.kind === 'code')
    const large = sized({ scale: 1.15 }).find((n) => n.kind === 'code')
    expect(nodeSize(small).w).toBeLessThan(nodeSize(large).w)
    expect(nodeSize(small).font).toBeLessThan(nodeSize(large).font)
  })

  it('encurta a seta até a borda da caixa', () => {
    const a = { id: 'c:a', kind: 'code', x: 100, y: 100, box: { w: 100, h: 40 } }
    const b = { id: 'c:b', kind: 'code', x: 300, y: 100, box: { w: 100, h: 40 } }
    const g = edgeGeometry(a, b, { kind: 'codeLink' })
    expect(g.x2).toBeLessThan(b.x - 45)
    expect(g.x2).toBeGreaterThan(b.x - 60)
  })

  it('afasta o rótulo da aresta dos nós no meio do caminho', () => {
    const a = { id: 'c:a', kind: 'code', x: 100, y: 100, box: { w: 120, h: 40 } }
    const b = { id: 'c:b', kind: 'code', x: 400, y: 100, box: { w: 120, h: 40 } }
    const pos = edgeLabelPos(a, b, [a, b])
    expect(pos.x).toBeGreaterThan(a.x)
    expect(pos.x).toBeLessThan(b.x)
    expect(pos.y).toBeLessThan(100)
  })

  it('exporta o texto da citação dentro do cartão', () => {
    const long = {
      ...data,
      excerpts: [{
        ...data.excerpts[0],
        text: 'A professora retoma a fala da criança, escreve no quadro e pergunta quem concorda com a explicação.'
      }],
      quoteLinks: []
    }
    const nodes = sizeNodes(buildNetwork(long).nodes.map((n) => ({ ...n })), { quotes: 'text' })
    const laid = layoutNetwork(nodes, [], { width: 600, height: 400 })
    const svg = networkSvg(laid, [], { width: 600, height: 400 })
    expect(svg).toContain('A professora retoma a fala')
    expect(svg).toContain('<tspan')
  })
})

describe('estilos', () => {
  it('dá raio maior a nós mais conectados', () => {
    expect(nodeRadius({ kind: 'quote' })).toBe(4)
    expect(nodeRadius({ kind: 'code', weight: 9 })).toBeGreaterThan(nodeRadius({ kind: 'code', weight: 1 }))
    expect(nodeRadius({ kind: 'doc', weight: 16 })).toBeGreaterThan(nodeRadius({ kind: 'doc', weight: 0 }))
  })

  it('distingue traço de hierarquia e de vínculo', () => {
    expect(edgeStyle({ kind: 'hierarchy' }).dash).toBeTruthy()
    expect(edgeStyle({ kind: 'quoteLink' }).color).not.toBe(edgeStyle({ kind: 'codes' }).color)
    expect(edgeStyle({ kind: 'desconhecido' })).toEqual(edgeStyle({ kind: 'codes' }))
  })

  it('engrossa a aresta conforme a coocorrência', () => {
    expect(edgeWidth({ kind: 'cooccurrence', weight: 1 })).toBeLessThan(
      edgeWidth({ kind: 'cooccurrence', weight: 8 })
    )
    expect(edgeWidth({ kind: 'cooccurrence', weight: 100 })).toBeLessThanOrEqual(6)
    expect(edgeWidth({ kind: 'codes' })).toBe(1)
  })
})
