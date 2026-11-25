import React, { useMemo, useState } from 'react'
import { useData, navigate } from '../App.jsx'
import { descendantsOf } from '../lib/codes.js'
import MultiPicker from '../components/MultiPicker.jsx'
import { bridge } from '../lib/bridge.js'
import Icon from '../components/Icon.jsx'
import ContextMenu from '../components/ContextMenu.jsx'
import { quoteToText, copyText } from '../lib/clipboard.js'

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

/**
 * Consultas: combina códigos (com subcódigos), documentos e texto.
 * Resultado = citações que satisfazem a combinação.
 */
export default function Consultas () {
  const { data, update, removeExcerpts } = useData()
  const [codes, setCodes] = useState(() => new Set())
  const [docs, setDocs] = useState(() => new Set())
  const [text, setText] = useState('')
  const [mode, setMode] = useState('any') // any | all
  const [picker, setPicker] = useState(null)
  const [anchor, setAnchor] = useState(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [activeQuery, setActiveQuery] = useState(null)
  const [sort, setSort] = useState('relevance')
  const [menu, setMenu] = useState(null)

  const toggle = (setter, id) => {
    setter((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const quotes = useMemo(() => {
    const map = new Map()
    for (const e of data.excerpts) {
      const qid = e.quoteId || e.id
      if (!map.has(qid)) {
        map.set(qid, { id: qid, text: e.text, page: e.page, transcriptId: e.transcriptId, codes: [], ids: [] })
      }
      const q = map.get(qid)
      q.ids.push(e.id)
      const c = data.codes.find((x) => x.id === e.codeId)
      if (c && !q.codes.some((x) => x.id === c.id)) q.codes.push(c)
    }
    return [...map.values()]
  }, [data.excerpts, data.codes])

  const selectedCodeIds = useMemo(() => {
    if (!codes.size) return null
    const set = new Set()
    for (const id of codes) {
      set.add(id)
      for (const d of descendantsOf(data.codes, id)) set.add(d)
    }
    return set
  }, [codes, data.codes])

  const allCodeSets = useMemo(
    () => [...codes].map((id) => {
      const set = new Set([id])
      for (const d of descendantsOf(data.codes, id)) set.add(d)
      return set
    }),
    [codes, data.codes]
  )

  const results = useMemo(() => {
    const q = text.trim().toLowerCase()
    return quotes.filter((item) => {
      if (docs.size && !docs.has(item.transcriptId)) return false
      if (q && !item.text.toLowerCase().includes(q)) return false
      if (selectedCodeIds) {
        const hits = item.codes.filter((c) => selectedCodeIds.has(c.id)).length
        if (mode === 'all') {
          if (!allCodeSets.every((set) => item.codes.some((c) => set.has(c.id)))) return false
        } else if (hits === 0) return false
      }
      return true
    })
  }, [quotes, docs, text, selectedCodeIds, mode, allCodeSets])

  const docName = (q) => data.transcripts.find((t) => t.id === q.transcriptId)?.name || ''
  const sorted = useMemo(() => {
    const arr = [...results]
    if (sort === 'document') {
      arr.sort((a, b) => docName(a).localeCompare(docName(b)) || (a.page || 0) - (b.page || 0))
    } else if (sort === 'page') {
      arr.sort((a, b) => (a.page || 0) - (b.page || 0) || docName(a).localeCompare(docName(b)))
    } else {
      arr.sort((a, b) => b.codes.length - a.codes.length || docName(a).localeCompare(docName(b)) || (a.page || 0) - (b.page || 0))
    }
    return arr
  }, [results, sort, data.transcripts])

  const hasFilters = codes.size > 0 || docs.size > 0 || !!text.trim()

  const sameName = (data.queries || []).find(
    (q) => q.name.toLowerCase() === saveName.trim().toLowerCase()
  )
  const overwriting = sameName && (!activeQuery || activeQuery.toLowerCase() !== saveName.trim().toLowerCase())

  const saveQuery = () => {
    const name = saveName.trim()
    if (!name) return
    update((d) => {
      const queries = (d.queries || []).filter((q) => q.name.toLowerCase() !== name.toLowerCase())
      queries.push({
        id: 'q_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name,
        codes: [...codes].filter((id) => data.codes.some((c) => c.id === id)),
        docs: [...docs].filter((id) => data.transcripts.some((t) => t.id === id)),
        text: text.trim(),
        mode,
        updatedAt: new Date().toISOString()
      })
      return { ...d, queries }
    })
    setActiveQuery(name)
    setSaveOpen(false)
    setSaveName('')
  }

  const loadQuery = (q) => {
    const validCodes = new Set(data.codes.map((c) => c.id))
    const validDocs = new Set(data.transcripts.map((t) => t.id))
    setCodes(new Set((q.codes || []).filter((id) => validCodes.has(id))))
    setDocs(new Set((q.docs || []).filter((id) => validDocs.has(id))))
    setText(q.text || '')
    setMode(q.mode || 'any')
    setActiveQuery(q.name)
  }

  const deleteQuery = (id) => {
    const q = (data.queries || []).find((x) => x.id === id)
    if (q && activeQuery === q.name) setActiveQuery(null)
    update((d) => ({ ...d, queries: (d.queries || []).filter((x) => x.id !== id) }))
  }

  const exportResults = () => {
    const rows = [['Documento', 'Pagina', 'Codigos', 'Trecho', 'Comentario']]
    for (const r of results) {
      const t = data.transcripts.find((x) => x.id === r.transcriptId)
      const comment = (data.memos || []).find((m) => m.quoteId === r.id && m.kind === 'comment')?.text || ''
      rows.push([t?.name || '', r.page || '', r.codes.map((c) => c.name).join('; '), r.text, comment])
    }
    const slug = (activeQuery || 'consulta').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    bridge.saveFile(`investigando-${slug || 'consulta'}.csv`, '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8')
  }

  return (
    <>
      <div className="topbar">
        <h1>Consultas</h1>
        <div className="topbar-actions">
          {results.length > 0 && (
            <button className="btn" onClick={exportResults}>Exportar resultados (.csv)</button>
          )}
          <button className="btn btn--blue" onClick={() => { setSaveName(activeQuery || ''); setSaveOpen(true) }}>
            Salvar consulta
          </button>
          {hasFilters > 0 && (
            <button
              className="btn"
              onClick={() => { setCodes(new Set()); setDocs(new Set()); setText(''); setActiveQuery(null) }}
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      <div className="page">
        <div className="pane-page" style={{ maxWidth: 1180 }}>
          {(data.queries || []).length > 0 && (
            <div className="saved-queries">
              <span className="saved-label">Consultas salvas</span>
              {(data.queries || []).map((q) => (
                <span className={'saved-chip' + (activeQuery === q.name ? ' is-active' : '')} key={q.id}>
                  <button className="saved-name" onClick={() => loadQuery(q)} title="Carregar consulta">{q.name}</button>
                  <button className="saved-del" title="Excluir consulta" onClick={() => deleteQuery(q.id)}>×</button>
                </span>
              ))}
            </div>
          )}

          <div className="query-card">
            <div className="query-row">
              <span className="query-label">Códigos</span>
              <div className="query-chips">
                {codes.size === 0 && <span className="query-empty">todos os códigos</span>}
                {[...codes].slice(0, 8).map((id) => {
                  const c = data.codes.find((x) => x.id === id)
                  if (!c) return null
                  return (
                    <button key={id} className="query-chip active" onClick={() => toggle(setCodes, id)} title="Remover">
                      <span className="code-dot" style={{ background: c.color }} />
                      {c.name}
                      <span className="chip-x">×</span>
                    </button>
                  )
                })}
                {codes.size > 8 && (
                  <button
                    className="query-chip"
                    title="Ver todos os selecionados"
                    onClick={(e) => { setAnchor(e.currentTarget); setPicker('codes') }}
                  >
                    +{codes.size - 8}
                  </button>
                )}
              </div>
              {codes.size > 1 && (
                <select className="input" style={{ width: 120, padding: '5px 8px' }} value={mode} onChange={(e) => setMode(e.target.value)}>
                  <option value="any">qualquer um</option>
                  <option value="all">todos</option>
                </select>
              )}
              <button
                className="query-add"
                onClick={(e) => { setAnchor(e.currentTarget); setPicker('codes') }}
              >
                + Selecionar códigos <Icon name="chevron" size={13} />
              </button>
            </div>

            <div className="query-row">
              <span className="query-label">Documentos</span>
              <div className="query-chips">
                {docs.size === 0 && <span className="query-empty">todos os documentos</span>}
                {[...docs].slice(0, 6).map((id) => {
                  const t = data.transcripts.find((x) => x.id === id)
                  if (!t) return null
                  return (
                    <button key={id} className="query-chip active" onClick={() => toggle(setDocs, id)} title="Remover">
                      {t.name}
                      <span className="chip-x">×</span>
                    </button>
                  )
                })}
                {docs.size > 6 && (
                  <button
                    className="query-chip"
                    title="Ver todos os selecionados"
                    onClick={(e) => { setAnchor(e.currentTarget); setPicker('docs') }}
                  >
                    +{docs.size - 6}
                  </button>
                )}
              </div>
              <button
                className="query-add"
                onClick={(e) => { setAnchor(e.currentTarget); setPicker('docs') }}
              >
                + Selecionar documentos <Icon name="chevron" size={13} />
              </button>
            </div>

            <div className="query-row">
              <span className="query-label">Texto</span>
              <input
                className="input"
                placeholder="conter no trecho…"
                value={text}
                onChange={(e) => setText(e.target.value)}
                style={{ maxWidth: 420 }}
              />
            </div>
          </div>

          <div className="results-head">
            <span className="results-count">
              {results.length} citaç{results.length === 1 ? 'ão' : 'ões'} encontrada{results.length === 1 ? '' : 's'}
              {results.length > 500 ? ' · mostrando as 500 primeiras' : ''}
            </span>
            <label className="sort-label">
              Ordenar por
              <select className="input sort-select" value={sort} onChange={(e) => setSort(e.target.value)}>
                <option value="relevance">Relevância</option>
                <option value="document">Documento</option>
                <option value="page">Página</option>
              </select>
            </label>
          </div>

          <table className="quote-table">
            <thead>
              <tr>
                <th style={{ width: 220 }}>Documento</th>
                <th style={{ width: 50, textAlign: 'right' }}>Pág.</th>
                <th style={{ width: 210 }}>Códigos</th>
                <th>Trecho</th>
                <th style={{ width: 40 }}><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 500).map((q) => {
                const t = data.transcripts.find((x) => x.id === q.transcriptId)
                return (
                  <tr
                    key={q.id}
                    onClick={() => navigate('/documents/' + q.transcriptId + (q.page ? '?page=' + q.page : '?excerpt=' + q.ids[0]))}
                  >
                    <td className="doc" title={t?.name}>
                      <span className={'doc-badge' + (t?.rendererType === 'pdf' ? ' doc-badge--pdf' : '')}>
                        <Icon name="documents" size={11} />
                      </span>
                      {t?.name || '—'}
                    </td>
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
                    <td className="row-more" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="icon-btn"
                        title="Ações da citação"
                        onClick={(e) => setMenu({ x: e.clientX, y: e.clientY, quote: q })}
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
      </div>

      {saveOpen && (
        <div className="import-modal" onClick={() => setSaveOpen(false)}>
          <div className="modal-card" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
            <h3>Salvar consulta</h3>
            <p className="modal-sub">
              Dê um nome para reabrir esta combinação depois.
              {overwriting && <><br /><strong style={{ color: '#b23b3b' }}>Já existe uma consulta com esse nome.</strong></>}
            </p>
            <input
              className="input"
              autoFocus
              placeholder="Ex.: Evasão · professores formadores"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveQuery() }}
            />
            <div className="modal-actions">
              <button className="btn" onClick={() => setSaveOpen(false)}>Cancelar</button>
              <button className="btn btn--blue" disabled={!saveName.trim()} onClick={saveQuery}>
                {overwriting ? 'Substituir' : sameName ? 'Atualizar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            {
              label: 'Abrir no documento',
              onClick: () => navigate('/documents/' + menu.quote.transcriptId + (menu.quote.page ? '?page=' + menu.quote.page : '?excerpt=' + menu.quote.ids[0]))
            },
            { label: 'Copiar trecho', onClick: () => copyText(quoteToText(menu.quote.text, menu.quote.page)) },
            { sep: true },
            {
              label: 'Remover citação',
              danger: true,
              onClick: () => removeExcerpts(menu.quote.ids)
            }
          ]}
        />
      )}

      {picker === 'codes' && (
        <MultiPicker
          title="Códigos"
          items={data.codes}
          selected={codes}
          onToggle={(id) => toggle(setCodes, id)}
          onClose={() => setPicker(null)}
          anchor={anchor}
        />
      )}
      {picker === 'docs' && (
        <MultiPicker
          title="Documentos"
          items={data.transcripts}
          selected={docs}
          onToggle={(id) => toggle(setDocs, id)}
          onClose={() => setPicker(null)}
          anchor={anchor}
        />
      )}
    </>
  )
}
