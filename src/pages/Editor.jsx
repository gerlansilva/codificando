import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useData, navigate } from '../App.jsx'
import { initials, parseBlocks, segmentsFor } from '../lib/transcript.js'
import { flattenTree, descendantsOf, codeStats, CODE_COLORS } from '../lib/codes.js'
import { bridge } from '../lib/bridge.js'
import { uid } from '../data/store.js'
import { readBinary } from '../lib/files.js'
import { parsePdf } from '../lib/importers.js'
import { buildTextIndex, textForRects } from '../lib/pdfText.js'
import ContextMenu from '../components/ContextMenu.jsx'
import PdfViewer from '../components/PdfViewer.jsx'
import { quoteToText, copyText } from '../lib/clipboard.js'
import { findHits, indexOnPage } from '../lib/pages.js'
import Toast from '../components/Toast.jsx'
import { modKey, shiftModKey } from '../lib/platform.js'
import { makeSearchRegex } from '../lib/search.js'
import { tint } from '../lib/colors.js'

const SPEAKER_COLORS = ['#4A90E2', '#7BB661', '#E2A64A', '#C16AA8', '#5BB8C4', '#D96B5B']

function colorForSpeaker (name, codes) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 997
  return SPEAKER_COLORS[hash % SPEAKER_COLORS.length]
}

function pointToOffset (blockEl, node, offset) {
  const range = document.createRange()
  range.selectNodeContents(blockEl)
  try { range.setEnd(node, offset) } catch { return 0 }
  return range.toString().length
}

