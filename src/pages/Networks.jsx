import React, { useEffect, useMemo, useRef, useState } from 'react'
import { navigate, useData } from '../App.jsx'
import { bridge } from '../lib/bridge.js'
import {
  buildNetwork,
  edgeGeometry,
  edgeLabelPos,
  edgeStyle,
  edgeWidth,
  isDirected,
  nodeLabelLayout,
  nodeSize,
  sizeNodes,
  RELATION_TEXT,
  layoutNetwork,
  networkSvg,
  nodeRadius
} from '../lib/network.js'
import Icon from '../components/Icon.jsx'
import RelationModal, { CODE_RELATIONS, QUOTE_RELATIONS, relationLabelFor } from '../components/RelationModal.jsx'

// Vínculos mistos: qualquer nó com qualquer nó (código, trecho ou documento).
const ANY_RELATIONS = [
  { value: 'associado', label: 'está associado a' },
  { value: 'explica', label: 'explica' },
  { value: 'exemplifica', label: 'exemplifica' },
  { value: 'contradiz', label: 'contradiz' },
  { value: 'precede', label: 'precede' },
  { value: 'retoma', label: 'retoma' }
]

// Criação: o destino pode ser código ou trecho, então o repertório é a união.
const CREATE_RELATIONS = [
  { value: 'associado', label: 'está associado a' },
  { value: 'explica', label: 'explica' },
  { value: 'exemplifica', label: 'exemplifica' },
  { value: 'contradiz', label: 'contradiz' },
  { value: 'precede', label: 'precede' },
  { value: 'retoma', label: 'retoma' },
  { value: 'parte', label: 'é parte de' }
]

const W = 1000
const H = 700

const KIND_LABEL = { code: 'Código', quote: 'Trecho', doc: 'Documento' }

