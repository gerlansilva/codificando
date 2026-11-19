import React, { useEffect, useMemo, useRef, useState } from 'react'
import { navigate, useData } from '../App.jsx'
import { bridge } from '../lib/bridge.js'
import {
  buildNetwork,
  edgeStyle,
  layoutNetwork,
  layoutRadial,
  networkSvg,
  nodeRadius
} from '../lib/network.js'
import Icon from '../components/Icon.jsx'
import { CODE_RELATIONS, QUOTE_RELATIONS, relationLabel } from '../components/RelationModal.jsx'

const W = 1000
const H = 700

const KIND_LABEL = { code: 'Código', quote: 'Trecho', doc: 'Documento' }

/** Rede de relações: códigos, trechos e documentos em um grafo navegável. */
export default function Networks () {
  const { data, removeCodeLink, removeQuoteLink } = useData()
  const [showCodes, setShowCodes] = useState(true)
  const [showQuotes, setShowQuotes] = useState(true)
  const [showDocs, setShowDocs] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [mode, setMode] = useState('force')
  const [selected, setSelected] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [exporting, setExporting] = useState(false)
  const [notice, setNotice] = useState('')
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const panRef = useRef(null)
  const [layoutSeed, setLayoutSeed] = useState(0)
  const [, forceRender] = useState(0)

  const network = useMemo(
    () => buildNetwork(data, { showCodes, showQuotes, showDocs, maxQuotes: 240 }),
    [data, showCodes, showQuotes, showDocs]
  )

  // O layout só é recalculado quando os dados, o modo ou o botão Reorganizar mudam.
  // Arrastar um nó não pode disparar um novo layout — por isso o seed separado.
  const nodes = useMemo(() => {
    const copy = network.nodes.map((n) => ({ ...n }))
    if (mode === 'radial') layoutRadial(copy, network.edges, { width: W, height: H })
    else layoutNetwork(copy, network.edges, { width: W, height: H })
    return copy
  }, [network, mode, layoutSeed])

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

  useEffect(() => { setSelected(null) }, [mode])

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

  const related = selectedNode
    ? [...(neighbours.get(selectedNode.id) || [])].map((id) => byId.get(id)).filter(Boolean)
    : []

  // Relações nomeadas (hierarquia e vínculos criados pelo pesquisador).
  const typedLinks = selectedNode
    ? network.edges
        .filter((e) => (e.a === selectedNode.id || e.b === selectedNode.id) &&
          (e.kind === 'hierarchy' || e.kind === 'codeLink' || e.kind === 'quoteLink'))
        .map((e) => {
          const otherId = e.a === selectedNode.id ? e.b : e.a
          const other = byId.get(otherId)
          if (!other) return null
          const relation = relationLabel(
            e.type,
            e.kind === 'codeLink' ? CODE_RELATIONS : QUOTE_RELATIONS
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

      <div className="page">
        <div className="net-page">
          <div className="net-toolbar">
            <div className="net-toggles" role="group" aria-label="Elementos da rede">
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
              <span className="net-sep" />
              <label className="net-toggle">
                <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} />
                Rótulos
              </label>
              <span className="net-sep" />
              <label className="net-field">
                <span>Layout</span>
                <select className="input" value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="force">Força</option>
                  <option value="radial">Radial</option>
                </select>
              </label>
            </div>
            <span className="net-count">
              {network.stats.codes} códigos · {network.stats.quotes} trechos
              {network.stats.docs ? ` · ${network.stats.docs} documentos` : ''}
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
                        return (
                          <line
                            key={e.id}
                            x1={a.x}
                            y1={a.y}
                            x2={b.x}
                            y2={b.y}
                            stroke={style.color}
                            strokeWidth={style.width}
                            strokeDasharray={style.dash || undefined}
                            strokeOpacity={dim ? 0.25 : 0.9}
                          />
                        )
                      })}

                      {nodes.map((n) => {
                        const r = nodeRadius(n)
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
                                  ? `${n.label}${n.docName ? ` — ${n.docName}` : ''}${n.page ? `, p. ${n.page}` : ''}`
                                  : n.label}
                            </title>
                            {n.kind === 'code' && (
                              <circle cx={n.x} cy={n.y} r={r + 2} fill="none" stroke={n.color} strokeOpacity="0.3" strokeWidth="1.4" />
                            )}
                            <circle
                              cx={n.x}
                              cy={n.y}
                              r={r}
                              fill={n.color}
                              stroke={isSelected ? '#15294b' : '#fff'}
                              strokeWidth={isSelected ? 2.4 : n.kind === 'quote' ? 0.8 : 1.6}
                            />
                            {showLabels && (n.kind !== 'quote' || isSelected || isNeighbour) && (
                              <text
                                x={n.kind === 'code' ? n.x : n.x + r + 9}
                                y={n.kind === 'code' ? n.y - r - 8 : n.y + 4}
                                textAnchor={n.kind === 'code' ? 'middle' : 'start'}
                                className={'net-label net-label--' + n.kind}
                              >
                                {n.label.length > 42 ? n.label.slice(0, 41) + '…' : n.label}
                              </text>
                            )}
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
                      <span><i className="net-dot" style={{ background: '#4A90E2' }} /> Código</span>
                      <span><i className="net-dot net-dot--small" style={{ background: '#7BB661' }} /> Trecho</span>
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
                                <small>{KIND_LABEL[n.kind]}</small>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    {typedLinks.length > 0 && (
                      <>
                        <h3>Vínculos nomeados</h3>
                        <ul className="net-links">
                          {typedLinks.map(({ edge, other, relation }) => (
                            <li key={edge.id}>
                              <span className="net-link-kind">{relation}</span>
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
                                    else removeQuoteLink(edge.id.slice(3))
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
                  </div>
                  )}
            </aside>
          </div>
        </div>
      </div>
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
