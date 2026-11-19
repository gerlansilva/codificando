import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { makeSearchRegex } from '../lib/search.js'
import { tintAlpha } from '../lib/colors.js'
import { readBinary } from '../lib/files.js'
import { ensurePdfJs } from '../lib/importers.js'

/**
 * Visualizador de PDF com camada de texto selecionável e destaques por cima
 * da página — o mesmo modelo de trabalho do Atlas.ti: o documento original
 * permanece visível e a codificação é ancorada em retângulos da página.
 */

export default function PdfViewer ({ fileKey, excerpts, scale, onSelect, onHighlightClick, focusPage = null, hoverCodeId = null, flashQuoteId = null, selectionActive = false, findTerm = null, findIndex = 0, commentedIds = null }) {
  const [doc, setDoc] = useState(null)
  const [error, setError] = useState(null)
  const [size, setSize] = useState({ width: 595, height: 842 })
  const [selection, setSelection] = useState([])
  const containerRef = useRef(null)
  const dragRef = useRef(null)
  const boundsRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setDoc(null)
    setError(null)
    readBinary(fileKey).then(async (bytes) => {
      if (cancelled) return
      if (!bytes || !bytes.length) { setError('Arquivo PDF não encontrado.'); return }
      const lib = await ensurePdfJs()
      if (cancelled) return
      lib.getDocument({ data: bytes }).promise.then((d) => {
        if (cancelled) return
        setDoc(d)
        d.getPage(1).then((p) => {
          const vp = p.getViewport({ scale: 1 })
          setSize({ width: vp.width, height: vp.height })
        })
      }).catch((e) => setError('Não foi possível abrir o PDF: ' + (e?.message || e)))
    })
    return () => { cancelled = true }
  }, [fileKey])

  // se o estado da seleção foi limpo no editor, apaga o overlay
  useEffect(() => {
    if (!selectionActive) setSelection([])
  }, [selectionActive])

  useEffect(() => {
    if (!doc || !focusPage) return
    const el = containerRef.current?.querySelector(`[data-page="${focusPage}"]`)
    if (el) el.scrollIntoView({ block: 'start' })
  }, [doc, focusPage])

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setSelection([])
      return
    }
    const range = sel.getRangeAt(0)
    // só vale seleção dentro do PDF (Cmd+A na página não pode pegar a interface)
    if (!containerRef.current?.contains(range.commonAncestorContainer)) { setSelection([]); return }
    const raw = rectsByPage(range)
    if (!raw.length) { setSelection([]); return }
    const text = selectionText(range)
    if (!text) { setSelection([]); return }
    const b = boundsRef.current
    const useBounds = b && Date.now() - b.t < 3000 ? b : null
    const cleaned = cleanSelection(raw, text, containerRef.current, useBounds)
    if (!cleaned.pages.length || !cleaned.text) { setSelection([]); return }
    const visual = buildSelectionText(cleaned.pages, containerRef.current, range)
    const finalText = visual || cleaned.text
    cleaned.pages.forEach((p) => { p.text = finalText })
    setSelection(cleaned.pages)
    onSelect({ pages: cleaned.pages, text: finalText })
  }, [onSelect])

  // trecho codificado sob o ponteiro (os destaques têm pointer-events: none)
  const hitExcerptAt = useCallback((clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY)
    const pageEl = el?.closest?.('[data-page]')
    if (!pageEl) return null
    const pr = pageEl.getBoundingClientRect()
    const x = (clientX - pr.left) / pr.width
    const y = (clientY - pr.top) / pr.height
    const page = Number(pageEl.dataset.page)
    return excerpts.find(
      (ex) => Number(ex.page) === page &&
        Array.isArray(ex.rects) &&
        ex.rects.some((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h)
    ) || null
  }, [excerpts])

  // Arrasto próprio: o WebKit não estende a seleção nativa nesta camada.
  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    if (e.detail > 1) {
      const hit = hitExcerptAt(e.clientX, e.clientY)
      if (hit) {
        e.preventDefault()
        window.getSelection()?.removeAllRanges()
        onHighlightClick(hit, e)
      }
      return
    }
    if (!containerRef.current?.contains(e.target)) return
    const caret = caretInText(e.clientX, e.clientY, containerRef.current)
    if (!caret) return
    e.preventDefault()
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(caret)
    dragRef.current = { x: e.clientX, y: e.clientY, anchor: caret, moved: false, startLine: caretLine(caret) }
  }, [hitExcerptAt, onHighlightClick])

  // clique (sem arrasto) sobre um trecho codificado abre o inspetor
  const handleClick = useCallback((e) => {
    if (e?.detail > 1) return
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) return
    const hit = hitExcerptAt(e.clientX, e.clientY)
    if (hit) onHighlightClick(hit, e)
  }, [hitExcerptAt, onHighlightClick])

  // duplo clique também abre (mais tolerante a pequenos arrastos)
  const handleDoubleClick = useCallback((e) => {
    const hit = hitExcerptAt(e.clientX, e.clientY)
    if (hit) onHighlightClick(hit, e)
  }, [hitExcerptAt, onHighlightClick])

  useEffect(() => {
    const pointer = { x: 0, y: 0 }
    let raf = 0

    const extend = (x, y) => {
      const d = dragRef.current
      if (!d) return
      const caret = caretInText(x, y, containerRef.current)
      if (!caret) return
      try {
        const range = document.createRange()
        const forward = d.anchor.compareBoundaryPoints(Range.START_TO_START, caret) <= 0
        const a = forward ? d.anchor : caret
        const b = forward ? caret : d.anchor
        range.setStart(a.startContainer, a.startOffset)
        range.setEnd(b.startContainer, b.startOffset)
        const sel = window.getSelection()
        sel.removeAllRanges()
        sel.addRange(range)
        const pages = rectsByPage(range)
        if (pages.length) {
          setSelection(pages)
          const text = selectionText(range)
          if (text) {
            pages.forEach((pg) => { pg.text = text })
            onSelect({ pages, text })
          }
        }
      } catch { /* seleção inválida */ }
    }

    // rola o painel quando o cursor chega perto da borda (seleção longa)
    const autoScroll = () => {
      const pane = containerRef.current?.closest('.transcript-pane')
      if (!dragRef.current || !pane) { raf = 0; return }
      const r = pane.getBoundingClientRect()
      const margin = 44
      let dy = 0
      if (pointer.y < r.top + margin) dy = -Math.max(3, Math.round((r.top + margin - pointer.y) / 2))
      else if (pointer.y > r.bottom - margin) dy = Math.max(3, Math.round((pointer.y - (r.bottom - margin)) / 2))
      if (dy !== 0) {
        pane.scrollTop += dy
        extend(pointer.x, pointer.y)
      }
      raf = requestAnimationFrame(autoScroll)
    }

    const onMove = (e) => {
      const d = dragRef.current
      if (!d) return
      if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 3) return
      d.moved = true
      pointer.x = e.clientX
      pointer.y = e.clientY
      extend(e.clientX, e.clientY)
      if (!raf) raf = requestAnimationFrame(autoScroll)
    }

    const onUp = (e) => {
      const d = dragRef.current
      dragRef.current = null
      if (raf) { cancelAnimationFrame(raf); raf = 0 }
      if (d) {
        const sel = window.getSelection()
        // arrasto que não selecionou nada (jitter do clique) conta como clique
        if (!d.moved || !sel || sel.isCollapsed) handleClick(e)
        else {
          let endLine = null
          try {
            const r = sel.getRangeAt(0)
            const caret = document.createRange()
            caret.setStart(r.endContainer, r.endOffset)
            caret.collapse(true)
            endLine = caretLine(caret)
          } catch { /* seleção inválida */ }
          if (d.startLine && endLine) {
            boundsRef.current = { start: d.startLine, end: endLine, t: Date.now() }
          }
          handleMouseUp()
        }
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      if (raf) cancelAnimationFrame(raf)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [handleMouseUp, handleClick])

  // seleção pode terminar fora do container: escuta no documento
  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp)
    let timer = null
    const onSelectionChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) { setSelection([]); return }
      if (sel.anchorNode?.parentElement?.closest?.('.codes-pane')) return
      const range = sel.getRangeAt(0)
      if (!containerRef.current?.contains(range.commonAncestorContainer)) { setSelection([]); return }
      clearTimeout(timer)
      timer = setTimeout(handleMouseUp, 140)
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('selectionchange', onSelectionChange)
    }
  }, [handleMouseUp])

  if (error) return <div className="pdf-message">{error}</div>
  if (!doc) return <div className="pdf-message">Carregando PDF…</div>

  return (
    <div
      className="pdf-pages"
      ref={containerRef}
      onMouseDown={onMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={(e) => {
        const sel = window.getSelection()
        if (sel && !sel.isCollapsed) e.preventDefault()
      }}
    >
      {Array.from({ length: doc.numPages }, (_, i) => {
        const number = i + 1
        return (
          <PdfPage
            key={number}
            doc={doc}
            number={number}
            size={size}
            scale={scale}
            excerpts={excerpts.filter((e) => Number(e.page) === number)}
            hoverCodeId={hoverCodeId}
            flashQuoteId={flashQuoteId}
            findTerm={Number(focusPage) === number ? findTerm : null}
            findIndex={findIndex}
            selectionRects={(selection.find((s) => s.page === number) || {}).rects || []}
            onHighlightClick={onHighlightClick}
            commentedIds={commentedIds}
          />
        )
      })}
    </div>
  )
}

