import React, { useMemo, useState } from 'react'
import { useData, navigate } from '../App.jsx'
import { formatDate } from '../lib/transcript.js'
import { importOneFile } from '../lib/importOne.js'
import ContextMenu from '../components/ContextMenu.jsx'
import Icon from '../components/Icon.jsx'

export default function Transcripts () {
  const { data, updateTranscript, createTranscript, deleteTranscript } = useData()
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [ctx, setCtx] = useState(null)
  const [dragover, setDragover] = useState(false)
  const [importing, setImporting] = useState(false)
  const [ocrActive, setOcrActive] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [type, setType] = useState('all')
  const [group, setGroup] = useState('all')
  const items = useMemo(() => {
    const all = data.transcripts.filter((t) => {
      if (type !== 'all' && (type === 'pdf' ? t.rendererType !== 'pdf' : t.rendererType === 'pdf')) return false
      if (group !== 'all' && (t.group || '') !== group) return false
      return true
    })
    const q = query.trim().toLowerCase()
    return q ? all.filter((t) => t.name.toLowerCase().includes(q)) : all
  }, [data.transcripts, type, query, group])

  const groups = [...new Set(data.transcripts.map((t) => t.group).filter(Boolean))]

  return (
    <>
      <div className="topbar">
        <h1>Documentos</h1>
        <div className="topbar-actions">
          <button
            className="btn btn--blue"
            onClick={() => navigate('/documents/new')}
          >
            + Adicionar documento
          </button>
        </div>
      </div>

      <div
        className={'page' + (dragover ? ' page-drop' : '')}
        onDragOver={(e) => { e.preventDefault(); if (!dragover) setDragover(true) }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragover(false) }}
        onDrop={async (e) => {
          e.preventDefault()
          setDragover(false)
          const files = [...e.dataTransfer.files]
          if (!files.length) return
          setImporting(true)
          let ok = 0
          let bad = 0
          for (const f of files) {
            try {
              const res = await importOneFile(f, createTranscript, '', {
                onStatus: (st) => setOcrActive(st === 'ocr')
              })
              if (res.ok) ok++; else bad++
            } catch { bad++ }
            setOcrActive(false)
          }
          setImporting(false)
          setFeedback(`${ok} importado${ok === 1 ? '' : 's'}${bad ? ` · ${bad} com problema` : ''}`)
          setTimeout(() => setFeedback(null), 4000)
        }}
      >
        {dragover && (
          <div className="drop-overlay">
            <div>Solte os arquivos para adicionar</div>
            <span>PDF, DOC, DOCX, TXT ou RTF</span>
          </div>
        )}
        {importing && <div className="import-banner">Importando…</div>}
        {ocrActive && <div className="import-banner">PDF escaneado: aplicando OCR…</div>}
        {feedback && <div className="import-banner">{feedback}</div>}

        {items.length === 0
          ? (
            <div className="empty">
              <h2>
                <>Traga o documento original e codifique<br />direto na página, como no Atlas.ti</>
              </h2>
              <p>
                PDF, DOC, DOCX, TXT ou RTF. O PDF mantém o layout, as tabelas e as imagens.
              </p>
              <div className="empty-actions">
                <button
                  className="btn btn--blue"
                  onClick={() => navigate('/documents/new')}
                >
                  Adicionar documento
                </button>
              </div>
            </div>
          )
          : (
            <div className="list-wrap">
              <div className="list-head">
                <span className="count count--lead">
                  {items.length} {items.length === 1 ? 'documento' : 'documentos'}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {groups.length > 0 && (
                    <select aria-label="Filtrar por grupo" className="input" style={{ width: 130, padding: '6px 10px' }} value={group} onChange={(e) => setGroup(e.target.value)}>
                      <option value="all">Todos os grupos</option>
                      {groups.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  )}
                  <select aria-label="Filtrar por tipo" className="input" style={{ width: 110, padding: '6px 10px' }} value={type} onChange={(e) => setType(e.target.value)}>
                    <option value="all">Todos</option>
                    <option value="pdf">PDF</option>
                    <option value="text">Texto</option>
                  </select>
                  <input
                    className="input"
                    style={{ width: 200, padding: '6px 10px' }}
                    placeholder="Filtrar documentos…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </div>
              </div>
              <table className="t-table">
                <thead>
                  <tr>
                    <th>Documento</th>
                    <th style={{ width: 120 }}>Trechos</th>
                    <th style={{ width: 160 }}>Adicionado em</th>
                    <th style={{ width: 44 }}><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => {
                    const count = data.excerpts.filter((e) => e.transcriptId === t.id).length
                    return (
                      <tr
                        key={t.id}
                        onClick={() => navigate('/documents/' + t.id)}
                        onContextMenu={(e) => {
                          e.preventDefault()
                          setCtx({ x: e.clientX, y: e.clientY, doc: t })
                        }}
                      >
                        <td className="name" onClick={(e) => { if (editingId === t.id) e.stopPropagation() }}>
                          {editingId === t.id
                            ? (
                              <input
                                className="input inline-rename"
                                autoFocus
                                value={editingName}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setEditingName(e.target.value)}
                                onBlur={(e) => {
                                  const v = e.target.value.trim()
                                  if (v) updateTranscript(t.id, { name: v })
                                  setEditingId(null)
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const v = e.currentTarget.value.trim()
                                    if (v) updateTranscript(t.id, { name: v })
                                    setEditingId(null)
                                  }
                                  if (e.key === 'Escape') setEditingId(null)
                                }}
                              />
                            )
                            : (
                              <>
                                {t.name}
                                <button
                                  className="inline-edit-btn"
                                  title="Renomear documento"
                                  onClick={(e) => { e.stopPropagation(); setEditingId(t.id); setEditingName(t.name) }}
                                >
                                  ✎
                                </button>
                              </>
                            )}
                          {t.group && <span className="badge-doc">{t.group}</span>}
                          {t.rendererType === 'pdf' && (
                            <span className="badge-pdf">PDF · {t.pageCount || '?'} p.</span>
                          )}
                          {t.rendererType !== 'pdf' && /\.[a-z0-9]{2,4}$/i.test(t.name) && (
                            <span className="badge-doc">{(t.name.match(/\.([a-z0-9]{2,4})$/i) || [])[1].toUpperCase()}</span>
                          )}
                        </td>
                        <td>{count}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{formatDate(t.createdAt)}</td>
                        <td className="row-more" onClick={(e) => e.stopPropagation()}>
                          <button
                            className="icon-btn"
                            title="Ações do documento"
                            onClick={(e) => setCtx({ x: e.clientX, y: e.clientY, doc: t })}
                          >
                            <Icon name="more" size={16} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

        {ctx && (
          <ContextMenu
            x={ctx.x}
            y={ctx.y}
            onClose={() => setCtx(null)}
            items={[
              { label: 'Abrir', onClick: () => navigate('/documents/' + ctx.doc.id) },
              { label: 'Renomear…', onClick: () => { setEditingId(ctx.doc.id); setEditingName(ctx.doc.name) } },
              { label: 'Copiar nome', onClick: () => navigator.clipboard?.writeText(ctx.doc.name) },
              { sep: true },
              { label: 'Excluir documento', danger: true, onClick: () => setConfirmDel(ctx.doc) }
            ]}
          />
        )}

        {confirmDel && (
          <div className="import-modal" onClick={() => setConfirmDel(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3>Excluir documento</h3>
              <p className="modal-sub">
                “{confirmDel.name}” e os {data.excerpts.filter((e) => e.transcriptId === confirmDel.id).length} trechos codificados nele serão removidos. Essa ação não pode ser desfeita.
              </p>
              <div className="modal-actions">
                <button className="btn" onClick={() => setConfirmDel(null)}>Cancelar</button>
                <button
                  className="btn"
                  style={{ background: 'var(--error-text)', borderColor: 'var(--error-text)', color: '#fff' }}
                  onClick={() => { deleteTranscript(confirmDel.id); setConfirmDel(null) }}
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