export default function Editor ({ transcript, focusPage = null, focusExcerpt = null, findTerm = null, findOcc = null, inspectQuote = null }) {
  const { data, update, undo, createCode, addExcerpt, addPdfExcerpt, removeExcerpt, deleteTranscript, updateTranscript, updateCode, deleteCode, mergeCodes, moveCode, saveMemo, repairExcerptTexts } = useData()
  const [menu, setMenu] = useState(null) // 'transcript' | 'more'
  const [activeExcerpt, setActiveExcerpt] = useState(null)
  const [pendingSel, setPendingSel] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [participant, setParticipant] = useState(false)
  const [renameValue, setRenameValue] = useState(transcript.name)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(transcript.name)
  const cancelTitleRef = useRef(false)
  const [panelQuery, setPanelQuery] = useState('')
  const [appliedHere, setAppliedHere] = useState([])
  const [hoverCode, setHoverCode] = useState(null)
  const [expandedCode, setExpandedCode] = useState(null)
  const [flashQuote, setFlashQuote] = useState(null)
  const [findPos, setFindPos] = useState(0)
  const [findQuery, setFindQuery] = useState(() => findTerm || '')
  const [scrollPage, setScrollPage] = useState(null)
  const [dragCode, setDragCode] = useState(null)
  const [dropReady, setDropReady] = useState(false)
  const [ctxMenu, setCtxMenu] = useState(null)
  const [mergePair, setMergePair] = useState(null)
  const [mergeHover, setMergeHover] = useState(null)
  const [dragGhost, setDragGhost] = useState(null) // { label, color, x, y, hint }
  const [quoteHover, setQuoteHover] = useState(null)
  const [flashedCode, setFlashedCode] = useState(null)
  const [collapsedCodes, setCollapsedCodes] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('investigando.collapsedCodes') || '[]')) } catch { return new Set() }
  })

  const toggleCollapse = (id) => {
    setCollapsedCodes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      try { localStorage.setItem('investigando.collapsedCodes', JSON.stringify([...next])) } catch { /* noop */ }
      return next
    })
  }
  const hasChildren = (id) => data.codes.some((c) => c.parentId === id)
  const isHidden = (code) => {
    let p = code.parentId
    while (p) {
      if (collapsedCodes.has(p)) return true
      p = data.codes.find((c) => c.id === p)?.parentId
    }
    return false
  }
  const codeDragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const dragSnapshotRef = useRef(null)
  const [docGroup, setDocGroup] = useState(transcript.group || '')
  const repairingRef = useRef(false)
  const [flashBlock, setFlashBlock] = useState(null)
  const zoomKey = 'investigando.zoom.' + transcript.id
  const [areaMode, setAreaMode] = useState(false)
  const [zoom, setZoom] = useState(() => Number(localStorage.getItem(zoomKey)) || null)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState({ name: '', color: CODE_COLORS[0], parentId: '', memo: '' })
  const [mergeInto, setMergeInto] = useState('')
  const [confirmDel, setConfirmDel] = useState(false)

  const startEdit = (c) => {
    setEditingId(c.id)
    setForm({ name: c.name, color: c.color || CODE_COLORS[0], parentId: c.parentId || '', memo: c.description || '' })
    setMergeInto('')
    setConfirmDel(false)
  }

  const saveEdit = () => {
    if (!editingId) return
    updateCode(editingId, {
      name: form.name.trim() || 'Sem nome',
      color: form.color,
      parentId: form.parentId || null,
      description: form.memo
    })
    setEditingId(null)
  }

  const createAndEdit = (parentId = null) => {
    const c = createCode('Novo código')
    if (parentId) updateCode(c.id, { parentId })
    setTimeout(() => startEdit({ ...c, parentId }), 0)
  }

  const addSubcode = (parent) => {
    const c = createCode('Novo subcódigo')
    updateCode(c.id, { parentId: parent.id })
    setEditingId(c.id)
    setForm({ name: 'Novo subcódigo', color: c.color, parentId: parent.id })
    setMergeInto('')
    setConfirmDel(false)
  }
  const [codesWidth, setCodesWidth] = useState(() => Number(localStorage.getItem('investigando.codesWidth')) || 380)
  const paneRef = useRef(null)
  const popRef = useRef(null)

  const isPdf = transcript.rendererType === 'pdf'
  const isDoc = transcript.dialogue === undefined
    ? transcript.kind === 'document'
    : !transcript.dialogue

  const blocks = useMemo(
    () => parseBlocks(transcript.body, isDoc),
    [transcript.body, isDoc]
  )

  const excerpts = useMemo(
    () => data.excerpts.filter((e) => e.transcriptId === transcript.id),
    [data.excerpts, transcript.id]
  )
  const codesById = useMemo(() => Object.fromEntries(data.codes.map((c) => [c.id, c])), [data.codes])

  useEffect(() => {
    localStorage.setItem('investigando.codesWidth', String(codesWidth))
  }, [codesWidth])

  // zoom: na primeira abertura, ajusta a página à largura do painel; depois, lembra por documento
  const fitWidth = useCallback(() => {
    const w = paneRef.current?.clientWidth || 800
    return Math.min(2, Math.max(0.5, +((w - 56) / 612).toFixed(2)))
  }, [])
  useEffect(() => {
    if (zoom == null) setZoom(fitWidth())
    else localStorage.setItem(zoomKey, String(zoom))
  }, [zoom, zoomKey, fitWidth])

  // Reparo único: reconstrói o texto de citações antigas (spans colados)
  useEffect(() => {
    if (!isPdf || !transcript.fileKey || transcript.textsRepaired || repairingRef.current) return
    const list = excerpts.filter((e) => e.page && Array.isArray(e.rects) && e.rects.length)
    if (!list.length) {
      updateTranscript(transcript.id, { textsRepaired: true })
      return
    }
    repairingRef.current = true
    let cancelled = false
    ;(async () => {
      try {
        const bytes = await readBinary(transcript.fileKey)
        if (!bytes || cancelled) return
        const pages = [...new Set(list.map((e) => e.page))]
        const index = await buildTextIndex(bytes, pages)
        if (cancelled) return
        const map = {}
        for (const e of list) {
          const text = textForRects(index.get(e.page), e.rects)
          if (text && text.length > 3) map[e.id] = text
        }
        if (Object.keys(map).length) repairExcerptTexts(transcript.id, map)
        updateTranscript(transcript.id, { textsRepaired: true })
      } catch (err) {
        console.warn('Reparo de citações falhou', err)
      } finally {
        repairingRef.current = false
      }
    })()
    return () => { cancelled = true }
  }, [isPdf, transcript.id, transcript.fileKey, transcript.textsRepaired, excerpts, repairExcerptTexts, updateTranscript])

  // Reparo/migração de PDFs: garante body extraído e mapa offset→página.
  // (o body pode estar vazio/placeholder e a busca depende dele)
  useEffect(() => {
    if (!isPdf || !transcript.fileKey) return
    const pages = transcript.pageCount || 1
    const bodyLen = (transcript.body || '').length
    const hasOffsets = transcript.pageOffsets && transcript.pageOffsets.length === pages
    const bodyLooksWrong = bodyLen < pages * 50
    if (hasOffsets && !bodyLooksWrong) return

    let cancelled = false
    ;(async () => {
      try {
        const bytes = await readBinary(transcript.fileKey)
        if (!bytes || cancelled) return
        const parsed = await parsePdf(bytes)
        if (cancelled) return
        updateTranscript(transcript.id, {
          body: parsed.body,
          pageCount: parsed.pageCount,
          pageOffsets: parsed.pageOffsets
        })
      } catch (err) {
        console.warn('Reparo do PDF falhou', err)
      }
    })()
    return () => { cancelled = true }
  }, [isPdf, transcript.id, transcript.fileKey, transcript.pageCount, transcript.body, transcript.pageOffsets, updateTranscript])

  // vindo da aba Comentários: abre o inspetor da citação
  useEffect(() => {
    if (!inspectQuote) return
    const ex = excerpts.find((e) => (e.quoteId || e.id) === inspectQuote || e.id === inspectQuote)
    if (!ex) return
    suppressScrollClose.current = Date.now() + 5000
    setFlashQuote(ex.quoteId || ex.id)
    if (ex.page) setScrollPage(ex.page)
    const t2 = setTimeout(() => {
      setActiveExcerpt({ excerpt: ex, x: Math.min(560, window.innerWidth - 380), y: 150 })
    }, 220)
    const t = setTimeout(() => setFlashQuote(null), 2400)
    return () => clearTimeout(t)
  }, [inspectQuote, excerpts])

  // busca no documento (barra de ferramentas)
  const trimmedFind = findQuery.trim()
  const activeTerm = trimmedFind || null
  const hits = useMemo(
    () => (activeTerm ? findHits(transcript.body, activeTerm, transcript.pageOffsets) : []),
    [activeTerm, transcript.body, transcript.pageOffsets]
  )
  const currentHit = hits[findPos] || null

  // vindo da busca global: adota o termo e a ocorrência
  useEffect(() => {
    if (!findTerm) return
    setFindQuery(findTerm)
    const routeHits = findHits(transcript.body, findTerm, transcript.pageOffsets)
    let idx = 0
    if (Number.isFinite(findOcc) && findOcc >= 0) idx = findOcc
    else if (focusPage) {
      const i = routeHits.findIndex((h) => h.page === focusPage)
      if (i >= 0) idx = i
    }
    setFindPos(Math.max(0, Math.min(idx, Math.max(0, routeHits.length - 1))))
  }, [findTerm, findOcc, focusPage, transcript.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const onFindInput = (value) => {
    setFindQuery(value)
    setFindPos(0)
  }

  // PDF: acompanha a página da ocorrência atual
  useEffect(() => {
    if (!activeTerm || !isPdf) return
    const hit = hits[findPos]
    if (hit?.page) setScrollPage(hit.page)
  }, [activeTerm, isPdf, findPos, hits])

  // texto: rola até a ocorrência ativa
  useEffect(() => {
    if (!activeTerm || isPdf || !hits.length) return
    const t = setTimeout(() => {
      const marks = [...document.querySelectorAll('.find-inline')]
      marks.forEach((m) => m.classList.remove('is-active'))
      const el = marks[findPos]
      if (el) {
        el.classList.add('is-active')
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }
      const hit = hits[findPos]
      const nodes = [...document.querySelectorAll('.para-text')]
      const node = nodes.find((n) => hit.offset >= Number(n.dataset.blockStart) && hit.offset <= Number(n.dataset.blockEnd))
      node?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 80)
    return () => clearTimeout(t)
  }, [activeTerm, isPdf, findPos, hits, transcript.id])

  const goFind = (dir) => {
    if (!hits.length) return
    setFindPos((p) => (p + dir + hits.length) % hits.length)
  }

  // copiar seleção: texto puro (sem HTML, links ou colunas do PDF)
  useEffect(() => {
    const onCopy = (e) => {
      const t = e.target
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return
      if (!pendingSel) return
      const text = pendingSel.text || pendingSel.quote || ''
      if (!text) return
      e.preventDefault()
      e.clipboardData?.setData('text/plain', text)
    }
    document.addEventListener('copy', onCopy)
    return () => document.removeEventListener('copy', onCopy)
  }, [pendingSel])

  // teclado: ⌘G / ⇧⌘G navegam, Esc fecha
  useEffect(() => {
    if (!activeTerm) return
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); setFindQuery(''); setFindPos(0); return }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        goFind(e.shiftKey ? -1 : 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTerm, hits.length])

  /** Marca as ocorrências do termo no texto do documento. */
  const renderFind = (text, keyPrefix) => {
    if (!activeTerm || !text) return text
    const re = makeSearchRegex(activeTerm)
    const parts = []
    let last = 0
    let k = 0
    let m
    while ((m = re.exec(text))) {
      if (m.index > last) parts.push(text.slice(last, m.index))
      parts.push(
        <mark key={keyPrefix + '-' + k++} className="find-inline">
          {m[0]}
        </mark>
      )
      last = m.index + m[0].length
      if (m[0].length === 0) re.lastIndex++
    }
    if (last < text.length) parts.push(text.slice(last))
    return parts
  }

  const findControl = (
    <div className="doc-find">
      <span className="doc-find-icon" aria-hidden="true">⌕</span>
      <input
        className="doc-find-input"
        placeholder="Buscar no documento…"
        value={findQuery}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        name="doc-find"
        onChange={(e) => onFindInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); goFind(e.shiftKey ? -1 : 1) }
          if (e.key === 'Escape') { setFindQuery(''); setFindPos(0); e.currentTarget.blur() }
        }}
      />
      {activeTerm && (
        <>
          <span className="doc-find-count">{hits.length ? `${findPos + 1}/${hits.length}` : '0/0'}</span>
          <button className="doc-find-btn" disabled={!hits.length} title={`Anterior (${shiftModKey('G')})`} onClick={() => goFind(-1)}>‹</button>
          <button className="doc-find-btn" disabled={!hits.length} title={`Próxima (${modKey('G')})`} onClick={() => goFind(1)}>›</button>
          <button className="doc-find-btn" title="Limpar busca (Esc)" onClick={() => { setFindQuery(''); setFindPos(0) }}>×</button>
        </>
      )}
    </div>
  )

  const clearSelection = useCallback(() => {
    setAppliedHere([])
    setPendingSel(null)
    window.getSelection()?.removeAllRanges()
  }, [])

  useEffect(() => {
    const close = (e) => {
      if (e.button !== 0) return
      // editor de código inline fecha ao clicar fora dele
      if (!e.target.closest?.('.code-inline-edit')) setEditingId(null)

      const inPopover = !!popRef.current?.contains(e.target)
      const inCodes = !!e.target.closest?.('.codes-pane')
      // clique fora do popover (e fora do painel de códigos) descarta a seleção
      if (!inPopover && !inCodes) {
        setAppliedHere([])
        setPendingSel(null)
        window.getSelection()?.removeAllRanges()
      }
      setActiveExcerpt(null)
      if (!e.target.closest?.('.dropdown')) setMenu(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  // rolar o documento esconde o popover flutuante (a seleção continua no painel)
  useEffect(() => {
    const pane = paneRef.current
    if (!pane) return
    const onScroll = () => {
      if (Date.now() < suppressScrollClose.current) return
      setActiveExcerpt(null)
    }
    pane.addEventListener('scroll', onScroll, { passive: true })
    return () => pane.removeEventListener('scroll', onScroll)
  }, [])

  const flashCode = (id) => {
    setFlashedCode(id)
    setTimeout(() => setFlashedCode((cur) => (cur === id ? null : cur)), 900)
  }

  const startCodeDrag = (e, code) => {
    if (e.button !== 0) return
    if (e.target.closest('button')) return
    dragSnapshotRef.current = pendingSel
    codeDragRef.current = { kind: 'code', code, x: e.clientX, y: e.clientY, moved: false }
  }

  // o ponteiro está sobre a seleção atual? (permite arrastá-la até um código)
  const pointInSelection = (x, y) => {
    if (!pendingSel) return false
    if (pendingSel.pages) {
      for (const p of pendingSel.pages) {
        const el = paneRef.current?.querySelector('.pdf-page[data-page="' + p.page + '"]')
        if (!el) continue
        const r = el.getBoundingClientRect()
        const nx = (x - r.left) / r.width
        const ny = (y - r.top) / r.height
        if ((p.rects || []).some((q) => nx >= q.x && nx <= q.x + q.w && ny >= q.y - 0.004 && ny <= q.y + q.h + 0.004)) return true
      }
      return false
    }
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false
    return [...sel.getRangeAt(0).getClientRects()].some((r) => x >= r.left && x <= r.right && y >= r.top - 2 && y <= r.bottom + 2)
  }

  const startSelectionDrag = (e) => {
    if (e.button !== 0 || e.detail > 1 || !pointInSelection(e.clientX, e.clientY)) return
    e.preventDefault()
    e.stopPropagation()
    dragSnapshotRef.current = pendingSel
    codeDragRef.current = { kind: 'selection', x: e.clientX, y: e.clientY, moved: false }
  }

  // citação (trecho já codificado) sob o ponteiro, no texto ou no PDF
  const quoteAt = (x, y) => {
    const el = document.elementFromPoint(x, y)
    const span = el?.closest?.('[data-quote-id]')
    if (span) return span.dataset.quoteId
    const pageEl = el?.closest?.('.pdf-page[data-page]')
    if (!pageEl) return null
    const r = pageEl.getBoundingClientRect()
    const nx = (x - r.left) / r.width
    const ny = (y - r.top) / r.height
    const page = Number(pageEl.dataset.page)
    const hit = excerpts.find((ex) => Number(ex.page) === page && Array.isArray(ex.rects) &&
      ex.rects.some((q) => nx >= q.x && nx <= q.x + q.w && ny >= q.y && ny <= q.y + q.h))
    return hit ? (hit.quoteId || hit.id) : null
  }



  const startResize = (e) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = codesWidth
    const onMove = (ev) => {
      const next = Math.min(760, Math.max(260, startW - (ev.clientX - startX)))
      setCodesWidth(next)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }



  const handleMouseUp = useCallback((e) => {
    if (isPdf) return
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    const startBlock = range.startContainer.nodeType === 1
      ? range.startContainer.closest('[data-block-start]')
      : range.startContainer.parentElement?.closest('[data-block-start]')
    const endBlock = range.endContainer.nodeType === 1
      ? range.endContainer.closest('[data-block-start]')
      : range.endContainer.parentElement?.closest('[data-block-start]')
    if (!startBlock || !endBlock) return

    const start = Number(startBlock.dataset.blockStart) + pointToOffset(startBlock, range.startContainer, range.startOffset)
    const end = Number(endBlock.dataset.blockStart) + pointToOffset(endBlock, range.endContainer, range.endOffset)
    if (end <= start) return

    setPendingSel({ start, end, quote: transcript.body.slice(start, end) })
  }, [transcript.body])

  useEffect(() => {
    if (isPdf) return
    let timer = null
    const capture = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) return
      if (sel.anchorNode?.parentElement?.closest?.('.codes-pane')) return
      const range = sel.getRangeAt(0)
      const block = range.startContainer.nodeType === 1
        ? range.startContainer.closest('[data-block-start]')
        : range.startContainer.parentElement?.closest('[data-block-start]')
      if (!block) return
      const start = Number(block.dataset.blockStart) + pointToOffset(block, range.startContainer, range.startOffset)
      const end = Number(block.dataset.blockStart) + pointToOffset(block, range.endContainer, range.endOffset)
      if (end > start) setPendingSel({ start, end, quote: transcript.body.slice(start, end) })
    }
    const onChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) return
      clearTimeout(timer)
      timer = setTimeout(capture, 140)
    }
    document.addEventListener('selectionchange', onChange)
    return () => { clearTimeout(timer); document.removeEventListener('selectionchange', onChange) }
  }, [isPdf, transcript.body])

  const handlePdfSelect = useCallback((selection) => {
    setPendingSel({ pages: selection.pages, text: selection.text, area: !!selection.area, thumb: selection.thumb || null })
  }, [])

  const applyCode = (name, selection = pendingSel) => {
    if (!selection || !name.trim()) return
    let code = data.codes.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())
    if (!code) code = createCode(name)
    if (appliedHere.includes(code.id)) return

    // já codificado neste mesmo trecho? evita empilhar destaque (e escurecer a cor)
    const overlaps = (a, b) => {
      const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
      const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
      const min = Math.min(a.w * a.h, b.w * b.h)
      return min > 0 && (x * y) / min > 0.5
    }
    const jaCodificado = selection.pages
      ? data.excerpts.some((e) => {
          if (e.codeId !== code.id || e.transcriptId !== transcript.id || !e.rects) return false
          return selection.pages.some((p) => Number(p.page) === Number(e.page) &&
            p.rects.some((r) => e.rects.some((q) => overlaps(r, q))))
        })
      : data.excerpts.some((e) => e.codeId === code.id && e.transcriptId === transcript.id &&
          e.start < selection.end && e.end > selection.start)

    if (jaCodificado) {
      setAppliedHere((prev) => (prev.includes(code.id) ? prev : [...prev, code.id]))
      return
    }

    const quoteId = selection.quoteId || uid()
    if (!selection.quoteId) setPendingSel((prev) => (prev ? { ...prev, quoteId } : prev))
    if (selection.pages) {
      addPdfExcerpt(transcript.id, code.id, selection.pages, quoteId)
    } else {
      addExcerpt(transcript.id, code.id, selection.start, selection.end, quoteId)
    }
    // mantém a seleção: o mesmo trecho pode receber vários códigos
    setAppliedHere((prev) => [...prev, code.id])
    try { localStorage.setItem('investigando.lastCode', code.id) } catch { /* noop */ }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { clearSelection(); setMenu(null); setActiveExcerpt(null); setCtxMenu(null) }
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable
      if (isPdf && !typing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); setAreaMode((v) => !v) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && pendingSel) {
        const lastId = localStorage.getItem('investigando.lastCode')
        const last = data.codes.find((c) => c.id === lastId)
        if (last) { e.preventDefault(); applyCode(last.name) }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearSelection, pendingSel, data.codes, applyCode])

  useEffect(() => {
    const overPane = (x, y) => {
      const r = paneRef.current?.getBoundingClientRect()
      return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
    }
    const codeRowAt = (x, y) => {
      const el = document.elementFromPoint(x, y)?.closest?.('.code-row')
      const id = el?.dataset?.codeId
      return id ? id : null
    }
    const quoteLabel = (qid) => {
      const names = excerpts.filter((e) => (e.quoteId || e.id) === qid).map((e) => codesById[e.codeId]?.name).filter(Boolean)
      return names.length ? names.join(', ') : 'citação'
    }

    const onMove = (e) => {
      const d = codeDragRef.current
      if (!d) return
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5) return
      if (!d.moved) {
        d.moved = true
        document.body.classList.add('is-dragging')
        if (d.kind === 'code') setDragCode(d.code)
      }
      const target = codeRowAt(e.clientX, e.clientY)
      let hint = ''
      if (d.kind === 'selection') {
        setMergeHover(target)
        const into = target && data.codes.find((c) => c.id === target)
        hint = into ? 'Codificar com “' + into.name + '”' : 'Solte sobre um código'
        setDragGhost({ label: (d.label ||= ((dragSnapshotRef.current?.quote || dragSnapshotRef.current?.text || '').slice(0, 60) + '…')), color: into?.color || 'var(--blue)', x: e.clientX, y: e.clientY, hint })
        return
      }
      window.getSelection()?.removeAllRanges()
      setMergeHover(target && target !== d.code.id ? target : null)
      const inPane = !target && overPane(e.clientX, e.clientY)
      const qid = inPane ? quoteAt(e.clientX, e.clientY) : null
      setQuoteHover(qid)
      setDropReady(inPane && !qid && !!dragSnapshotRef.current)
      if (target && target !== d.code.id) hint = 'Soltar: subcódigo ou mesclar'
      else if (qid) hint = 'Adicionar à citação (' + quoteLabel(qid) + ')'
      else if (inPane && dragSnapshotRef.current) hint = 'Aplicar à seleção'
      else if (inPane) hint = 'Solte sobre um trecho marcado ou selecione um trecho antes'
      setDragGhost({ label: d.code.name, color: d.code.color, x: e.clientX, y: e.clientY, hint })
    }
    const onUp = (e) => {
      const d = codeDragRef.current
      codeDragRef.current = null
      if (d?.moved) {
        const snapshot = dragSnapshotRef.current
        const target = codeRowAt(e.clientX, e.clientY)
        if (d.kind === 'selection') {
          const into = target && data.codes.find((c) => c.id === target)
          if (into && snapshot) { setPendingSel(snapshot); applyCode(into.name, snapshot); flashCode(into.id) }
        } else if (target && target !== d.code.id) {
          const into = data.codes.find((c) => c.id === target)
          if (into) setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'drop-code', from: d.code, into })
        } else if (overPane(e.clientX, e.clientY)) {
          const qid = quoteAt(e.clientX, e.clientY)
          if (qid) { addCodeToQuote(d.code.name, qid); setFlashQuote(qid); setTimeout(() => setFlashQuote(null), 900) }
          else if (snapshot) { setPendingSel(snapshot); applyCode(d.code.name, snapshot); flashCode(d.code.id) }
        }
        dragSnapshotRef.current = null
        suppressClickRef.current = true
        setTimeout(() => { suppressClickRef.current = false }, 0)
      }
      document.body.classList.remove('is-dragging')
      setDragCode(null)
      setDragGhost(null)
      setQuoteHover(null)
      setDropReady(false)
      setMergeHover(null)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [pendingSel, applyCode, excerpts, data.codes])

  const exportTxt = async () => {
    const name = transcript.name.replace(/\.[^.]+$/, '') + '.txt'
    await bridge.saveFile(name, transcript.body, 'text/plain;charset=utf-8')
    setMenu(null)
  }

  const exportExcerptsCsv = async () => {
    const rows = [['Codigo', 'Pagina', 'Trecho']]
    for (const e of excerpts) {
      rows.push([codesById[e.codeId]?.name || '', e.page ?? '', e.text])
    }
    const csv = '\uFEFF' + rows
      .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    await bridge.saveFile(
      transcript.name.replace(/\.[^.]+$/, '') + '-trechos.csv',
      csv,
      'text/csv;charset=utf-8'
    )
  }

  useEffect(() => {
    if (!focusExcerpt) return
    const ex = excerpts.find((e) => e.id === focusExcerpt)
    if (!ex) return
    if (isPdf) {
      setFlashQuote(ex.quoteId || ex.id)
      if (ex.page) setScrollPage(ex.page)
      const t = setTimeout(() => setFlashQuote(null), 2600)
      return () => clearTimeout(t)
    }
    const nodes = [...document.querySelectorAll('.para-text')]
    const el = nodes.find((n) => {
      const start = Number(n.dataset.blockStart)
      const end = Number(n.dataset.blockEnd)
      return ex.start >= start && ex.start <= end
    })
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setFlashBlock(Number(el.dataset.blockStart))
    const t = setTimeout(() => setFlashBlock(null), 2400)
    return () => clearTimeout(t)
  }, [focusExcerpt, excerpts, isPdf])

  const sameCodeQuotes = useMemo(() => {
    if (!activeExcerpt) return []
    const codeId = activeExcerpt.excerpt.codeId
    const map = new Map()
    for (const e of excerpts.filter((x) => x.codeId === codeId)) {
      const qid = e.quoteId || e.id
      if (!map.has(qid)) map.set(qid, e)
    }
    return [...map.values()].sort((a, b) => (a.page || 0) - (b.page || 0) || (a.start || 0) - (b.start || 0))
  }, [activeExcerpt, excerpts])

  const currentQuoteIndex = useMemo(() => {
    if (!activeExcerpt) return -1
    const qid = activeExcerpt.excerpt.quoteId || activeExcerpt.excerpt.id
    return sameCodeQuotes.findIndex((e) => (e.quoteId || e.id) === qid)
  }, [activeExcerpt, sameCodeQuotes])

  const goToQuote = (dir) => {
    if (!sameCodeQuotes.length) return
    const idx = currentQuoteIndex < 0 ? 0 : (currentQuoteIndex + dir + sameCodeQuotes.length) % sameCodeQuotes.length
    const next = sameCodeQuotes[idx]
    setActiveExcerpt((prev) => ({ excerpt: next, x: prev?.x || 200, y: prev?.y || 200 }))
    setFlashQuote(next.quoteId || next.id)
    setTimeout(() => setFlashQuote(null), 2400)
    if (next.page) setScrollPage(next.page)
    else {
      const nodes = [...document.querySelectorAll('.para-text')]
      const el = nodes.find((n) => {
        const start = Number(n.dataset.blockStart)
        const end = Number(n.dataset.blockEnd)
        return next.start >= start && next.start <= end
      })
      if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setFlashBlock(Number(el.dataset.blockStart)); setTimeout(() => setFlashBlock(null), 2400) }
    }
  }

  // códigos que já cobrem o trecho selecionado (integração seleção ↔ citações)
  const coveredCodes = useMemo(() => {
    if (!pendingSel) return []
    const ids = new Set()
    const overlaps = (a, b) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

    if (pendingSel.pages) {
      for (const e of excerpts) {
        if (!e.page || !Array.isArray(e.rects)) continue
        const selPage = pendingSel.pages.find((p) => p.page === e.page)
        if (!selPage) continue
        if (selPage.rects.some((r) => e.rects.some((q) => overlaps(r, q)))) ids.add(e.codeId)
      }
    } else {
      for (const e of excerpts) {
        if (e.start < pendingSel.end && e.end > pendingSel.start) ids.add(e.codeId)
      }
    }
    return [...ids].map((id) => codesById[id]).filter(Boolean)
  }, [pendingSel, excerpts, codesById])

  const quoteGroup = useMemo(() => {
    if (!activeExcerpt) return []
    const qid = activeExcerpt.excerpt.quoteId || activeExcerpt.excerpt.id
    return excerpts.filter((e) => (e.quoteId || e.id) === qid)
  }, [activeExcerpt, excerpts])

  const quoteId = activeExcerpt ? (activeExcerpt.excerpt.quoteId || activeExcerpt.excerpt.id) : null
  const quoteComment = useMemo(
    () => (quoteId ? ((data.memos || []).find((m) => m.quoteId === quoteId && m.kind === 'comment')?.text || '') : ''),
    [quoteId, data.memos]
  )
  const [commentDraft, setCommentDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [editingQuote, setEditingQuote] = useState(false)
  const [quoteDraft, setQuoteDraft] = useState('')
  const [toast, setToast] = useState(null)
  const commentedIds = useMemo(
    () => new Set((data.memos || []).filter((m) => m.kind === 'comment' && (m.text || '').trim()).map((m) => m.quoteId)),
    [data.memos]
  )
  const commentTimeout = useRef(null)
  const suppressScrollClose = useRef(0)
  useEffect(() => { setCommentDraft(quoteComment) }, [quoteComment])
  useEffect(() => { setCopied(false); setEditingQuote(false); setQuoteDraft('') }, [quoteId])
  useEffect(() => () => clearTimeout(commentTimeout.current), [])

  const removeQuoteNow = useCallback(() => {
    if (!quoteId || !quoteGroup.length) return
    const ids = new Set(quoteGroup.map((e) => e.id))
    clearTimeout(commentTimeout.current)
    update((d) => ({
      ...d,
      excerpts: d.excerpts.filter((e) => !ids.has(e.id)),
      memos: (d.memos || []).filter((m) => m.quoteId !== quoteId)
    }))
    setActiveExcerpt(null)
    setToast('Citação removida')
  }, [quoteId, quoteGroup, update])

  const saveQuoteText = () => {
    const text = quoteDraft.trim()
    if (!quoteId || !text) return
    update((d) => ({
      ...d,
      excerpts: d.excerpts.map((e) => (((e.quoteId || e.id) === quoteId) ? { ...e, text } : e))
    }))
    setActiveExcerpt((prev) => (prev ? { ...prev, excerpt: { ...prev.excerpt, text } } : prev))
    setEditingQuote(false)
  }

  // Delete/Backspace apaga a citação aberta (fora de campos de texto)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = e.target
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return
      if (!activeExcerpt || pendingSel) return
      e.preventDefault()
      removeQuoteNow()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [activeExcerpt, pendingSel, removeQuoteNow])

  const onCommentChange = (value) => {
    setCommentDraft(value)
    clearTimeout(commentTimeout.current)
    commentTimeout.current = setTimeout(() => saveMemo(quoteId, value, 'comment'), 500)
  }

  const addCodeToQuote = (name, qid = quoteId) => {
    if (!qid || !name.trim()) return
    let code = data.codes.find((c) => c.name.toLowerCase() === name.trim().toLowerCase())
    if (!code) code = createCode(name)
    const all = excerpts.filter((e) => (e.quoteId || e.id) === qid)
    if (!all.length) return
    if (all.some((g) => g.codeId === code.id)) return
    // uma citação de PDF pode ter várias páginas: copia as páginas de um único código
    const group = all.filter((g) => g.codeId === all[0].codeId)
    if (group[0].page) {
      addPdfExcerpt(transcript.id, code.id, group.map((g) => ({ page: g.page, rects: g.rects, text: g.text, area: g.area, thumb: g.thumb })), qid)
    } else {
      addExcerpt(transcript.id, code.id, group[0].start, group[0].end, qid)
    }
  }

  const treeRows = useMemo(() => flattenTree(data.codes), [data.codes])
  const startTitleEdit = () => {
    setTitleDraft(transcript.name)
    setEditingTitle(true)
  }

  const commitTitle = () => {
    if (cancelTitleRef.current) {
      cancelTitleRef.current = false
      setEditingTitle(false)
      return
    }
    const name = titleDraft.trim()
    if (name && name !== transcript.name) updateTranscript(transcript.id, { name })
    setEditingTitle(false)
  }

  const stats = useMemo(() => codeStats(data.codes, excerpts), [data.codes, excerpts])
  const codeList = treeRows
    .filter(({ code }) => !isHidden(code))
    .map(({ code, depth }) => {
      const st = stats.get(code.id) || { direct: 0, total: 0 }
      return { ...code, depth, count: st.direct, total: st.total }
    })
    .filter((c) => c.name.toLowerCase().includes(panelQuery.toLowerCase()))

  return (
    <>
      <div className="topbar">
        {editingTitle
          ? (
            <input
              className="doc-title-input"
              value={titleDraft}
              autoFocus
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') {
                  cancelTitleRef.current = true
                  setEditingTitle(false)
                  e.currentTarget.blur()
                }
              }}
              aria-label="Nome do documento"
            />
          )
          : (
            <div className="doc-title">
              <h1 title={transcript.name} onClick={startTitleEdit}>{transcript.name}</h1>
              <button
                type="button"
                className="doc-title-edit"
                title="Renomear documento"
                aria-label="Renomear documento"
                onClick={startTitleEdit}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                  <path d="M4 20h4l10-10-4-4L4 16v4z" />
                  <path d="M13.5 6.5l4 4" />
                </svg>
              </button>
            </div>
          )}
        <div className="topbar-actions">
          <div className="dropdown">
            <button className="btn btn--ghost" aria-label="Mais ações do documento" aria-haspopup="menu" onClick={() => setMenu(menu === 'more' ? null : 'more')}>Documento ▾</button>
            {menu === 'more' && (
              <div className="dropdown-menu" style={{ right: 0, left: 'auto' }}>
                {isPdf && <button onClick={() => { setMenu(null); exportExcerptsCsv() }}>Exportar trechos (.csv)</button>}
                <button onClick={() => { setMenu(null); startTitleEdit() }}>Renomear documento</button>
                <button onClick={exportTxt}>Exportar documento (.txt)</button>
                <button onClick={() => { setMenu(null); navigate('/documents/' + transcript.id + '/print') }}>
                  Exportar com códigos (.pdf)
                </button>
                <button onClick={() => { setMenu(null); setConfirmDelete(true) }} style={{ color: 'var(--error-text)' }}>
                  Excluir documento
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="editor" style={{ gridTemplateColumns: `minmax(320px, 1fr) 6px ${codesWidth}px` }}>
        <div
          className={'transcript-pane' + (dropReady ? ' drop-ready' : '')}
          ref={paneRef}
          onMouseDownCapture={startSelectionDrag}
          onMouseUp={handleMouseUp}
          onContextMenu={(e) => {
            if (!pendingSel) return
            e.preventDefault()
            setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'selection' })
          }}
        >
          {isPdf
            ? (
              <>
                <div className="transcript-tools" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {findControl}

                  <button
                    type="button"
                    className={'area-toggle' + (areaMode ? ' is-on' : '')}
                    aria-pressed={areaMode}
                    title="Modo Área: desenhe um retângulo sobre uma figura, gráfico ou quadro para codificá-lo (A)"
                    onClick={() => setAreaMode((v) => !v)}
                  >
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 2" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="1.5" /></svg>
                    Área
                  </button>
                  <div className="pdf-zoom" style={{ marginLeft: 'auto' }}>
                    <span className="label">
                      {transcript.pageCount ? `${transcript.pageCount} páginas` : 'PDF'}
                    </span>
                    <button className="icon-btn" title="Diminuir zoom" aria-label="Diminuir zoom" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}>−</button>
                    <span className="label" style={{ width: 40, textAlign: 'center' }}>{Math.round((zoom || 1) * 100)}%</span>
                    <button className="icon-btn" title="Aumentar zoom" aria-label="Aumentar zoom" onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.1).toFixed(2)))}>+</button>
                    <button className="btn btn--ghost btn--sm" title="Ajustar a página à largura" onClick={() => setZoom(fitWidth())}>Ajustar</button>
                  </div>
                  <button
                    className="icon-btn"
                    title="Informações do documento"
                    onClick={() => { setRenameValue(transcript.name); setParticipant(true) }}
                  >
                    ⓘ
                  </button>
                </div>

                {zoom != null && (
                <PdfViewer
                  fileKey={transcript.fileKey}
                  focusPage={currentHit?.page || scrollPage || focusPage}
                  findTerm={activeTerm}
                  findIndex={currentHit ? indexOnPage(hits, findPos) : 0}
                  flashQuoteId={flashQuote}
                  selectionActive={!!pendingSel}
                  commentedIds={commentedIds}
                  excerpts={excerpts.map((e) => ({ ...e, color: codesById[e.codeId]?.color }))}
                  scale={zoom || 1}
                  areaMode={areaMode}
                  onSelect={handlePdfSelect}
                  hoverCodeId={hoverCode}
                  onHighlightClick={(ex, e) => {
                    e.stopPropagation()
                    setActiveExcerpt({ excerpt: ex, x: e.clientX, y: e.clientY })
                  }}
                />
                )}
              </>
            )
            : (
              <>
                <div className="transcript-tools" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {findControl}
                  <button
                    className="icon-btn"
                    style={{ marginLeft: 'auto' }}
                    title="Informações do documento"
                    onClick={() => { setRenameValue(transcript.name); setParticipant(true) }}
                  >
                    ⓘ
                  </button>
                </div>

                {blocks.map((b, i) => (
                  <div className={'paragraph' + (isDoc ? ' paragraph--doc' : '')} key={i}>
                    {!isDoc && (
                      <div
                        className="avatar"
                        style={{ background: b.speaker ? colorForSpeaker(b.speaker) : 'var(--delve-ultra-light-grey)' }}
                      >
                        {b.speaker ? initials(b.speaker) : ''}
                      </div>
                    )}
                    <div className="para-main">
                      {!isDoc && (
                        <div className="para-meta">
                          {b.time && <span className="time">{b.time}</span>}
                          {b.time && b.speaker && <span className="time"> · </span>}
                          {b.speaker && <span className="who">{b.speaker}</span>}
                        </div>
                      )}
                      <div
                        className={'para-text' + (flashBlock === b.start ? ' para-text--flash' : '')}
                        data-block-start={b.start}
                        data-block-end={b.end}
                      >
                        {segmentsFor(excerpts, b.contentStart, b.contentEnd).map((seg, j) => {
                          const text = transcript.body.slice(seg.from, seg.to)
                          if (!seg.excerpt) return <React.Fragment key={j}>{renderFind(text, 'p' + i + '-' + j)}</React.Fragment>
                          const code = codesById[seg.excerpt.codeId]
                          return (
                            <span
                              key={j}
                              className={'excerpt' + (hoverCode === seg.excerpt.codeId ? ' excerpt--hover' : '') + (quoteHover && quoteHover === (seg.excerpt.quoteId || seg.excerpt.id) ? ' excerpt--drop' : '')}
                              data-quote-id={seg.excerpt.quoteId || seg.excerpt.id}
                              style={{ backgroundColor: tint(code?.color || '#FFE28B', hoverCode === seg.excerpt.codeId ? 0.38 : 0.24) }}
                              title={code?.name}
                              onClick={(e) => {
                                e.stopPropagation()
                                setActiveExcerpt({ excerpt: seg.excerpt, x: e.clientX, y: e.clientY })
                              }}
                            >
                              {renderFind(text, 'e' + i + '-' + j)}
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
        </div>

        <div className="splitter" onMouseDown={startResize} title="Arraste para ajustar a largura" />

        <div className="codes-pane">
          <div className="codes-head">
            <h2>Códigos</h2>
            <button className="btn btn--sm" onClick={() => createAndEdit(null)} title="Criar código na raiz">
              + Código
            </button>
          </div>

          {pendingSel && (
            <div className="selection-strip">
              {pendingSel.thumb && <img className="selection-thumb" src={pendingSel.thumb} alt="Recorte selecionado" />}
              <div
                className="selection-strip-quote"
                title={(pendingSel.quote || pendingSel.text || '') + '\n\nArraste a seleção até um código para codificar'}
              >
                “{pendingSel.quote || pendingSel.text || ''}”
              </div>
              <div className="selection-strip-meta">
                <span className="selection-strip-where">
                  {pendingSel.pages ? `pág. ${pendingSel.pages.map((p) => p.page).join(', ')}` : 'trecho'}
                  {(() => {
                    const ids = [...new Set([...coveredCodes.map((c) => c.id), ...appliedHere])]
                    if (!ids.length) return ' · clique ou arraste até um código'
                    return (
                      <> · codificado em:{' '}
                        {ids.map((id) => codesById[id]).filter(Boolean).map((c) => (
                          <span key={c.id} className="covered-chip"><span className="code-dot" style={{ background: c.color }} />{c.name}</span>
                        ))}
                      </>
                    )
                  })()}
                </span>
                <button
                  className="strip-btn strip-copy"
                  title="Copiar texto puro"
                  onClick={async () => {
                    const text = pendingSel.text || pendingSel.quote || ''
                    if (text) await copyText(text)
                  }}
                >Copiar</button>
                <button
                  className="strip-btn"
                  title="Criar código com este texto"
                  onClick={() => {
                    const t = (pendingSel.text || pendingSel.quote || '').trim().slice(0, 60)
                    if (t) applyCode(t)
                  }}
                >＋</button>
                <button className="strip-btn" title="Descartar seleção" onClick={clearSelection}>×</button>
              </div>
            </div>
          )}

          <input
            className={'input' + (pendingSel ? ' input--attention' : '')}
            placeholder={pendingSel ? 'Digite o código e pressione Enter' : 'Buscar ou adicionar códigos'}
            value={panelQuery}
            onChange={(e) => setPanelQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                const name = e.currentTarget.value
                if (pendingSel) applyCode(name)
                else createCode(name)
                setPanelQuery('')
              }
            }}
            style={{ marginBottom: 10 }}
          />

          {!pendingSel && data.codes.length === 0 && (
            <div className="hint">
              <span className="big">Adicione um código.</span>
              Selecione um trecho no documento e digite o nome do código acima.
            </div>
          )}
          {!pendingSel && data.codes.length > 0 && excerptCountAll(excerpts) === 0 && (
            <div className="hint-line">Selecione um trecho e clique num código — ou arraste o código até o trecho.</div>
          )}

          <div className="code-list">
            {codeList.map((c) => (
              <React.Fragment key={c.id}>
              <div
                className={'code-row' + (dragCode?.id === c.id ? ' dragging' : '') + (mergeHover === c.id ? ' drop-merge' : '') + (flashedCode === c.id ? ' code-row--flash' : '')}
                data-code-id={c.id}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    if (pendingSel) { applyCode(c.name); flashCode(c.id) } else setExpandedCode(expandedCode === c.id ? null : c.id)
                  }
                }}
                style={{ paddingLeft: 8 + (c.depth || 0) * 14 }}
                onMouseDown={(e) => startCodeDrag(e, c)}
                onClick={() => {
                  if (suppressClickRef.current) return
                  if (pendingSel) { applyCode(c.name); flashCode(c.id) } else setExpandedCode(expandedCode === c.id ? null : c.id)
                }}
                onMouseEnter={() => setHoverCode(c.id)}
                onMouseLeave={() => setHoverCode(null)}
                onContextMenu={(e) => {
                  e.preventDefault()
                  setEditingId(null)
                  setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'code', code: c })
                }}
                title={pendingSel ? 'Clique (ou arraste a seleção até aqui) para codificar' : 'Arraste para um trecho marcado, para outro código (subcódigo/mesclar) ou clique para ver as citações'}
              >
                {hasChildren(c.id)
                  ? (
                    <button
                      className="tree-toggle"
                      title={collapsedCodes.has(c.id) ? 'Expandir subcódigos' : 'Recolher subcódigos'}
                      onClick={(e) => { e.stopPropagation(); toggleCollapse(c.id) }}
                    >
                      {collapsedCodes.has(c.id) ? '▸' : '▾'}
                    </button>
                  )
                  : <span className="tree-toggle tree-toggle--empty" />}
                <span className="code-dot" style={{ background: c.color }} />
                <span className="code-name">{c.name}</span>
                {appliedHere.includes(c.id) && <span className="code-applied">✓</span>}
                <span className="code-count" title={`${c.count} diretos · ${c.total} incluindo subcódigos`}>
                  {c.count}{c.total !== c.count ? <span className="code-count-total"> / {c.total}</span> : null}
                </span>
                <button
                  className="code-manage"
                  aria-label={'Editar código ' + c.name}
                  title="Editar código (nome, cor, hierarquia, mesclar, excluir)"
                  onClick={(e) => { e.stopPropagation(); startEdit(c) }}
                >
                  ⋯
                </button>
              </div>

              {!pendingSel && expandedCode === c.id && (
                <div className="code-quotes">
                  {excerpts.filter((e) => e.codeId === c.id).length === 0 && (
                    <div className="code-quotes-empty">Nenhuma citação deste código neste documento.</div>
                  )}
                  {excerpts
                    .filter((e) => e.codeId === c.id)
                    .slice(0, 8)
                    .map((e) => (
                      <button
                        key={e.id}
                        className="code-quote"
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setActiveExcerpt({ excerpt: e, x: ev.clientX, y: ev.clientY })
                          setFlashQuote(e.quoteId || e.id)
                          setTimeout(() => setFlashQuote(null), 2400)
                          if (e.page) setScrollPage(e.page)
                        }}
                      >
                        <span className="code-quote-text">
                          {e.thumb && <img className="code-quote-thumb" src={e.thumb} alt="" />}
                          {e.page ? `p.${e.page} · ` : ''}{e.text.slice(0, 90)}
                        </span>
                      </button>
                    ))}
                </div>
              )}
              {editingId === c.id && (
                <div className="code-inline-edit" onClick={(e) => e.stopPropagation()}>
                  <label className="field-label">Nome</label>
                  <input
                    className="input"
                    autoFocus
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit() }}
                  />

                  <label className="field-label" style={{ marginTop: 10 }}>Cor</label>
                  <div className="inline-colors">
                    {CODE_COLORS.map((cor) => (
                      <button
                        key={cor}
                        className={'color-dot' + (cor.toLowerCase() === (form.color || '').toLowerCase() ? ' active' : '')}
                        style={{ background: cor }}
                        onClick={() => setForm((f) => ({ ...f, color: cor }))}
                      />
                    ))}
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                      title="Outra cor"
                    />
                  </div>

                  <label className="field-label" style={{ marginTop: 10 }}>Definição / memo do código</label>
                  <textarea
                    className="code-description"
                    style={{ borderColor: 'var(--gray-200)', background: '#fff', minHeight: 56 }}
                    placeholder="Critérios, ideias, relação com outros códigos…"
                    value={form.memo}
                    onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                  />

                  <label className="field-label" style={{ marginTop: 10 }}>Código pai</label>
                  <select
                    className="input"
                    value={form.parentId}
                    onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                  >
                    <option value="">— nenhum (raiz) —</option>
                    {flattenTree(data.codes.filter((x) => x.id !== c.id && !descendantsOf(data.codes, c.id).includes(x.id)))
                      .map(({ code: pc, depth }) => (
                        <option key={pc.id} value={pc.id}>{'   '.repeat(depth)}{depth ? '↳ ' : ''}{pc.name}</option>
                      ))}
                  </select>

                  <div className="inline-actions">
                    <button className="btn btn--sm" onClick={() => addSubcode(c)}>+ Subcódigo</button>
                    {c.parentId && (
                      <button
                        className="btn btn--sm"
                        title="Tirar do código pai e voltar à raiz"
                        onClick={() => { updateCode(c.id, { parentId: null }); setEditingId(null) }}
                      >
                        Mover para a raiz
                      </button>
                    )}
                    <button
                      className="btn btn--sm"
                      style={{ color: 'var(--error-text)', borderColor: 'var(--error-text)' }}
                      onClick={() => {
                        if (!confirmDel) { setConfirmDel(true); return }
                        deleteCode(c.id)
                        setEditingId(null)
                      }}
                    >
                      {confirmDel ? 'Confirmar?' : 'Excluir'}
                    </button>
                  </div>

                  <label className="field-label" style={{ marginTop: 10 }}>Mesclar em</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <select className="input" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
                      <option value="">— escolher —</option>
                      {data.codes.filter((x) => x.id !== c.id).map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </select>
                    <button
                      className="btn btn--sm"
                      disabled={!mergeInto}
                      onClick={() => { mergeCodes(c.id, mergeInto); setEditingId(null) }}
                    >
                      Mesclar
                    </button>
                  </div>

                  <div className="inline-actions" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
                    <button className="btn btn--sm" onClick={() => setEditingId(null)}>Cancelar</button>
                    <button className="btn btn--sm btn--blue" onClick={saveEdit}>Salvar</button>
                  </div>
                </div>
              )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {activeExcerpt && (
        <div
          className="add-code-popover"
          ref={popRef}
          style={{
            width: 320,
            left: Math.min(activeExcerpt.x, window.innerWidth - 340),
            top: Math.min(activeExcerpt.y + 12, window.innerHeight - 320)
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <strong style={{ fontSize: 12.5 }}>Citação</strong>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              {quoteGroup.length} código{quoteGroup.length === 1 ? '' : 's'}
            </span>
            <span style={{ flex: 1 }} />
            {sameCodeQuotes.length > 1 && (
              <span className="quote-nav">
                <button className="strip-btn" title="Citação anterior" onClick={() => goToQuote(-1)}>‹</button>
                <span>{currentQuoteIndex + 1}/{sameCodeQuotes.length}</span>
                <button className="strip-btn" title="Próxima citação" onClick={() => goToQuote(1)}>›</button>
              </span>
            )}
          </div>
          {editingQuote
            ? (
              <div className="quote-edit">
                <textarea
                  autoFocus
                  rows={4}
                  value={quoteDraft}
                  onChange={(e) => setQuoteDraft(e.target.value)}
                  placeholder="Texto da citação…"
                />
                <div className="quote-edit-actions">
                  <button className="btn--link" onClick={() => setEditingQuote(false)}>Cancelar</button>
                  <button className="btn btn--blue btn--sm" disabled={!quoteDraft.trim()} onClick={saveQuoteText}>Salvar</button>
                </div>
              </div>
            )
            : (
              <div className="quote">
                {activeExcerpt.excerpt.thumb && <img className="popover-thumb" src={activeExcerpt.excerpt.thumb} alt="Recorte codificado" />}
                “{activeExcerpt.excerpt.text.slice(0, 140)}”
                <button
                  className="quote-edit-btn"
                  title="Editar o texto desta citação"
                  onClick={() => { setQuoteDraft(activeExcerpt.excerpt.text); setEditingQuote(true) }}
                >
                  Editar
                </button>
              </div>
            )}

          <div className="quote-codes">
            {quoteGroup.map((g) => {
              const c = codesById[g.codeId]
              return (
                <div className="quote-code" key={g.id}>
                  <span className="code-dot" style={{ background: c?.color }} />
                  <span className="quote-code-name">{c?.name || '—'}</span>
                  <button
                    className="quote-code-remove"
                    title="Remover este código da citação"
                    onClick={() => removeExcerpt(g.id)}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>

          <input
            className="input"
            placeholder="Adicionar outro código…"
            style={{ marginTop: 8, padding: '6px 8px', fontSize: 13 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                addCodeToQuote(e.currentTarget.value)
                e.currentTarget.value = ''
              }
            }}
          />

          <textarea
            className="quote-memo quote-comment"
            placeholder="Comentário…"
            rows={2}
            value={commentDraft}
            onChange={(e) => onCommentChange(e.target.value)}
            onBlur={() => saveMemo(quoteId, commentDraft, 'comment')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                e.currentTarget.blur()
              }
            }}
          />

          <div className="quote-actions">
            <button
              type="button"
              className="quote-action"
              onClick={async () => {
                const ex = activeExcerpt?.excerpt
                if (!ex) return
                const ok = await copyText(quoteToText(ex.text, ex.page))
                if (!ok) return
                setCopied(true)
                setTimeout(() => setCopied(false), 1400)
              }}
            >
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <span className="quote-hint">{`Tecla Delete remove a citação · ${modKey('Z')} desfaz`}</span>
          </div>
        </div>
      )}

      {ctxMenu && ctxMenu.kind === 'selection' && pendingSel && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            ...data.codes.slice(0, 10).map((c) => ({
              label: 'Codificar: ' + c.name,
              onClick: () => applyCode(c.name)
            })),
            ...(data.codes.length ? [{ sep: true }] : []),
            {
              label: '＋ Novo código com este texto',
              onClick: () => {
                const t = (pendingSel.text || pendingSel.quote || '').trim().slice(0, 60)
                if (t) applyCode(t)
              }
            }
          ]}
        />
      )}

      {ctxMenu && ctxMenu.kind === 'code' && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            { label: 'Editar código…', onClick: () => startEdit(ctxMenu.code) },
            { label: 'Novo subcódigo', onClick: () => addSubcode(ctxMenu.code) },
            { label: 'Mesclar em…', onClick: () => setMergePair({ from: ctxMenu.code, into: '' }) },
            ...(pendingSel ? [{ label: 'Aplicar ao trecho', onClick: () => applyCode(ctxMenu.code.name) }] : []),
            { sep: true },
            {
              label: 'Excluir código…',
              danger: true,
              onClick: () => { startEdit(ctxMenu.code); setConfirmDel(true) }
            }
          ]}
        />
      )}

      {ctxMenu && ctxMenu.kind === 'drop-code' && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          items={[
            { label: 'Tornar subcódigo de “' + ctxMenu.into.name + '”', onClick: () => { moveCode(ctxMenu.from.id, ctxMenu.into.id, 'inside'); flashCode(ctxMenu.from.id) } },
            { label: 'Colocar logo abaixo de “' + ctxMenu.into.name + '”', onClick: () => moveCode(ctxMenu.from.id, ctxMenu.into.id, 'after') },
            { sep: true },
            { label: 'Mesclar em “' + ctxMenu.into.name + '”…', onClick: () => setMergePair({ from: ctxMenu.from, into: ctxMenu.into.id }) }
          ]}
        />
      )}

      {dragGhost && (
        <div
          className="drag-ghost"
          style={dragGhost.x > window.innerWidth - 320
            ? { right: window.innerWidth - dragGhost.x + 14, top: dragGhost.y + 12 }
            : { left: dragGhost.x + 14, top: dragGhost.y + 12 }}
          aria-hidden="true"
        >
          <span className="drag-ghost-label">
            <span className="code-dot" style={{ background: dragGhost.color }} />
            {dragGhost.label}
          </span>
          {dragGhost.hint && <span className="drag-ghost-hint">{dragGhost.hint}</span>}
        </div>
      )}

      {mergePair && (
        <div className="import-modal" onClick={() => setMergePair(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Mesclar “{mergePair.from.name}”</h3>
            <p className="modal-sub">
              Os trechos de “{mergePair.from.name}” passam para o código escolhido; subcódigos são mantidos
              e o código absorvido sai do codebook.
            </p>
            <select
              className="input"
              value={mergePair.into}
              onChange={(e) => setMergePair({ ...mergePair, into: e.target.value })}
            >
              <option value="">— escolher código —</option>
              {data.codes.filter((c) => c.id !== mergePair.from.id).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="modal-actions">
              <button className="btn" onClick={() => setMergePair(null)}>Cancelar</button>
              <button
                className="btn btn--blue"
                disabled={!mergePair.into}
                onClick={() => { mergeCodes(mergePair.from.id, mergePair.into); setMergePair(null) }}
              >
                Mesclar
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="import-modal" onClick={() => setConfirmDelete(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Excluir documento</h3>
            <p className="modal-sub">
              “{transcript.name}” e os {excerpts.length} trechos codificados nele serão removidos. Essa ação não pode ser desfeita.
            </p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button
                className="btn"
                style={{ background: 'var(--error-text)', borderColor: 'var(--error-text)', color: '#fff' }}
                onClick={() => { deleteTranscript(transcript.id); navigate('/documents') }}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {participant && (
        <div className="import-modal" onClick={() => setParticipant(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Informações do documento</h3>
            <p className="modal-sub">Como este documento deve aparecer no projeto.</p>
            <label className="field-label">Nome</label>
            <input className="input" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />

            <label className="field-label" style={{ marginTop: 14 }}>Grupo</label>
            <input
              className="input"
              list="doc-groups"
              value={docGroup}
              onChange={(e) => setDocGroup(e.target.value)}
              placeholder="Ex.: Entrevistas, Artigos, Teses"
            />
            <datalist id="doc-groups">
              {[...new Set(data.transcripts.map((t) => t.group).filter(Boolean))].map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>

            <div className="modal-actions">
              <button className="btn" onClick={() => setParticipant(false)}>Cancelar</button>
              <button
                className="btn btn--blue"
                onClick={() => {
                  const patch = { group: docGroup.trim() }
                  if (renameValue.trim()) patch.name = renameValue.trim()
                  updateTranscript(transcript.id, patch)
                  setParticipant(false)
                }}
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <Toast
          text={toast + ` · ${modKey('Z')} para desfazer`}
          onUndo={undo}
          onClose={() => setToast(null)}
        />
      )}
    </>
  )
}

function excerptCountAll (excerpts) {
  return excerpts.length
}