/**
 * Caret apenas quando o ponto está sobre texto. Se estiver alguns pixels
 * abaixo/acima da linha, usa a linha mais próxima (arrasto "pega embaixo").
 */
/**
 * Texto da seleção montado pela geometria (linhas realmente pintadas),
 * em ordem visual: página → coluna → linha. Funciona com 2 ou 3 colunas.
 */
function buildSelectionText (pages, root, range = null) {
  const pageBlocks = []
  for (const p of [...pages].sort((a, b) => a.page - b.page)) {
    const el = root?.querySelector?.('.pdf-page[data-page="' + p.page + '"]')
    if (!el) continue
    const pr = el.getBoundingClientRect()
    if (!pr.width || !pr.height) continue
    const rects = p.rects || []
    if (!rects.length) continue
    const lines = new Map()
    for (const span of el.querySelectorAll('.textLayer span')) {
      const r = span.getBoundingClientRect()
      if (!r.height || !r.width) continue
      const sx = (r.left - pr.left) / pr.width
      const sw = r.width / pr.width
      const sy = (r.top - pr.top) / pr.height
      const sh = r.height / pr.height
      // a linha do span precisa estar coberta de fato pelo retângulo pintado
      const inside = rects.some((q) => {
        const vy = Math.min(sy + sh, q.y + q.h) - Math.max(sy, q.y)
        if (vy < sh * 0.4) return false
        const vx = Math.min(sx + sw, q.x + q.w) - Math.max(sx, q.x)
        // qualquer sobreposição horizontal: a linha inteira entra
        return vx > 0.001
      })
      if (!inside) continue
      const text = clippedText(span, range).trim()
      if (!text) continue
      const key = Math.round((r.top - pr.top) / 4)
      const line = lines.get(key) || { x: r.left - pr.left, y: r.top - pr.top, spans: [] }
      line.spans.push({ x: r.left - pr.left, w: r.width, text })
      lines.set(key, line)
    }
    const items = []
    for (const l of lines.values()) {
      l.spans.sort((a, b) => a.x - b.x)
      let run = []
      let prev = null
      const flush = () => {
        if (!run.length) return
        let text = ''
        let p = null
        for (const sp of run) {
          if (p !== null && sp.x - p > 2) text += ' '
          text += sp.text
          p = sp.x + sp.w
        }
        items.push({ x: run[0].x, y: l.y, text: text.replace(/\s+/g, ' ').trim() })
        run = []
      }
      for (const sp of l.spans) {
        // vão grande = outra coluna na mesma altura
        if (prev !== null && sp.x - prev > pr.width * 0.015) flush()
        run.push(sp)
        prev = sp.x + sp.w
      }
      flush()
    }

    // colunas: agrupa pelas posições horizontais das linhas
    const tolerance = Math.max(28, pr.width * 0.075)
    const columns = []
    for (const line of [...items].sort((a, b) => a.x - b.x)) {
      let col = columns.find((c) => Math.abs(c.x - line.x) <= tolerance)
      if (!col) { col = { x: line.x, lines: [] }; columns.push(col) }
      col.lines.push(line)
    }
    columns.sort((a, b) => a.x - b.x)
    const pageLines = []
    for (const col of columns) {
      col.lines.sort((a, b) => a.y - b.y)
      for (const line of col.lines) pageLines.push(line.text)
    }
    if (pageLines.length) pageBlocks.push(pageLines)
  }
  return pageBlocks.map((lines) => lines.join('\n')).join('\n').trim()
}