/** Rede de relações: códigos, trechos e documentos em um grafo navegável. */
export default function Networks () {
  const {
    data,
    removeCodeLink,
    removeQuoteLink,
    updateCodeLink,
    updateQuoteLink,
    updateNodeLink,
    removeNodeLink,
    addCodeLink,
    addQuoteLink,
    addNodeLink,
    deleteCode,
    removeExcerpts
  } = useData()
  const [showCodes, setShowCodes] = useState(true)
  const [showQuotes, setShowQuotes] = useState(true)
  const [showDocs, setShowDocs] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [quoteMode, setQuoteMode] = useState('short')
  const [boxScale, setBoxScale] = useState(1)
  const [view, setView] = useState('coding')
  const [selected, setSelected] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState('')
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const panRef = useRef(null)
  const [layoutSeed, setLayoutSeed] = useState(0)
  const [relationModal, setRelationModal] = useState(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [, forceRender] = useState(0)

  const network = useMemo(
    () => buildNetwork(data, {
      mode: view,
      showCodes,
      showQuotes: view === 'coding' && showQuotes,
      showDocs: view === 'coding' && showDocs,
      maxQuotes: 240
    }),
    [data, view, showCodes, showQuotes, showDocs]
  )

  // O layout só é recalculado quando os dados, o modo ou o botão Reorganizar mudam.
  // Arrastar um nó não pode disparar um novo layout — por isso o seed separado.
  const nodes = useMemo(() => {
    const copy = network.nodes.map((n) => ({ ...n }))
    sizeNodes(copy, { quotes: quoteMode, scale: boxScale })
    layoutNetwork(copy, network.edges, { width: W, height: H })
    return copy
  }, [network, layoutSeed, quoteMode, boxScale])

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const neighbours = useMemo(() => {
    const map = new Map()
    for (const e of network.edges) {
      if (!map.has(e.a)) map.set(e.a, new Set())
      if (!map.has(e.b)) map.set(e.b, new Set())
      map.get(e.a).add(e.b)
      map.get(e.b).add(e.a)
    }
    return map
  }, [network.edges])

  const selectedNode = selected ? byId.get(selected) : null
  const highlighted = selected ? (neighbours.get(selected) || new Set()) : null

  useEffect(() => { setSelected(null) }, [view])
  useEffect(() => { setConfirmRemove(false) }, [selected])

  const flash = (message) => {
    setNotice(message)
    setTimeout(() => setNotice(''), 3200)
  }

  /** Zoom com a roda do mouse, mantendo o ponto sob o cursor. */
  const onWheel = (e) => {
    if (!e.ctrlKey && !e.metaKey && Math.abs(e.deltaY) < 8) return
    e.preventDefault()
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
    const next = Math.max(0.5, Math.min(2.6, zoom * factor))
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const k = next / zoom
    setPan((p) => ({ x: mx - (mx - p.x) * k, y: my - (my - p.y) * k }))
    setZoom(next)
  }

  const onPointerDown = (e, node) => {
    e.stopPropagation()
    const point = toLocal(e)
    if (node) {
      setSelected(node.id)
      dragRef.current = { id: node.id, dx: node.x - point.x, dy: node.y - point.y }
    } else {
      panRef.current = { startX: e.clientX, startY: e.clientY, x: pan.x, y: pan.y }
      setSelected(null)
    }
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId)
    } catch { /* ponteiro sintético sem captura */ }
  }

  const toLocal = (e) => {
    const rect = svgRef.current.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const y = ((e.clientY - rect.top) / rect.height) * H
    return {
      x: (x - pan.x) / zoom,
      y: (y - pan.y) / zoom
    }
  }

  const onPointerMove = (e) => {
    if (dragRef.current) {
      const point = toLocal(e)
      const node = byId.get(dragRef.current.id)
      if (node) {
        node.x = Math.max(20, Math.min(W - 20, point.x + dragRef.current.dx))
        node.y = Math.max(20, Math.min(H - 20, point.y + dragRef.current.dy))
        forceRender((v) => v + 1)
      }
      return
    }
    if (panRef.current) {
      const dx = ((e.clientX - panRef.current.startX) / (svgRef.current?.clientWidth || 1)) * W
      const dy = ((e.clientY - panRef.current.startY) / (svgRef.current?.clientHeight || 1)) * H
      setPan({ x: panRef.current.x + dx, y: panRef.current.y + dy })
    }
  }

  const endDrag = () => {
    dragRef.current = null
    panRef.current = null
  }

  const fit = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  const reorganize = () => {
    setSelected(null)
    setLayoutSeed((v) => v + 1)
  }

  const openSelected = () => {
    if (!selectedNode) return
    if (selectedNode.kind === 'doc') return navigate('/documents/' + selectedNode.refId)
    if (selectedNode.kind === 'quote') {
      return navigate('/documents/' + selectedNode.transcriptId + '?excerpt=' + encodeURIComponent(selectedNode.refId))
    }
    navigate('/snippets')
  }

  const exportPng = async () => {
    if (exporting) return
    if (!nodes.length) return flash('Não há relações para exportar.')
    setExporting(true)
    try {
      const title = data.project?.name || 'Projeto'
      const subtitle = `Rede de relações · ${new Date().toLocaleDateString('pt-BR')}`
      const svg = networkSvg(nodes, network.edges, {
        width: W,
        height: H,
        scale: 3,
        title,
        subtitle,
        showLabels
      })
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const img = new Image()
      await new Promise((resolve, reject) => {
        img.onload = resolve
        img.onerror = reject
        img.src = url
      })
      const canvas = document.createElement('canvas')
      canvas.width = W * 3
      canvas.height = H * 3
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      const dataUrl = canvas.toDataURL('image/png')
      const base64 = dataUrl.split(',')[1]
      const name = 'rede-' + slug(title) + '.png'
      if (bridge?.saveBytes) await bridge.saveBytes(name, base64, 'image/png')
      else {
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = name
        a.click()
      }
      bridge.notify?.('Rede exportada', `${name} · ${W * 3} × ${H * 3} px`)
      flash('Imagem exportada em PNG (3000 × 2100 px).')
    } catch (err) {
      console.error('Falha ao exportar a rede', err)
      flash('Não foi possível gerar a imagem.')
    } finally {
      setExporting(false)
    }
  }

  const exportSvg = async () => {
    if (exporting) return
    if (!nodes.length) return flash('Não há relações para exportar.')
    setExporting(true)
    try {
      const title = data.project?.name || 'Projeto'
      const svg = networkSvg(nodes, network.edges, {
        width: W,
        height: H,
        title,
        subtitle: `Rede de relações · ${new Date().toLocaleDateString('pt-BR')}`,
        showLabels
      })
      const bytes = new TextEncoder().encode(svg)
      let binary = ''
      for (const b of bytes) binary += String.fromCharCode(b)
      const base64 = btoa(binary)
      const name = 'rede-' + slug(title) + '.svg'
      if (bridge?.saveBytes) await bridge.saveBytes(name, base64, 'image/svg+xml')
      else {
        const a = document.createElement('a')
        a.href = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
        a.download = name
        a.click()
      }
      bridge.notify?.('Rede exportada', name)
      flash('SVG exportado — vetorial, sem perda ao ampliar.')
    } catch (err) {
      console.error('Falha ao exportar o SVG', err)
      flash('Não foi possível gerar o SVG.')
    } finally {
      setExporting(false)
    }
  }

  const relationItems = selectedNode
    ? nodes
        .filter((n) => n.id !== selectedNode.id && n.kind !== 'doc')
        .map((n) => ({
          id: n.id,
          name: n.kind === 'quote' ? n.label : n.label,
          color: n.color,
          meta: KIND_LABEL[n.kind]
        }))
    : []

  const saveRelation = (type, targetId, label) => {
    if (!selectedNode) return
    if (relationModal?.mode === 'edit') {
      const { edge } = relationModal
      const id = edge.id.slice(3)
      if (edge.kind === 'codeLink') updateCodeLink(id, { type, label })
      else if (edge.kind === 'quoteLink') updateQuoteLink(id, { type, label })
      else updateNodeLink(id, { type, label })
      setRelationModal(null)
      return
    }
    const target = byId.get(targetId)
    if (!target) return
    if (selectedNode.kind === 'code' && target.kind === 'code') {
      addCodeLink(selectedNode.refId, target.refId, type, label)
    } else if (selectedNode.kind === 'quote' && target.kind === 'quote') {
      addQuoteLink(selectedNode.refId, target.refId, type, label)
    } else {
      addNodeLink(selectedNode.id, target.id, type, label)
    }
    setRelationModal(null)
  }

  const removeSelectedNode = () => {
    if (!selectedNode) return
    if (!confirmRemove) {
      setConfirmRemove(true)
      return
    }
    if (selectedNode.kind === 'code') {
      deleteCode(selectedNode.refId)
    } else if (selectedNode.kind === 'quote') {
      const ids = (data.excerpts || [])
        .filter((e) => String(e.quoteId || e.id) === selectedNode.refId)
        .map((e) => e.id)
      removeExcerpts(ids)
    }
    setSelected(null)
    setConfirmRemove(false)
  }

  const related = selectedNode
    ? [...(neighbours.get(selectedNode.id) || [])].map((id) => byId.get(id)).filter(Boolean)
    : []

  // Relações nomeadas (hierarquia e vínculos criados pelo pesquisador).
  // Trechos codificados do código selecionado (painel lateral, como no atlas.ti).
  const selectedQuotes = useMemo(() => {
    if (!selectedNode || selectedNode.kind !== 'code') return []
    const byQuote = new Map()
    for (const e of data.excerpts || []) {
      if (e.codeId !== selectedNode.refId) continue
      const key = String(e.quoteId || e.id)
      if (!byQuote.has(key)) {
        byQuote.set(key, {
          id: key,
          text: e.text,
          page: e.page,
          transcriptId: e.transcriptId,
          codes: [e.codeId]
        })
      }
    }
    return [...byQuote.values()].slice(0, 14)
  }, [selectedNode, data.excerpts])

  const edgeWeightBetween = useMemo(() => {
    const map = new Map()
    for (const e of network.edges) {
      if (e.kind !== 'cooccurrence') continue
      map.set(e.a + '|' + e.b, e.weight)
      map.set(e.b + '|' + e.a, e.weight)
    }
    return map
  }, [network.edges])

  const typedLinks = selectedNode
    ? network.edges
        .filter((e) => (e.a === selectedNode.id || e.b === selectedNode.id) &&
          (e.kind === 'hierarchy' || e.kind === 'codeLink' || e.kind === 'quoteLink' || e.kind === 'nodeLink'))
        .map((e) => {
          const otherId = e.a === selectedNode.id ? e.b : e.a
          const other = byId.get(otherId)
          if (!other) return null
          const relation = e.label?.trim() || relationLabelFor(
            e.type,
            e.kind === 'codeLink' ? CODE_RELATIONS : e.kind === 'nodeLink' ? ANY_RELATIONS : QUOTE_RELATIONS,
            e.a === selectedNode.id
          )
          return { edge: e, other, relation: e.kind === 'hierarchy' ? 'hierarquia' : relation }
        })
        .filter(Boolean)
    : []

  return (
    <>
      <div className="topbar">
        <h1>Redes</h1>
        <div className="topbar-actions">
          <button className="btn" onClick={reorganize}>Reorganizar</button>
          <button className="btn" disabled={exporting || !nodes.length} onClick={exportSvg}>
            SVG
          </button>
          <button className="btn btn--blue" disabled={exporting || !nodes.length} onClick={exportPng}>
            {exporting ? 'Exportando…' : 'Exportar PNG'}
          </button>
        </div>
      </div>

      <div className="page page--net">
        <div className="net-page">
          <div className="net-toolbar">
            <div className="net-toggles" role="group" aria-label="Elementos da rede">
              <label className="net-field net-view">
                <span>Visão</span>
                <select className="input" value={view} onChange={(e) => setView(e.target.value)}>
                  <option value="coding">Codificação</option>
                  <option value="cooccurrence">Coocorrência</option>
                </select>
              </label>
              <span className="net-sep" />
              {view === 'coding'
                ? (
                  <>
                    <label className="net-toggle">
                      <input type="checkbox" checked={showCodes} onChange={(e) => setShowCodes(e.target.checked)} />
                      Códigos
                    </label>
                    <label className="net-toggle">
                      <input type="checkbox" checked={showQuotes} onChange={(e) => setShowQuotes(e.target.checked)} />
                      Trechos
                    </label>
                    <label className="net-toggle">
                      <input type="checkbox" checked={showDocs} onChange={(e) => setShowDocs(e.target.checked)} />
                      Documentos
                    </label>
                  </>
                  )
                : (
                  <span className="net-mode-note" title="A espessura da linha é o número de trechos em que os dois códigos aparecem juntos.">
                    Códigos · aresta = trechos em comum
                  </span>
                  )}
              <span className="net-sep" />
              <label className="net-toggle">
                <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
                Rótulos
              </label>
              {view === 'coding' && showQuotes && (
                <>
                  <span className="net-sep" />
                  <label className="net-field">
                    <span>Citações</span>
                    <select className="input" value={quoteMode} onChange={(e) => setQuoteMode(e.target.value)}>
                      <option value="dot">Pontos</option>
                      <option value="short">Trecho curto</option>
                      <option value="text">Trecho</option>
                    </select>
                  </label>
                  <label className="net-field">
                    <span>Tamanho</span>
                    <select className="input" value={boxScale} onChange={(e) => setBoxScale(Number(e.target.value))}>
                      <option value="0.85">Pequeno</option>
                      <option value="1">Médio</option>
                      <option value="1.15">Grande</option>
                    </select>
                  </label>
                </>
              )}
            </div>
            <span className="net-count">
              {view === 'cooccurrence'
                ? `${network.stats.codes} códigos · ${network.stats.links} coocorrências`
                : <>
                    {network.stats.codes} códigos · {network.stats.quotes} trechos
                    {network.stats.docs ? ` · ${network.stats.docs} documentos` : ''}
                  </>}
            </span>
          </div>

          <div className="net-body">
            <div className="net-canvas">
              {nodes.length === 0
                ? (
                  <div className="net-empty">
                    <p>Nenhuma relação para mostrar.</p>
                    <p className="sub">Codifique trechos para ver a rede de códigos.</p>
                    <button className="btn btn--blue" onClick={() => navigate('/documents')}>Abrir documentos</button>
                  </div>
                  )
                : (
                  <svg
                    ref={svgRef}
                    className="net-svg"
                    viewBox={`0 0 ${W} ${H}`}
                    role="img"
                    aria-label="Rede de relações entre códigos, trechos e documentos"
                    onPointerDown={(e) => onPointerDown(e, null)}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerLeave={endDrag}
                    onWheel={onWheel}
                  >
                    <defs>
                      <pattern id="net-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                        <path d="M40 0H0V40" fill="none" stroke="#f1f4f8" strokeWidth="1" />
                      </pattern>
                      <marker id="net-arrow-code" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                        <path d="M0,0 L10,5 L0,10 z" fill="#7d95b4" />
                      </marker>
                      <marker id="net-arrow-quote" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                        <path d="M0,0 L10,5 L0,10 z" fill="#c9a227" />
                      </marker>
                      <marker id="net-arrow-hierarchy" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                        <path d="M0,0 L10,5 L0,10 z" fill="#b8c0cb" />
                      </marker>
                      <marker id="net-arrow-node" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                        <path d="M0,0 L10,5 L0,10 z" fill="#9a8bc4" />
                      </marker>
                    </defs>
                    <rect width={W} height={H} fill="#fff" />
                    <rect width={W} height={H} fill="url(#net-grid)" />
                    <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
                      {network.edges.map((e) => {
                        const a = byId.get(e.a)
                        const b = byId.get(e.b)
                        if (!a || !b) return null
                        const style = edgeStyle(e)
                        const dim = selected && !(e.a === selected || e.b === selected)
                        const g = edgeGeometry(a, b, e)
                        const arrow = isDirected(e)
                          ? `url(#net-arrow-${e.kind === 'codeLink' ? 'code' : e.kind === 'quoteLink' ? 'quote' : e.kind === 'nodeLink' ? 'node' : 'hierarchy'})`
                          : undefined
                        return (
                          <g key={e.id} opacity={dim ? 0.25 : 0.9}>
                            <line
                              x1={g.x1}
                              y1={g.y1}
                              x2={g.x2}
                              y2={g.y2}
                              stroke={style.color}
                              strokeWidth={edgeWidth(e)}
                              strokeDasharray={style.dash || undefined}
                              markerEnd={arrow}
                            />
                            {showLabels && e.type && e.kind !== 'hierarchy' && (() => {
                              const pos = edgeLabelPos(a, b, nodes)
                              return (
                                <text className="net-edge-label" x={pos.x} y={pos.y} textAnchor="middle">
                                  {e.label || RELATION_TEXT[e.type] || e.type}
                                </text>
                              )
                            })()}
                          </g>
                        )
                      })}

                      {nodes.map((n) => {
                        const r = nodeRadius(n)
                        const box = nodeSize(n)
                        const isSelected = selected === n.id
                        const isNeighbour = highlighted?.has(n.id)
                        const dim = selected && !isSelected && !isNeighbour
                        return (
                          <g
                            key={n.id}
                            className="net-node"
                            opacity={dim ? 0.35 : 1}
                            onPointerDown={(e) => onPointerDown(e, n)}
                            onDoubleClick={() => {
                              setSelected(n.id)
                              setTimeout(openSelected, 0)
                            }}
                          >
                            <title>
                              {n.kind === 'code'
                                ? `${n.label} — ${n.weight} trecho${n.weight === 1 ? '' : 's'} codificado${n.weight === 1 ? '' : 's'}`
                                : n.kind === 'quote'
                                  ? `${n.text || n.label}${n.docName ? ` — ${n.docName}` : ''}${n.page ? `, p. ${n.page}` : ''}`
                                  : n.label}
                            </title>
                            {box
                              ? (
                                <>
                                  {n.kind === 'code' && (
                                    <rect
                                      x={n.x - box.w / 2 - 2.5}
                                      y={n.y - box.h / 2 - 2.5}
                                      width={box.w + 5}
                                      height={box.h + 5}
                                      rx={box.radius + 2}
                                      fill="none"
                                      stroke={n.color}
                                      strokeOpacity="0.3"
                                      strokeWidth="1.4"
                                    />
                                  )}
                                  <rect
                                    x={n.x - box.w / 2}
                                    y={n.y - box.h / 2}
                                    width={box.w}
                                    height={box.h}
                                    rx={box.radius}
                                    fill={n.kind === 'quote' ? '#fff' : n.color}
                                    stroke={isSelected ? '#15294b' : n.kind === 'quote' ? n.color : '#fff'}
                                    strokeWidth={isSelected ? 2.4 : n.kind === 'quote' ? 1.1 : 1.6}
                                  />
                                  {n.kind === 'quote' && (
                                    <rect
                                      x={n.x - box.w / 2}
                                      y={n.y - box.h / 2}
                                      width={3}
                                      height={box.h}
                                      rx={1.5}
                                      fill={n.color}
                                    />
                                  )}
                                </>
                                )
                              : (
                                <circle
                                  cx={n.x}
                                  cy={n.y}
                                  r={r}
                                  fill={n.color}
                                  stroke={isSelected ? '#15294b' : '#fff'}
                                  strokeWidth={isSelected ? 2.4 : n.kind === 'quote' ? 0.8 : 1.6}
                                />
                                )}
                            {showLabels && (box || n.kind !== 'quote' || isSelected || isNeighbour) && (() => {
                              const pos = nodeLabelLayout(n, W)
                              if (pos.inside && pos.lines.length > 1) {
                                return (
                                  <text
                                    textAnchor="middle"
                                    style={{ fontSize: pos.size }}
                                    className={'net-label net-label--' + n.kind}
                                  >
                                    {pos.lines.map((line, i) => (
                                      <tspan key={i} x={pos.x} y={pos.y + i * pos.lineHeight}>{line}</tspan>
                                    ))}
                                  </text>
                                )
                              }
                              const text = pos.inside
                                ? pos.lines[0]
                                : n.label.length > 42 ? n.label.slice(0, 41) + '…' : n.label
                              return (
                                <text
                                  x={pos.x}
                                  y={pos.y}
                                  textAnchor={pos.anchor}
                                  style={pos.inside ? { fontSize: pos.size } : undefined}
                                  className={'net-label net-label--' + n.kind}
                                >
                                  {text}
                                </text>
                              )
                            })()}
                          </g>
                        )
                      })}
                    </g>
                  </svg>
                  )}
              <div className="net-zoom">
                <button className="icon-btn" title="Aproximar" onClick={() => setZoom((z) => Math.min(2.6, z * 1.15))}>+</button>
                <button className="icon-btn" title="Afastar" onClick={() => setZoom((z) => Math.max(0.5, z / 1.15))}>−</button>
                <button className="icon-btn" title="Ajustar à tela" onClick={fit}>⤢</button>
              </div>
              {notice && <div className="net-notice">{notice}</div>}
            </div>

            <aside className="net-side">
              {!selectedNode
                ? (
                  <div className="net-side-empty">
                    <h2>Como ler a rede</h2>
                    <ul>
                      <li>Clique em um nó para ver as relações.</li>
                      <li>Arraste para mover; arraste o fundo para navegar.</li>
                      <li>Use a roda do mouse para aproximar.</li>
                    </ul>
                    <div className="net-legend">
                      <span><i className="net-swatch net-swatch--code" /> Código</span>
                      <span>
                        <i className={quoteMode === 'dot' ? 'net-dot net-dot--small' : 'net-swatch net-swatch--quote'} style={{ background: quoteMode === 'dot' ? '#7BB661' : undefined }} /> Trecho
                      </span>
                      <span><i className="net-dot net-dot--doc" /> Documento</span>
                    </div>
                    <p className="sub">Duplo clique abre o item de origem.</p>
                  </div>
                  )
                : (
                  <div className="net-inspector">
                    <span className="net-kind">{KIND_LABEL[selectedNode.kind]}</span>
                    <h2 title={selectedNode.label}>{selectedNode.label}</h2>
                    {selectedNode.kind === 'quote' && (
                      <p className="sub">{selectedNode.docName}{selectedNode.page ? ` · p. ${selectedNode.page}` : ''}</p>
                    )}
                    {selectedNode.kind === 'code' && (
                      <p className="sub">
                        {selectedNode.weight} trecho{selectedNode.weight === 1 ? '' : 's'} codificado{selectedNode.weight === 1 ? '' : 's'}
                      </p>
                    )}
                    <div className="net-actions">
                      <button className="btn btn--sm btn--blue" onClick={openSelected}>
                        {selectedNode.kind === 'code' ? 'Ver trechos' : 'Abrir'}
                      </button>
                      <button className="btn btn--sm" onClick={() => setSelected(null)}>Limpar</button>
                    </div>

                    <h3>Conectados <span className="net-side-count">{related.length}</span></h3>
                    {related.length === 0
                      ? <p className="sub">Nenhuma relação visível com os filtros atuais.</p>
                      : (
                        <ul className="net-related">
                          {related.slice(0, 40).map((n) => (
                            <li key={n.id}>
                              <button onClick={() => setSelected(n.id)}>
                                <i className="net-dot" style={{ background: n.color }} />
                                <span title={n.label}>{n.label}</span>
                                <small>
                                  {view === 'cooccurrence'
                                    ? `${edgeWeightBetween.get(selectedNode.id + '|' + n.id) || 0}x`
                                    : KIND_LABEL[n.kind]}
                                </small>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    {selectedNode.kind !== 'doc' && (
                      <>
                        <h3>
                          Vínculos nomeados
                          <span className="net-side-count">{typedLinks.length}</span>
                          <button
                            className="btn--link net-link-add"
                            onClick={() => setRelationModal({ mode: 'create' })}
                          >
                            + Ligar
                          </button>
                        </h3>
                        <ul className="net-links">
                          {typedLinks.map(({ edge, other, relation }) => (
                            <li key={edge.id}>
                              {edge.kind === 'hierarchy'
                                ? <span className="net-link-kind">{relation}</span>
                                : (
                                  <button
                                    className="net-link-kind net-link-rename"
                                    title="Clique para renomear ou mudar o tipo"
                                    onClick={() => setRelationModal({ mode: 'edit', edge, other })}
                                  >
                                    {relation}
                                  </button>
                                  )}
                              <button
                                className="net-link-target"
                                title={other.label}
                                onClick={() => setSelected(other.id)}
                              >
                                {other.label}
                              </button>
                              {edge.kind !== 'hierarchy' && (
                                <button
                                  className="relation-remove"
                                  title="Remover vínculo"
                                  onClick={() => {
                                    if (edge.kind === 'codeLink') removeCodeLink(edge.id.slice(3))
                                    else if (edge.kind === 'quoteLink') removeQuoteLink(edge.id.slice(3))
                                    else removeNodeLink(edge.id.slice(3))
                                  }}
                                >
                                  ×
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {typedLinks.length === 0 && selectedNode.kind !== 'doc' && (
                      <p className="sub net-links-empty">
                        Nenhum vínculo nomeado. Use <strong>+ Ligar</strong> para relacionar este item.
                      </p>
                    )}

                    {selectedNode.kind === 'code' && selectedQuotes.length > 0 && (
                      <>
                        <h3>
                          Trechos codificados
                          <span className="net-side-count">{selectedNode.weight}</span>
                        </h3>
                        <ul className="net-quotes">
                          {selectedQuotes.map((q) => (
                            <li key={q.id}>
                              <button
                                title={q.text}
                                onClick={() => navigate(
                                  '/documents/' + q.transcriptId +
                                  (q.page ? '?page=' + q.page : '?excerpt=' + q.id)
                                )}
                              >
                                <span className="net-quote-doc">
                                  {data.transcripts.find((t) => t.id === q.transcriptId)?.name || 'Documento'}
                                  {q.page ? ` · p. ${q.page}` : ''}
                                </span>
                                <span className="net-quote-text">{q.text}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        {selectedNode.weight > selectedQuotes.length && (
                          <button className="btn--link net-quotes-more" onClick={openSelected}>
                            Ver todos os {selectedNode.weight} trechos →
                          </button>
                        )}
                      </>
                    )}

                    {selectedNode.kind !== 'doc' && (
                      <div className="net-remove-row">
                        <button
                          className={confirmRemove ? 'btn btn--sm net-danger-btn' : 'btn--link net-danger'}
                          onClick={removeSelectedNode}
                        >
                          {confirmRemove
                            ? 'Confirmar remoção'
                            : selectedNode.kind === 'code' ? 'Remover código' : 'Remover trecho'}
                        </button>
                        {confirmRemove && (
                          <button className="btn--link" onClick={() => setConfirmRemove(false)}>
                            Cancelar
                          </button>
                        )}
                        {confirmRemove && (
                          <p className="net-remove-hint">
                            {selectedNode.kind === 'code'
                              ? 'O código e suas codificações serão removidos do projeto.'
                              : 'As codificações deste trecho serão removidas; o texto do documento não muda.'}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  )}
            </aside>
          </div>
        </div>
      </div>

      {relationModal && selectedNode && (
        <RelationModal
          title={relationModal.mode === 'edit'
            ? 'Renomear relação'
            : selectedNode.kind === 'code' ? 'Ligar código a…' : 'Ligar trecho a…'}
          from={selectedNode.label}
          relations={CREATE_RELATIONS}
          items={relationModal.mode === 'edit' ? [] : relationItems}
          fixedTarget={relationModal.mode === 'edit'
            ? { id: relationModal.other.id, name: relationModal.other.label }
            : null}
          initialType={relationModal.edge?.type}
          initialLabel={relationModal.edge?.label || ''}
          submitLabel={relationModal.mode === 'edit' ? 'Salvar' : 'Relacionar'}
          onSave={saveRelation}
          onClose={() => setRelationModal(null)}
        />
      )}
    </>
  )
}

function slug (text) {
  return String(text || 'projeto')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'projeto'
}
