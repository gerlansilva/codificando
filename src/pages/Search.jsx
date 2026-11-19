import React, { useEffect, useMemo, useState } from 'react'
import { useData, navigate } from '../App.jsx'
import MultiPicker from '../components/MultiPicker.jsx'
import { pageForOffset } from '../lib/pages.js'
import { makeSearchRegex } from '../lib/search.js'

export default function Search () {
  const { data } = useData()
  const [q, setQ] = useState('')
  const [docs, setDocs] = useState(() => new Set())
  const [codes, setCodes] = useState(() => new Set())
  const [picker, setPicker] = useState(null)
  const [anchor, setAnchor] = useState(null)
  const [limit, setLimit] = useState(200)

  const term = q.trim()

  useEffect(() => { setLimit(200) }, [term, docs, codes])

  const results = useMemo(() => {
    if (term.length < 2) return []
    const out = []

    // busca dentro dos trechos dos códigos escolhidos
    if (codes.size) {
      for (const ex of data.excerpts) {
        if (!codes.has(ex.codeId)) continue
        if (docs.size && !docs.has(ex.transcriptId)) continue
        const re = makeSearchRegex(term)
        let m
        while ((m = re.exec(ex.text)) && out.length < limit) {
          const from = Math.max(0, m.index - 70)
          const to = Math.min(ex.text.length, m.index + term.length + 90)
          const t = data.transcripts.find((x) => x.id === ex.transcriptId)
          const c = data.codes.find((x) => x.id === ex.codeId)
          out.push({
            key: ex.id + ':' + m.index,
            transcriptId: ex.transcriptId,
            name: t?.name,
            page: ex.page || null,
            excerptId: ex.id,
            occ: 0,
            codeName: c?.name,
            before: (from > 0 ? '…' : '') + ex.text.slice(from, m.index),
            match: m[0],
            after: ex.text.slice(m.index + term.length, to) + (to < ex.text.length ? '…' : '')
          })
        }
      }
      return out
    }

    for (const t of data.transcripts) {
      if (docs.size && !docs.has(t.id)) continue
      const re = makeSearchRegex(term) // novo por documento (lastIndex)
      let m
      let occ = 0
      while ((m = re.exec(t.body)) && out.length < limit) {
        const from = Math.max(0, m.index - 90)
        const to = Math.min(t.body.length, m.index + term.length + 130)
        out.push({
          key: t.id + ':' + m.index,
          transcriptId: t.id,
          name: t.name,
          page: pageForOffset(t.pageOffsets, m.index),
          excerptId: null,
          occ: occ++,
          codeName: null,
          before: (from > 0 ? '…' : '') + t.body.slice(from, m.index),
          match: m[0],
          after: t.body.slice(m.index + term.length, to) + (to < t.body.length ? '…' : '')
        })
      }
    }
    return out
  }, [term, data.transcripts, data.excerpts, data.codes, docs, codes, limit])

  const open = (r) => {
    const params = new URLSearchParams()
    if (r.page) params.set('page', String(r.page))
    if (r.excerptId) params.set('excerpt', r.excerptId)
    if (!r.excerptId) params.set('occ', String(r.occ))
    params.set('find', term)
    navigate('/documents/' + r.transcriptId + '?' + params.toString())
  }

  const docNames = [...docs].map((id) => data.transcripts.find((t) => t.id === id)?.name).filter(Boolean)
  const codeNames = [...codes].map((id) => data.codes.find((c) => c.id === id)?.name).filter(Boolean)

  return (
    <>
      <div className="topbar">
        <h1>Buscar</h1>
      </div>
      <div className="page">
        <div className="pane-page">
          <input
            className="input"
            autoFocus
            placeholder="Buscar em todos os documentos…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ fontSize: 16, padding: '12px 14px', marginBottom: 12 }}
          />

          <div className="search-filters">
            <button className="search-filter" onClick={(e) => { setAnchor(e.currentTarget.getBoundingClientRect()); setPicker('docs') }}>
              Documentos{docs.size ? ` (${docs.size})` : ''} ▾
            </button>
            <button className="search-filter" onClick={(e) => { setAnchor(e.currentTarget.getBoundingClientRect()); setPicker('codes') }}>
              Códigos{codes.size ? ` (${codes.size})` : ''} ▾
            </button>
            {(docs.size > 0 || codes.size > 0) && (
              <button
                className="search-filter search-filter--clear"
                onClick={() => { setDocs(new Set()); setCodes(new Set()) }}
              >
                Limpar filtros
              </button>
            )}
            {docNames.length > 0 && <span className="search-scope">em {docNames.slice(0, 3).join(', ')}{docNames.length > 3 ? ` +${docNames.length - 3}` : ''}</span>}
            {codeNames.length > 0 && <span className="search-scope">nos códigos {codeNames.slice(0, 4).join(', ')}{codeNames.length > 4 ? ` +${codeNames.length - 4}` : ''}</span>}
          </div>

          {term.length < 2 && (
            <p style={{ color: 'var(--text-muted)', marginTop: 16 }}>
              Digite ao menos 2 caracteres. A busca é local e instantânea.
            </p>
          )}

          {term.length >= 2 && (
            <p className="sub" style={{ marginTop: 16 }}>
              {results.length} {results.length === 1 ? 'ocorrência' : 'ocorrências'}
              {results.length >= limit ? ` · mostrando as ${limit} primeiras` : ''}
            </p>
          )}

          {results.map((r) => (
            <div key={r.key} className="code-card" style={{ cursor: 'pointer' }} onClick={() => open(r)}>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 6 }}>
                {r.name}{r.page ? ` · página ${r.page}` : ''}
                {r.codeName ? <span className="search-code"> · {r.codeName}</span> : null}
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.7 }}>
                {r.before}
                <mark style={{ background: 'var(--highlight)', padding: '0 2px' }}>{r.match}</mark>
                {r.after}
              </div>
            </div>
          ))}

          {results.length >= limit && (
            <button className="btn" style={{ marginTop: 12 }} onClick={() => setLimit((n) => n + 200)}>
              Mostrar mais
            </button>
          )}
        </div>
      </div>

      {picker === 'docs' && (
        <MultiPicker
          title="Documentos"
          items={data.transcripts}
          selected={docs}
          onToggle={(id) => setDocs((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
          })}
          onClose={() => setPicker(null)}
          anchor={anchor}
        />
      )}
      {picker === 'codes' && (
        <MultiPicker
          title="Códigos"
          items={data.codes}
          selected={codes}
          onToggle={(id) => setCodes((prev) => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id); else next.add(id)
            return next
          })}
          onClose={() => setPicker(null)}
          anchor={anchor}
        />
      )}
    </>
  )
}