function clippedText (span, range) {
  const full = span.textContent || ''
  if (!range) return full
  const measure = (container, offset) => {
    try {
      const r = document.createRange()
      r.setStart(span, 0)
      r.setEnd(container, offset)
      return r.toString().length
    } catch { return 0 }
  }
  const startN = span.contains(range.startContainer) ? measure(range.startContainer, range.startOffset) : 0
  const endN = span.contains(range.endContainer) ? measure(range.endContainer, range.endOffset) : full.length
  const a = Math.max(0, Math.min(startN, full.length))
  const b = Math.max(a, Math.min(endN, full.length))
  return full.slice(a, b)
}

function pageColumns (el) {
  const pr = el.getBoundingClientRect()
  if (!pr.width) return []
  const lines = []
  for (const span of el.querySelectorAll('.textLayer span')) {
    const r = span.getBoundingClientRect()
    if (!r.height || !r.width) continue
    const cy = (r.top + r.height / 2 - pr.top) / pr.height
    if (cy < 0.09 || cy > 0.935) continue
    lines.push({ x: r.left - pr.left, right: r.right - pr.left })
  }
  const tol = Math.max(24, pr.width * 0.06)
  const cols = []
  for (const l of lines.sort((a, b) => a.x - b.x)) {
    let c = cols.find((c) => Math.abs(c.x - l.x) <= tol)
    if (!c) { c = { x: l.x, x1: l.right }; cols.push(c) }
    c.x1 = Math.max(c.x1, l.right)
  }
  return cols.map((c) => ({ x0: c.x / pr.width, x1: c.x1 / pr.width }))
}

