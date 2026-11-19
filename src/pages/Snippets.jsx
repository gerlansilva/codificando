import React, { useMemo, useState } from 'react'
import { useData, navigate } from '../App.jsx'
import { quoteToText, copyText } from '../lib/clipboard.js'
import ContextMenu from '../components/ContextMenu.jsx'
import Toast from '../components/Toast.jsx'
import { uid } from '../data/store.js'

/**
 * Citações em tabela compacta (como no Codificando): documento, página,
 * códigos e texto. Ações ficam no botão direito — nada de cartões gigantes.
 */
export default function Snippets () {
  const { data, update, undo, removeExcerpts, saveMemo } = useData()
  const [activeCode, setActiveCode] = useState('all')
  const [activeDoc, setActiveDoc] = useState('all')
  const [query, setQuery] = useState('')
  const [ctx, setCtx] = useState(null)
  const [editingComment, setEditingComment] = useState(null)
  const [commentDraft, setCommentDraft] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [batch, setBatch] = useState(null) // 'code' | 'move' | 'comment'
  const [batchQuery, setBatchQuery] = useState('')
  const [batchComment, setBatchComment] = useState('')
  const [toast, setToast] = useState(null)

  const quotes = useMemo(() => {
    const map = new Map()
    for (const e of data.excerpts) {
      const qid = e.quoteId || e.id
      if (!map.has(qid)) {
        map.set(qid, {
          id: qid,
          text: e.text,
          page: e.page,
          transcriptId: e.transcriptId,
          excerpts: [],
          codes: []
        })
      }
      const q = map.get(qid)
      q.excerpts.push(e)
      const c = data.codes.find((x) => x.id === e.codeId)
      if (c && !q.codes.some((x) => x.id === c.id)) q.codes.push(c)
    }
    return [...map.values()].sort((a, b) =>
      (a.transcriptId.localeCompare(b.transcriptId)) || ((a.page || 0) - (b.page || 0))
    )
  }, [data.excerpts, data.codes])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return quotes.filter((item) => {
      if (activeDoc !== 'all' && item.transcriptId !== activeDoc) return false
      if (activeCode !== 'all' && !item.codes.some((c) => c.id === activeCode)) return false
      if (q && !item.text.toLowerCase().includes(q)) return false
      return true
    })

  }, [quotes, activeCode, activeDoc, query])

  const visible = filtered.slice(0, 500)
  const selection = quotes.filter((q) => selected.has(q.id))
  const allFilteredSelected = filtered.length > 0 && filtered.every((q) => selected.has(q.id))

  const toggleSel = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) filtered.forEach((q) => next.delete(q.id))
      else filtered.forEach((q) => next.add(q.id))
      return next
    })
  }

  const closeBatch = () => { setBatch(null); setBatchQuery(''); setBatchComment('') }

  const batchCode = (codeId) => {
    const ids = new Set(selection.map((q) => q.id))
    update((d) => {
      const novos = []
      const now = new Date().toISOString()
      for (const qid of ids) {
        const group = d.excerpts.filter((e) => (e.quoteId || e.id) === qid)
        if (!group.length) continue
        if (group.some((e) => e.codeId === codeId)) continue
        const first = group[0]
        if (first.page) {
          for (const e of group) {
            novos.push({ ...e, id: uid(), codeId, createdAt: now })
          }
        } else {
          novos.push({ ...first, id: uid(), codeId, createdAt: now })
        }
      }
      if (!novos.length) return d
      return { ...d, excerpts: [...d.excerpts, ...novos] }
    })
    setSelected(new Set())
    closeBatch()
  }

  const batchMove = (codeId) => {
    const ids = new Set(selection.flatMap((q) => q.excerpts.map((e) => e.id)))
    if (!ids.size) return
    update((d) => ({
      ...d,
      excerpts: d.excerpts.map((e) => (ids.has(e.id) ? { ...e, codeId } : e))
    }))
    setSelected(new Set())
    closeBatch()
  }

  const batchCommentApply = () => {
    const text = batchComment.trim()
    if (!text) return
    const ids = new Set(selection.map((q) => q.id))
    update((d) => {
      const memos = (d.memos || []).filter((m) => !(m.kind === 'comment' && ids.has(m.quoteId)))
      const now = new Date().toISOString()
      for (const qid of ids) memos.push({ id: uid(), quoteId: qid, kind: 'comment', text, updatedAt: now })
      return { ...d, memos }
    })
    setSelected(new Set())
    closeBatch()
  }

  const batchRemove = () => {
    const ids = selection.flatMap((q) => q.excerpts.map((e) => e.id))
    if (!ids.length) return
    removeExcerpts(ids)
    setSelected(new Set())
    setToast(selection.length === 1 ? 'Citação removida' : `${selection.length} citações removidas`)
  }


  const usedCodes = data.codes.filter((c) => data.excerpts.some((e) => e.codeId === c.id))

  const openQuote = (q) => navigate(
    '/documents/' + q.transcriptId + (q.page ? '?page=' + q.page : '?excerpt=' + q.excerpts[0].id)
  )

  return (
    <>
      <div className="topbar">
        <h1>Trechos</h1>
        <div className="topbar-actions">
          <select
            className="input"
            style={{ width: 190, padding: '6px 10px' }}
            value={activeDoc}
            onChange={(e) => setActiveDoc(e.target.value)}
          >
            <option value="all">Todos os documentos</option>
            {data.transcripts.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <input
            className="input"
            style={{ width: 200, padding: '6px 10px' }}
            placeholder="Filtrar pelo texto…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {usedCodes.length > 0 && (
            <select className="input" style={{ width: 170, marginLeft: 8 }} value={activeCode} onChange={(e) => setActiveCode(e.target.value)}>
              <option value="all">Todos os códigos</option>
              {usedCodes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="page">
        {quotes.length === 0
          ? (
            <div className="empty">
              <h2>Descubra temas e padrões</h2>
              <p>Primeiro, codifique um documento.</p>
              <div className="empty-actions">
                <button className="btn btn--blue" onClick={() => navigate('/documents')}>Começar a codificar</button>
              </div>
            </div>
          )
          : (
            <div className="pane-page" style={{ maxWidth: 1180 }}>
              <p className="sub" style={{ marginBottom: 10 }} title="Clique para abrir no documento; botão direito para ações.">
                {filtered.length} citaç{filtered.length === 1 ? 'ão' : 'ões'}
                {filtered.length > 500 ? ' · mostrando as 500 primeiras' : ''}
              </p>

              {selected.size > 0 && (
                <div className="batch-bar">
                  <span className="batch-count">
                    {selected.size} selecionado{selected.size === 1 ? '' : 's'}
                    {selected.size > visible.length ? ` de ${filtered.length} filtrados` : ''}
                  </span>
                  <button className="batch-btn" onClick={() => setBatch('code')}>Codificar com…</button>
                  <button className="batch-btn" onClick={() => setBatch('move')}>Mover para…</button>
                  <button className="batch-btn" onClick={() => setBatch('comment')}>Comentar…</button>
                  <button className="batch-btn batch-danger" onClick={batchRemove}>Excluir</button>
                  <button className="batch-btn batch-clear" onClick={() => setSelected(new Set())}>Limpar</button>
                </div>
              )}

              <table className="quote-table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={toggleAllFiltered}
                        title={`Selecionar todos os ${filtered.length} filtrados`}
                      />
                    </th>
                    <th style={{ width: 190 }}>Documento</th>
                    <th style={{ width: 46, textAlign: 'right' }}>Pág.</th>
                    <th style={{ width: 190 }}>Códigos</th>
                    <th>Trecho</th>
                    <th style={{ width: 220 }}>Comentário</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 500).map((q) => {
                    const t = data.transcripts.find((x) => x.id === q.transcriptId)
                    return (
                      <tr
                        key={q.id}
                        onClick={() => openQuote(q)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setCtx({ x: e.clientX, y: e.clientY, quote: q })
                        }}
                      >
                        <td className="sel-cell" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(q.id)}
                            onChange={() => toggleSel(q.id)}
                            aria-label={'Selecionar citação de ' + (t?.name || 'documento')}
                          />
                        </td>
                        <td className="doc" title={t?.name}>{t?.name || '—'}</td>
                        <td className="page">{q.page || '—'}</td>
                        <td>
                          <span className="chips-inline">
                            {q.codes.map((c) => (
                              <span className="chip-mini" key={c.id}>
                                <span className="code-dot" style={{ background: c.color }} />
                                {c.name}
                              </span>
                            ))}
                          </span>
                        </td>
                        <td className="text" title={q.text}>“{q.text}”</td>
                        <td
                          className="comment-cell"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingComment(q.id)
                            setCommentDraft(commentOf(data, q.id))
                          }}
                        >
                          {editingComment === q.id
                            ? (
                              <input
                                className="input comment-input"
                                autoFocus
                                value={commentDraft}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setCommentDraft(e.target.value)}
                                onBlur={() => { saveMemo(q.id, commentDraft, 'comment'); setEditingComment(null) }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    saveMemo(q.id, e.currentTarget.value, 'comment')
                                    setEditingComment(null)
                                  }
                                  if (e.key === 'Escape') setEditingComment(null)
                                }}
                              />
                            )
                            : (() => {
                              const c = commentOf(data, q.id)
                              if (!c) return <span className="muted">—</span>
                              return (
                                <span className="comment-text" title={c}>
                                  <span className="comment-text-body">{c}</span>
                                  <button
                                    type="button"
                                    className="comment-clear"
                                    title="Remover comentário"
                                    onClick={(e) => { e.stopPropagation(); saveMemo(q.id, '', 'comment') }}
                                  >×</button>
                                </span>
                              )
                            })()}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

        {batch && (
          <div className="import-modal" onClick={closeBatch}>
            <div className="modal-card" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
              {batch === 'comment'
                ? (
                  <>
                    <h3>Comentar {selected.size} citaç{selected.size === 1 ? 'ão' : 'ões'}</h3>
                    <p className="modal-sub">O comentário substitui o atual dos trechos selecionados.</p>
                    <textarea
                      className="input"
                      autoFocus
                      rows={4}
                      placeholder="Comentário…"
                      value={batchComment}
                      onChange={(e) => setBatchComment(e.target.value)}
                    />
                    <div className="modal-actions">
                      <button className="btn" onClick={closeBatch}>Cancelar</button>
                      <button className="btn btn--blue" disabled={!batchComment.trim()} onClick={batchCommentApply}>Aplicar</button>
                    </div>
                  </>
                )
                : (
                  <>
                    <h3>{batch === 'code' ? 'Codificar com' : 'Mover para'}</h3>
                    <p className="modal-sub">
                      {batch === 'code'
                        ? 'Adiciona o código aos trechos selecionados (sem remover os atuais).'
                        : 'Troca o código dos trechos selecionados.'}
                    </p>
                    <input
                      className="input"
                      autoFocus
                      placeholder="Buscar código…"
                      value={batchQuery}
                      onChange={(e) => setBatchQuery(e.target.value)}
                      style={{ marginBottom: 8 }}
                    />
                    <div className="code-pick">
                      {data.codes
                        .filter((c) => c.name.toLowerCase().includes(batchQuery.trim().toLowerCase()))
                        .map((c) => (
                          <button
                            key={c.id}
                            className="code-pick-item"
                            onClick={() => (batch === 'code' ? batchCode(c.id) : batchMove(c.id))}
                          >
                            <span className="code-dot" style={{ background: c.color }} />
                            {c.name}
                          </button>
                        ))}
                      {data.codes.length === 0 && <p className="sub">Nenhum código ainda.</p>}
                    </div>
                    <div className="modal-actions">
                      <button className="btn" onClick={closeBatch}>Cancelar</button>
                    </div>
                  </>
                )}
            </div>
          </div>
        )}

        {ctx && (
          <ContextMenu
            x={ctx.x}
            y={ctx.y}
            onClose={() => setCtx(null)}
            items={[
              { label: 'Abrir no documento', onClick: () => openQuote(ctx.quote) },
              { label: 'Copiar trecho', onClick: () => copyText(quoteToText(ctx.quote.text, ctx.quote.page)) },
              ...ctx.quote.codes.slice(0, 4).map((c) => ({
                label: 'Ir para o código: ' + c.name,
                onClick: () => navigate('/codes')
              })),
              { sep: true },
              ...ctx.quote.codes.slice(0, 4).map((c) => ({
                label: 'Remover código: ' + c.name,
                danger: true,
                onClick: () => removeExcerpts(
                  ctx.quote.excerpts.filter((e) => e.codeId === c.id).map((e) => e.id)
                )
              })),
              ...(commentOf(data, ctx.quote.id)
                ? [{ label: 'Remover comentário', danger: true, onClick: () => saveMemo(ctx.quote.id, '', 'comment') }]
                : []),
              { sep: true },
              {
                label: 'Remover citação',
                danger: true,
                onClick: () => removeExcerpts(ctx.quote.excerpts.map((e) => e.id))
              }
            ]}
          />
        )}
      </div>
      {toast && (
        <Toast
          text={toast + ' · ⌘Z para desfazer'}
          onUndo={undo}
          onClose={() => setToast(null)}
        />
      )}
    </>
  )
}

function commentOf (data, quoteId) {
  return (data.memos || []).find((m) => m.quoteId === quoteId && m.kind === 'comment')?.text || ''
}
