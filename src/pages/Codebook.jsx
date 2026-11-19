import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useData, navigate } from '../App.jsx'
import CodeModal from '../components/CodeModal.jsx'
import RelationModal, { CODE_RELATIONS, relationLabelFor } from '../components/RelationModal.jsx'
import { flattenTree, codeStats, CODE_COLORS } from '../lib/codes.js'

export default function Codebook () {
  const { data, mergeCodes, deleteCode, moveExcerpt, removeExcerpt, moveExcerpts, removeExcerpts, createCode, updateCode, moveCode, addCodeLink, removeCodeLink } = useData()
  const [selectedId, setSelectedId] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [dropHint, setDropHint] = useState(null)
  const pressRef = useRef(null)
  const dropRef = useRef(null)
  const [renaming, setRenaming] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [manageCode, setManageCode] = useState(null)
  const [picked, setPicked] = useState(() => new Set())
  const [linkOpen, setLinkOpen] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitName, setSplitName] = useState('')
  const [collapsed, setCollapsed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('investigando.collapsedCodes') || '[]')) } catch { return new Set() }
  })

  const hasChildren = (id) => data.codes.some((c) => c.parentId === id)
  const isHidden = (code) => {
    let p = code.parentId
    while (p) {
      if (collapsed.has(p)) return true
      p = data.codes.find((c) => c.id === p)?.parentId
    }
    return false
  }
  const togglePick = (id) => {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const toggle = (id) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      try { localStorage.setItem('investigando.collapsedCodes', JSON.stringify([...next])) } catch { /* noop */ }
      return next
    })
  }

  const rows = useMemo(
    () => flattenTree(data.codes).filter(({ code }) => !isHidden(code)),
    [data.codes, collapsed]
  )
  const stats = useMemo(() => codeStats(data.codes, data.excerpts), [data.codes, data.excerpts])
  const selected = data.codes.find((c) => c.id === selectedId) || null
  const relatedLinks = selected
    ? (data.codeLinks || [])
        .filter((l) => l.from === selected.id || l.to === selected.id)
        .map((l) => {
          const outgoing = l.from === selected.id
          const other = data.codes.find((c) => c.id === (outgoing ? l.to : l.from))
          return other ? { link: l, other, outgoing } : null
        })
        .filter(Boolean)
    : []

  const parent = selected?.parentId ? data.codes.find((c) => c.id === selected.parentId) : null
  const children = selected ? data.codes.filter((c) => c.parentId === selected.id) : []

  const selectedExcerpts = selected ? data.excerpts.filter((e) => e.codeId === selected.id) : []

  // co-ocorrência: códigos aplicados às mesmas citações
  const cooccurrence = useMemo(() => {
    if (!selected) return []
    const qids = new Set(selectedExcerpts.map((e) => e.quoteId || e.id))
    const counts = new Map()
    for (const e of data.excerpts) {
      const qid = e.quoteId || e.id
      if (!qids.has(qid) || e.codeId === selected.id) continue
      counts.set(e.codeId, (counts.get(e.codeId) || 0) + 1)
    }
    return [...counts.entries()]
      .map(([id, n]) => ({ code: data.codes.find((c) => c.id === id), n }))
      .filter((x) => x.code)
      .sort((a, b) => b.n - a.n)
  }, [selected, selectedExcerpts, data.excerpts, data.codes])

  const startDrag = (e, code) => {
    if (e.button !== 0) return
    e.preventDefault()
    pressRef.current = { id: code.id, x: e.clientX, y: e.clientY, moved: false }
  }

  useEffect(() => {
    const onMove = (e) => {
      const p = pressRef.current
      if (!p) return
      if (!p.moved && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 4) return
      p.moved = true
      setDragId(p.id)
      const row = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.code-node')
      if (row && row.dataset.id !== p.id) {
        const r = row.getBoundingClientRect()
        const y = e.clientY - r.top
        const mode = y < r.height * 0.3 ? 'before' : y > r.height * 0.7 ? 'after' : 'inside'
        dropRef.current = { id: row.dataset.id, mode }
        setDropHint(dropRef.current)
      } else {
        dropRef.current = null
        setDropHint(null)
      }
    }
    const onUp = () => {
      const p = pressRef.current
      pressRef.current = null
      if (p?.moved && dropRef.current) moveCode(p.id, dropRef.current.id, dropRef.current.mode)
      dropRef.current = null
      setDragId(null)
      setDropHint(null)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [moveCode])

  return (
    <>
      <div className="topbar">
        <h1>Códigos</h1>
        <div className="topbar-actions">
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {data.codes.length} {data.codes.length === 1 ? 'código' : 'códigos'} no codebook
          </span>
        </div>
      </div>

      <div className="page">
        {data.codes.length === 0
          ? (
            <div className="empty">
              <h2>Detalhes dos códigos em um só lugar,<br />para você enxergar padrões</h2>
              <p>Explore os dados — veja seu codebook e os trechos ligados a cada código.</p>
              <div className="empty-actions">
                <button className="btn btn--blue" onClick={() => navigate('/documents')}>Começar a codificar</button>
              </div>
            </div>
          )
          : (
            <div className="pane-page codebook-page">
              <div className={'codebook-body' + (selected ? ' has-detail' : '')}>
              <div className="code-tree">
                {rows.map(({ code, depth }) => {
                  const st = stats.get(code.id) || { direct: 0, total: 0 }
                  const hint = dropHint?.id === code.id ? dropHint.mode : null
                  return (
                    <div
                      key={code.id}
                      className={
                        'code-node' +
                        (dragId === code.id ? ' dragging' : '') +
                        (selectedId === code.id ? ' selected' : '') +
                        (hint ? ' drop-' + hint : '')
                      }
                      style={{ paddingLeft: 10 + depth * 22 }}
                      data-id={code.id}
                      onClick={() => setSelectedId(selectedId === code.id ? null : code.id)}
                    >
                      <span
                        className="drag-handle"
                        title="Arraste para reorganizar"
                        onMouseDown={(e) => { e.stopPropagation(); startDrag(e, code) }}
                      >⠿</span>

                      <span className="swatch" style={{ background: code.color }} />

                      {renaming === code.id
                        ? (
                          <input
                            className="input"
                            autoFocus
                            value={renameValue}
                            style={{ maxWidth: 280, padding: '2px 6px' }}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={() => {
                              if (renameValue.trim()) updateCode(code.id, { name: renameValue.trim() })
                              setRenaming(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') e.currentTarget.blur()
                              if (e.key === 'Escape') setRenaming(null)
                            }}
                          />
                        )
                        : (
                          <span
                            className="code-name"
                            title="Clique duas vezes para renomear"
                            onDoubleClick={(e) => { e.stopPropagation(); setRenaming(code.id); setRenameValue(code.name) }}
                          >
                            {code.name}
                          </span>
                        )}

                      <span className="code-counts" title="Trechos neste código / incluindo subcódigos">
                        {st.direct}
                        {st.total !== st.direct && <span className="muted"> / {st.total}</span>}
                      </span>

                      <button
                        className="icon-btn"
                        title="Editar: nome, cor, hierarquia, mesclar, excluir"
                        onClick={(e) => { e.stopPropagation(); setManageCode(code) }}
                      >⋯</button>
                    </div>
                  )
                })}
              </div>

              {selected && (
                <div className="code-detail">
                  <div className="code-detail-head">
                    <span className="swatch" style={{ background: selected.color }} />
                    <h3>{selected.name}</h3>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                      {selectedExcerpts.length} {selectedExcerpts.length === 1 ? 'trecho' : 'trechos'} ·
                      {' '}{new Set(selectedExcerpts.map((e) => e.transcriptId)).size} documentos
                    </span>
                  </div>

                  <div className="color-row">
                    <span className="color-label">Cor do código</span>
                    <div className="color-grid">
                      {CODE_COLORS.map((c) => (
                        <button
                          key={c}
                          className={'color-dot' + (c.toLowerCase() === (selected.color || '').toLowerCase() ? ' active' : '')}
                          style={{ background: c }}
                          title={c}
                          onClick={() => updateCode(selected.id, { color: c })}
                        />
                      ))}
                      <label className="color-custom" title="Outra cor">
                        <input
                          type="color"
                          value={selected.color || '#4A90E2'}
                          onChange={(e) => updateCode(selected.id, { color: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>

                  <CodeDescription
                    value={selected.description || ''}
                    onSave={(value) => updateCode(selected.id, { description: value })}
                  />

                  <div className="code-relations">
                    <div className="code-relations-head">
                      <span className="cooccur-label">Relações</span>
                      <button className="btn--link" onClick={() => setLinkOpen(true)}>
                        + Relacionar
                      </button>
                    </div>
                    {relatedLinks.length === 0
                      ? (
                        <p className="code-relations-empty">
                          Nenhuma relação ainda. Ligue este código a outro para vê-los juntos na rede.
                        </p>
                        )
                      : (
                        <ul className="code-relations-list">
                          {relatedLinks.map(({ link, other, outgoing }) => (
                            <li key={link.id}>
                              <span className="code-dot" style={{ background: other.color }} />
                              <span className="relation-kind">
                                {relationLabelFor(link.type, CODE_RELATIONS, outgoing)}
                              </span>
                              <button
                                className="relation-target"
                                onClick={() => setSelectedId(other.id)}
                                title={`Ver ${other.name}`}
                              >
                                {other.name}
                              </button>
                              <button
                                className="relation-remove"
                                title="Remover relação"
                                onClick={() => removeCodeLink(link.id)}
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                        )}
                    {(parent || children.length > 0) && (
                      <div className="code-hierarchy">
                        {parent && (
                          <p>
                            <span className="code-hierarchy-label">Categoria</span>
                            <button className="code-hierarchy-link" onClick={() => setSelectedId(parent.id)}>
                              {parent.name}
                            </button>
                          </p>
                        )}
                        {children.length > 0 && (
                          <p>
                            <span className="code-hierarchy-label">Subcódigos</span>
                            {children.map((c) => (
                              <button
                                key={c.id}
                                className="code-hierarchy-link"
                                onClick={() => setSelectedId(c.id)}
                              >
                                {c.name}
                              </button>
                            ))}
                          </p>
                        )}
                      </div>
                    )}

                    <button className="btn--link code-relations-network" onClick={() => navigate('/networks')}>
                      Ver na rede →
                    </button>
                  </div>

                  {cooccurrence.length > 0 && (
                    <div className="cooccur">
                      <span className="cooccur-label">Aparece junto com</span>
                      {cooccurrence.map(({ code, n }) => (
                        <button
                          key={code.id}
                          className="code-chip"
                          style={{ background: code.color + '22', borderColor: code.color + '66' }}
                          onClick={() => setSelectedId(code.id)}
                          title={`Ver ${code.name}`}
                        >
                          <span className="code-dot" style={{ background: code.color }} />
                          {code.name}
                          <span className="chip-count">{n}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {picked.size > 0 && (
                    <div className="bulk-bar">
                      <span>{picked.size} citaç{picked.size === 1 ? 'ão' : 'ões'} selecionada{picked.size === 1 ? '' : 's'}</span>
                      <div style={{ flex: 1 }} />
                      <button className="btn btn--sm" onClick={() => setSplitOpen(true)}>Separar em novo código…</button>
                      <select
                        className="input"
                        style={{ width: 160, padding: '4px 8px' }}
                        value=""
                        onChange={(e) => { if (e.target.value) { moveExcerpts([...picked], e.target.value); setPicked(new Set()) } }}
                      >
                        <option value="">Mover para…</option>
                        {data.codes.filter((c) => c.id !== selected.id).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <button
                        className="btn btn--sm"
                        style={{ color: 'var(--error-text)' }}
                        onClick={() => { removeExcerpts([...picked]); setPicked(new Set()) }}
                      >
                        Remover
                      </button>
                      <button className="btn btn--sm" onClick={() => setPicked(new Set())}>Limpar</button>
                    </div>
                  )}

                  {selectedExcerpts.length > 0 && (
                    <div className="code-coverage">
                      <span className="cooccur-label">Cobertura</span>
                      {[...new Set(selectedExcerpts.map((e) => e.transcriptId))].map((tid) => {
                        const t = data.transcripts.find((x) => x.id === tid)
                        const n = selectedExcerpts.filter((e) => e.transcriptId === tid).length
                        return (
                          <span key={tid} className="coverage-item">
                            {t?.name || '—'} <strong>{n}</strong>
                          </span>
                        )
                      })}
                    </div>
                  )}

                  {selectedExcerpts.length === 0
                    ? <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum trecho vinculado a este código ainda.</p>
                    : (
                      <div className="excerpts">
                        {selectedExcerpts.map((ex) => {
                          const t = data.transcripts.find((x) => x.id === ex.transcriptId)
                          const memo = (data.memos || []).find((m) => m.quoteId === (ex.quoteId || ex.id) && m.kind === 'comment')
                          return (
                            <div className="excerpt-row" key={ex.id}>
                              <label className="pick">
                                <input
                                  type="checkbox"
                                  checked={picked.has(ex.id)}
                                  onChange={() => togglePick(ex.id)}
                                />
                              </label>
                              <div className="src">{t?.name || 'Documento removido'}{ex.page ? ` · página ${ex.page}` : ''}</div>
                              <div>“{ex.text.length > 320 ? ex.text.slice(0, 320) + '…' : ex.text}”</div>
                              {memo && <div className="excerpt-memo">Comentário: “{memo.text}”</div>}
                              <div className="excerpt-actions">
                                <span
                                  className="go"
                                  onClick={() => navigate(
                                    '/documents/' + ex.transcriptId +
                                    (ex.page ? '?page=' + ex.page : '?excerpt=' + ex.id)
                                  )}
                                >
                                  {ex.page ? `abrir na página ${ex.page} →` : 'abrir no trecho →'}
                                </span>
                                <label className="move">
                                  mover para
                                  <select
                                    value=""
                                    onChange={(e) => { if (e.target.value) moveExcerpt(ex.id, e.target.value) }}
                                  >
                                    <option value="">outro código…</option>
                                    {data.codes.filter((x) => x.id !== selected.id).map((x) => (
                                      <option key={x.id} value={x.id}>{x.name}</option>
                                    ))}
                                  </select>
                                </label>
                                <button
                                  className="btn--link"
                                  style={{ color: 'var(--error-text)' }}
                                  onClick={() => removeExcerpt(ex.id)}
                                >
                                  remover
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                </div>
              )}
              </div>
            </div>
          )}

      </div>

      {splitOpen && (
        <div className="import-modal" onClick={() => setSplitOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Separar em novo código</h3>
            <p className="modal-sub">
              As {picked.size} citações selecionadas saem de “{selected?.name}” e passam para um código novo (na raiz).
            </p>
            <input
              className="input"
              autoFocus
              placeholder="Nome do novo código"
              value={splitName}
              onChange={(e) => setSplitName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && splitName.trim()) {
                  const c = createCode(splitName.trim())
                  moveExcerpts([...picked], c.id)
                  setPicked(new Set()); setSplitOpen(false); setSplitName('')
                }
              }}
            />
            <div className="modal-actions">
              <button className="btn" onClick={() => setSplitOpen(false)}>Cancelar</button>
              <button
                className="btn btn--blue"
                disabled={!splitName.trim()}
                onClick={() => {
                  const c = createCode(splitName.trim())
                  moveExcerpts([...picked], c.id)
                  setPicked(new Set()); setSplitOpen(false); setSplitName('')
                }}
              >
                Separar
              </button>
            </div>
          </div>
        </div>
      )}

      {linkOpen && selected && (
        <RelationModal
          title="Relacionar código"
          from={selected.name}
          relations={CODE_RELATIONS}
          items={data.codes
            .filter((c) => c.id !== selected.id)
            .map((c) => ({ id: c.id, name: c.name, color: c.color, meta: c.parentId ? 'subcódigo' : null }))}
          onSave={(type, targetId) => addCodeLink(selected.id, targetId, type)}
          onClose={() => setLinkOpen(false)}
        />
      )}

      {manageCode && (
        <CodeModal
          code={data.codes.find((c) => c.id === manageCode.id) || manageCode}
          codes={data.codes}
          onClose={() => setManageCode(null)}
          onSave={(id, patch) => updateCode(id, patch)}
          onDelete={(id) => { deleteCode(id); setSelectedId(null) }}
          onMerge={(from, into) => mergeCodes(from, into)}
        />
      )}
    </>
  )
}

function CodeDescription ({ value, onSave }) {
  const [text, setText] = React.useState(value)
  const [focused, setFocused] = React.useState(false)
  React.useEffect(() => { if (!focused) setText(value) }, [value, focused])
  return (
    <textarea
      className="code-description"
      placeholder="Definição do código, critérios, reflexões…"
      value={text}
      rows={text.length > 90 ? 3 : 1}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false)
        if (text !== value) onSave(text.trim())
      }}
    />
  )
}