function caretLine (caret) {
  if (!caret) return null
  const node = caret.startContainer
  const el = node.nodeType === 3 ? node.parentElement : node
  const span = el?.closest?.('.textLayer span')
  const pageEl = el?.closest?.('.pdf-page[data-page]')
  if (!span || !pageEl) return null
  const r = span.getBoundingClientRect()
  const pr = pageEl.getBoundingClientRect()
  if (!pr.height) return null
  return {
    page: Number(pageEl.dataset.page),
    y: (r.top - pr.top) / pr.height,
    h: r.height / pr.height,
    x: (r.left - pr.left) / pr.width,
    w: r.width / pr.width
  }
}

function nearestPage (x, y, root) {
  let best = null
  let bestD = Infinity
  for (const el of root.querySelectorAll('.pdf-page[data-page]')) {
    const r = el.getBoundingClientRect()
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
    if (d < bestD) { bestD = d; best = el }
  }
  return best
}

function caretInText (x, y, root) {
  const pageEl = pageFromPoint(x, y)?.closest?.('.pdf-page') || nearestPage(x, y, root)
  const caret = document.caretRangeFromPoint(x, y)

  // clique em cima de uma linha: usa o caret do browser
  if (caret) {
    const node = caret.startContainer
    const el = node.nodeType === 3 ? node.parentElement : node
    const span = el?.closest?.('.textLayer span')
    if (span) {
      const r = span.getBoundingClientRect()
      if (y >= r.top - 3 && y <= r.bottom + 3) return caret
    }
  }

  // clique na margem/rodapé: encaixa na linha de corpo mais próxima,
  // para não pular para o começo (ou fim) da página
  if (!pageEl) return caret || null
  const pr = pageEl.getBoundingClientRect()
  let best = null
  let bestD = Infinity
  for (const span of pageEl.querySelectorAll('.textLayer span')) {
    const r = span.getBoundingClientRect()
    if (!r.height) continue
    const cy = (r.top + r.height / 2 - pr.top) / pr.height
    if (cy < 0.09 || cy > 0.935) continue
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0
    if (d < bestD) { bestD = d; best = span }
  }
  if (!best) return caret || null
  const r = best.getBoundingClientRect()
  const nx = Math.min(Math.max(x, r.left + 0.5), r.right - 0.5)
  return document.caretRangeFromPoint(nx, r.top + r.height / 2)
}

function tighten (r) {
  // o retângulo do browser usa a caixa da linha inteira; encolhemos até a fonte
  const el = document.elementFromPoint(r.left + Math.min(6, r.width / 2), r.top + r.height / 2)
  const span = el?.closest?.('.textLayer span') || el
  const fs = span ? parseFloat(getComputedStyle(span).fontSize) : 0
  let top = r.top
  let height = r.height
  if (fs > 0) {
    // ancorado no baseline (base da linha), como o PDFKit do Codificando
    height = fs * 0.95
    top = r.bottom - height + fs * 0.04
  }
  return { left: r.left, top, width: r.width, height }
}

function rectOverlap (a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
  const inter = x * y
  const min = Math.min(a.w * a.h, b.w * b.h)
  return min > 0 && inter / min > 0.5
}

/**
 * Remove da seleção o que não é conteúdo: retângulos duplicados, fora da
 * página, cabeçalhos/rodapés repetidos e números de página.
 */
function cleanSelection (pages, text, root, bounds = null) {
  const seenAll = []
  const cleaned = []
  for (const p of pages) {
    const seen = new Set()
    const rects = []
    for (const r of p.rects) {
      const y2 = r.y + r.h
      if (r.y < -0.002 || y2 > 1.003) continue
      if (r.x < -0.002 || r.x + r.w > 1.003) continue
      const key = [Math.round(r.x * 300), Math.round(r.y * 300), Math.round(r.w * 300), Math.round(r.h * 300)].join(':')
      if (seen.has(key)) continue
      if (seenAll.some((q) => q.page === p.page && rectOverlap(q, r))) continue
      seen.add(key)
      seenAll.push({ page: p.page, ...r })
      rects.push(r)
    }
    if (rects.length) cleaned.push({ ...p, rects })
  }
  if (!cleaned.length) return { pages: [], text: '' }

  // corta o que está acima do início ou abaixo do fim (texto anterior/posterior)
  let bounded = cleaned
  if (bounds && bounds.start && bounds.end) {
    const sp = bounds.start.page
    const ep = bounds.end.page
    const sy = bounds.start.y + bounds.start.h
    const ey = bounds.end.y
    bounded = cleaned.map((p) => {
      if (sp === ep) {
        if (p.page !== sp) return p
        const lo = Math.min(sy, ey)
        const hi = Math.max(sy, ey)
        return { ...p, rects: p.rects.filter((r) => r.y + r.h > lo - 0.012 && r.y < hi + 0.012) }
      }
      if (p.page === sp) {
        const el = root?.querySelector?.('.pdf-page[data-page="' + p.page + '"]')
        const col = el ? pageColumns(el).find((c) => bounds.start.x >= c.x0 - 0.025 && bounds.start.x <= c.x1 + 0.025) : null
        return {
          ...p,
          rects: p.rects.filter((r) =>
            r.y + r.h > sy - 0.012 &&
            (!col || (r.x + r.w > col.x0 - 0.02 && r.x < col.x1 + 0.02))
          )
        }
      }
      if (p.page === ep) {
        const el = root?.querySelector?.('.pdf-page[data-page="' + p.page + '"]')
        const col = el ? pageColumns(el).find((c) => bounds.end.x >= c.x0 - 0.025 && bounds.end.x <= c.x1 + 0.025) : null
        return {
          ...p,
          rects: p.rects.filter((r) =>
            r.y < ey + 0.012 &&
            (!col || (r.x + r.w > col.x0 - 0.02 && r.x < col.x1 + 0.02))
          )
        }
      }
      return p
    }).filter((p) => p.rects.length)
    if (!bounded.length) return { pages: [], text: '' }
  }

  // linhas nas margens (cabeçalho/rodapé), números e notas de rodapé (fonte menor)
  const marginLines = []
  for (const p of bounded) {
    const el = root?.querySelector?.('.pdf-page[data-page="' + p.page + '"]')
    if (!el) continue
    const pr = el.getBoundingClientRect()
    if (!pr.height) continue
    const spans = [...el.querySelectorAll('.textLayer span')]
    const sizes = []
    for (const span of spans) {
      const r = span.getBoundingClientRect()
      if (!r.height) continue
      const cy = (r.top + r.height / 2 - pr.top) / pr.height
      const fs = parseFloat(getComputedStyle(span).fontSize) || 0
      if (cy > 0.10 && cy < 0.72 && (span.textContent || '').trim().length > 8 && fs > 0) sizes.push(fs)
    }
    sizes.sort((a, b) => a - b)
    const bodySize = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0

    const byLine = new Map()
    for (const span of spans) {
      const r = span.getBoundingClientRect()
      if (!r.height) continue
      const cy = (r.top + r.height / 2 - pr.top) / pr.height
      const fs = parseFloat(getComputedStyle(span).fontSize) || 0
      const text = (span.textContent || '').trim()
      const inMargin = cy <= 0.09 || cy >= 0.935
      const caption = /^(figura|fig\.|tabela|tabela|quadro|gráfico|grafico|fonte|source|table|figure)\b/i.test(text)
      const footnote = !caption && cy > 0.78 && bodySize > 0 && fs > 0 && fs < bodySize * 0.72
      const starred = !caption && cy > 0.6 && text.startsWith('*')
      if (!inMargin && !footnote && !starred) continue
      const key = Math.round((r.top - pr.top) / 3)
      const cur = byLine.get(key) || { y: cy, text: '' }
      cur.text += span.textContent
      byLine.set(key, cur)
    }
    for (const line of byLine.values()) {
      const t = line.text.replace(/\s+/g, ' ').trim()
      if (t) marginLines.push({ page: p.page, y: line.y, text: t })
    }
  }

  // qualquer linha na margem é cabeçalho/rodapé/número de página
  const furnitureText = new Set(marginLines.map((l) => l.text))

  const outPages = bounded.map((p) => {
    const rects = p.rects.filter((r) => {
      const cy = r.y + r.h / 2
      if (cy < 0.09 || cy > 0.935) return false
      if (marginLines.some((f) => f.page === p.page && Math.abs(f.y - cy) < 0.014)) return false
      return true
    })
    return { ...p, rects }
  }).filter((p) => p.rects.length)

  const norm = (v) => v.replace(/\s+/g, ' ').trim()
  const head = (v) => norm(v).toLowerCase().slice(0, 28)
  const furnitureHeads = new Set(marginLines.map((l) => head(l.text)))
  const lines = text.split('\n').filter((line) => {
    const t = norm(line)
    if (!t) return true
    if (/^\d{1,4}$/.test(t)) return false
    if (furnitureText.has(t)) return false
    // o número de página pode vir colado ao cabeçalho; compara o começo da linha
    return !furnitureHeads.has(head(t))
  })

  return { pages: outPages, text: lines.join('\n').trim() }
}

function rectsByPage (range) {
  const byPage = new Map()
  for (const raw of range.getClientRects()) {
    if (raw.width < 2 || raw.height < 1) continue
    const r = tighten(raw)
    const el = pageFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (!el) continue
    const pr = el.getBoundingClientRect()
    const ny = (r.top - pr.top) / pr.height
    const nh = r.height / pr.height
    // retângulos de bloco/página inteira não são linhas de texto
    if (nh > 0.06 || nh <= 0) continue
    const entry = byPage.get(el.dataset.page) || { page: Number(el.dataset.page), rects: [], text: '' }
    entry.rects.push({
      x: (r.left - pr.left) / pr.width,
      y: ny,
      w: r.width / pr.width,
      h: nh
    })
    byPage.set(el.dataset.page, entry)
  }
  return [...byPage.values()]
}

/**
 * A camada de texto do pdf.js é feita de spans sem separadores; `toString()`
 * gruda tudo ("DOUTORADOLucas"). Aqui reconstruímos com quebra de linha e
 * espaço conforme a geometria dos spans.
 */
function selectionText (range) {
  const root = range.commonAncestorContainer.nodeType === 1
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement
  if (!root) return range.toString().trim()

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let out = ''
  let prev = null
  let node
  while ((node = walker.nextNode())) {
    if (!range.intersectsNode(node)) continue
    const start = node === range.startContainer ? range.startOffset : 0
    const end = node === range.endContainer ? range.endOffset : node.nodeValue.length
    if (end <= start) continue
    const chunk = node.nodeValue.slice(start, end)

    const rect = node.parentElement ? node.parentElement.getBoundingClientRect() : null
    if (rect && prev) {
      const sameLine = Math.abs(rect.top - prev.top) < 4
      if (!sameLine) out += '\n'
      else if (rect.left - (prev.left + prev.width) > 2) out += ' '
    }
    out += chunk
    if (rect) prev = rect
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

function pageFromPoint (x, y) {
  const els = document.elementsFromPoint(x, y)
  for (const el of els) {
    const page = el.closest?.('[data-page]')
    if (page) return page
  }
  return null
}

function PdfPage ({ doc, number, size, scale, excerpts, selectionRects, onHighlightClick, hoverCodeId, flashQuoteId, findTerm, findIndex, commentedIds }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const textRef = useRef(null)
  const taskRef = useRef(null)
  const [visible, setVisible] = useState(number <= 2)
  const [rendered, setRendered] = useState(false)
  const [findOccurrences, setFindOccurrences] = useState([])

  useEffect(() => {
    if (!findOccurrences.length) return
    const el = wrapRef.current?.querySelector('.pdf-find--active')
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [findOccurrences, findIndex])

  // troca de termo com a página já renderizada
  useEffect(() => {
    if (!findTerm) { setFindOccurrences([]); return }
    if (!rendered) return
    const c = textRef.current
    if (c) setFindOccurrences(findOccurrencesInPage(c, findTerm))
  }, [findTerm, rendered])

  const width = Math.floor(size.width * scale)
  const height = Math.floor(size.height * scale)

  const commentMarkers = useMemo(() => {
    const seen = new Set()
    const out = []
    for (const ex of excerpts) {
      const qid = ex.quoteId || ex.id
      if (!commentedIds?.has(qid) || seen.has(qid)) continue
      seen.add(qid)
      const rects = [...(ex.rects || [])].sort((a, b) => a.y - b.y)
      const r = rects[0]
      if (r) out.push({ qid, r, ex, color: ex.color || '#4A90E2' })
    }
    return out
  }, [excerpts, commentedIds])

  useEffect(() => {
    const el = wrapRef.current
    if (!el || !('IntersectionObserver' in window)) { setVisible(true); return }
    const io = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '900px 0px', threshold: 0 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) {
      const c = canvasRef.current
      if (c) { c.width = 0; c.height = 0 }
      if (textRef.current) textRef.current.innerHTML = ''
      setRendered(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const page = await doc.getPage(number)
      if (cancelled) return
      const viewport = page.getViewport({ scale })
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const renderViewport = page.getViewport({ scale: scale * dpr })
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d', { alpha: false })
      canvas.width = Math.floor(renderViewport.width)
      canvas.height = Math.floor(renderViewport.height)
      canvas.style.width = `${Math.floor(viewport.width)}px`
      canvas.style.height = `${Math.floor(viewport.height)}px`
      const task = page.render({ canvasContext: ctx, viewport: renderViewport })
      taskRef.current = task
      try {
        await task.promise
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException') throw err
        return
      }
      if (cancelled) return

      const container = textRef.current
      container.innerHTML = ''
      container.style.width = `${Math.floor(viewport.width)}px`
      container.style.height = `${Math.floor(viewport.height)}px`
      // O pdf.js dimensiona os spans com `calc(var(--scale-factor) * X)`;
      // sem a variável o texto fica com o tamanho errado e a seleção desalinha.
      container.style.setProperty('--scale-factor', String(viewport.scale))
      const textContent = await page.getTextContent()
      if (cancelled) return
      await buildTextLayer(textContent.items, viewport, container)
      // pdf.js grava width/height com `round(var(--scale-factor) * ...)`, que o
      // WebKit do app não resolve (a camada fica 0x0 e não recebe o mouse).
      container.style.width = `${Math.floor(viewport.width)}px`
      container.style.height = `${Math.floor(viewport.height)}px`
      if (findTerm) {
        const occ = findOccurrencesInPage(container, findTerm)
        if (!cancelled) setFindOccurrences(occ)
      } else {
        setFindOccurrences([])
      }
      if (!cancelled) setRendered(true)
    })().catch((e) => {
      if (e?.name !== 'RenderingCancelledException') console.error('PDF página', number, e)
    })
    return () => {
      cancelled = true
      try { taskRef.current?.cancel() } catch { /* noop */ }
    }
  }, [visible, scale, number, doc])

  return (
    <div
      className="pdf-page"
      data-page={number}
      ref={wrapRef}
      style={{ width, height }}
    >
      <canvas ref={canvasRef} />
      <div className="textLayer" ref={textRef} />
      {findOccurrences.map((rects, oi) => rects.map((r, ri) => (
        <span
          key={'find' + oi + '-' + ri}
          className={'pdf-find' + (oi === findIndex ? ' pdf-find--active' : '')}
          style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` }}
        />
      )))}
      {selectionRects.map((r, i) => (
        <span
          key={'sel' + i}
          className="pdf-selection"
          style={{
            left: `${r.x * 100}%`,
            top: `${r.y * 100}%`,
            width: `${r.w * 100}%`,
            height: `${r.h * 100}%`
          }}
        />
      ))}
      {rendered && excerpts.map((ex) => (
        (ex.rects || []).map((r, i) => (
          <span
            key={ex.id + '-' + i}
            className={'pdf-highlight' + (((ex.quoteId || ex.id) === flashQuoteId) ? ' pdf-highlight--flash' : '')}
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.w * 100}%`,
              height: `${r.h * 100}%`,
              background: tintAlpha(ex.color || '#4A90E2', ex.codeId === hoverCodeId ? 0.55 : 0.38),
              boxShadow: ex.codeId === hoverCodeId ? `0 0 0 2px ${(ex.color || '#4A90E2')}` : 'none'
            }}
            onClick={(e) => { e.stopPropagation(); onHighlightClick(ex, e) }}
          />
        ))
      ))}
      {rendered && commentMarkers.map((m) => (
        <button
          key={'comment-' + m.qid}
          type="button"
          className="pdf-comment-marker"
          style={{
            left: `min(calc(${(m.r.x + m.r.w) * 100}% + 3px), calc(100% - 16px))`,
            top: `${(m.r.y + m.r.h / 2) * 100}%`,
            background: m.color
          }}
          title="Ver comentário"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onHighlightClick(m.ex, e) }}
        >
          <svg viewBox="0 0 24 24" width="9" height="9" fill="#fff" aria-hidden="true">
            <path d="M4 3h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V4a1 1 0 0 1 1-1z" />
          </svg>
        </button>
      ))}
      <span className="pdf-page-number">{number}</span>
    </div>
  )
}

/**
 * Camada de texto: usa renderTextLayer do pdf.js quando disponível e cai
 * para uma implementação própria (posicionamento por transform) caso não.
 */
async function buildTextLayer (items, viewport, container) {
  const lib = window.pdfjsLib
  if (typeof lib?.renderTextLayer === 'function') {
    try {
      const task = lib.renderTextLayer({
        textContentSource: { items },
        textContent: { items },
        container,
        viewport,
        textDivs: []
      })
      if (task?.promise) await task.promise
    } catch (err) {
      console.warn('renderTextLayer indisponível, usando camada própria', err)
    }
  }
  if (!container.children.length) manualTextLayer(items, viewport, container)
}

function manualTextLayer (items, viewport, container) {
  const lib = window.pdfjsLib
  const frag = document.createDocumentFragment()
  const spans = []
  for (const item of items) {
    if (!item.str) continue
    const tx = lib.Util.transform(viewport.transform, item.transform)
    const fontHeight = Math.hypot(tx[2], tx[3]) || 10
    const span = document.createElement('span')
    span.textContent = item.str
    span.style.position = 'absolute'
    span.style.left = `${tx[4]}px`
    span.style.top = `${tx[5] - fontHeight}px`
    span.style.fontSize = `${fontHeight}px`
    span.style.transformOrigin = '0 0'
    frag.appendChild(span)
    spans.push({ span, target: item.width * viewport.scale })
  }
  container.appendChild(frag)
  for (const { span, target } of spans) {
    const w = span.getBoundingClientRect().width
    if (w > 0 && target > 0) span.style.transform = `scaleX(${target / w})`
  }
}

/**
 * Todas as ocorrências do termo na camada de texto, em ordem.
 * Cada ocorrência é uma lista de retângulos normalizados (quebra de linha etc.).
 */
function findOccurrencesInPage (container, term) {
  const re = makeSearchRegex(term)
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  const pr = container.getBoundingClientRect()
  const out = []
  let node
  while ((node = walker.nextNode())) {
    const value = node.nodeValue || ''
    re.lastIndex = 0
    let m
    while ((m = re.exec(value))) {
      const start = m.index
      const len = m[0].length
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, Math.min(start + len, value.length))
      const rects = [...range.getClientRects()].map((r) => ({
        x: (r.left - pr.left) / pr.width,
        y: (r.top - pr.top) / pr.height,
        w: r.width / pr.width,
        h: r.height / pr.height
      }))
      if (rects.length) out.push(rects)
      if (len === 0) re.lastIndex++
    }
  }
  return out
}
