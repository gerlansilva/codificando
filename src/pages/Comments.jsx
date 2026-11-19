import React, { useMemo, useState } from 'react'
import { useData, navigate } from '../App.jsx'
import { quoteToText, copyText } from '../lib/clipboard.js'
import { bridge } from '../lib/bridge.js'

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

/**
 * Lista central de comentários de citações.
 * Cada linha leva ao trecho no documento, já com o inspetor aberto.
 */
export default function Comments () {
  const { data, saveMemo } = useData()
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState(null)

  const all = useMemo(() => {
    const out = []
    for (const m of data.memos || []) {
      if (m.kind !== 'comment' || !(m.text || '').trim()) continue
      const group = data.excerpts.filter((e) => (e.quoteId || e.id) === m.quoteId)
      if (!group.length) continue
      const ex = group.find((e) => e.page) || group[0]
      const t = data.transcripts.find((x) => x.id === ex.transcriptId)
      out.push({
        id: m.id,
        quoteId: m.quoteId,
        comment: m.text,
        text: ex.text,
        page: ex.page || null,
        transcriptId: ex.transcriptId,
        docName: t?.name || 'Documento',
        when: m.updatedAt || null
      })
    }
    return out.sort((a, b) => a.docName.localeCompare(b.docName) || (a.page || 0) - (b.page || 0))
  }, [data.memos, data.excerpts, data.transcripts])

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return all
    return all.filter((r) =>
      r.comment.toLowerCase().includes(term) ||
      r.text.toLowerCase().includes(term) ||
      r.docName.toLowerCase().includes(term)
    )
  }, [all, q])

  const open = (r) => {
    const params = new URLSearchParams()
    if (r.page) params.set('page', String(r.page))
    params.set('inspect', r.quoteId)
    navigate('/documents/' + r.transcriptId + '?' + params.toString())
  }

  const whenLabel = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    return `${date} ${time}`
  }

  const exportCsv = () => {
    const head = ['Documento', 'Pagina', 'Trecho', 'Comentario']
    const lines = [head, ...rows.map((r) => [r.docName, r.page || '', r.text, r.comment])]
    bridge.saveFile(
      'investigando-comentarios.csv',
      '\uFEFF' + lines.map((l) => l.map(csvCell).join(',')).join('\n'),
      'text/csv;charset=utf-8'
    )
  }

  const copy = async (r) => {
    const ok = await copyText(quoteToText(r.text, r.page))
    if (!ok) return
    setCopied(r.id)
    setTimeout(() => setCopied(null), 1400)
  }

  return (
    <>
      <div className="topbar">
        <h1>Comentários</h1>
        <div className="topbar-actions">
          {all.length > 0 && (
            <button className="btn" onClick={exportCsv}>Exportar (.csv)</button>
          )}
          <input
            className="input"
            style={{ width: 260, padding: '6px 10px' }}
            placeholder="Filtrar comentários…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className="page">
        {all.length === 0
          ? (
            <div className="empty">
              <h2>Nenhum comentário ainda</h2>
              <p>
                Abra um documento, clique num trecho codificado e escreva em <strong>Comentário…</strong>.
                O comentário aparece aqui e no balãozinho do PDF.
              </p>
              <div className="empty-actions">
                <button className="btn btn--blue" onClick={() => navigate('/documents')}>Abrir documentos</button>
              </div>
            </div>
          )
          : (
            <div className="pane-page" style={{ maxWidth: 1180 }}>
              <p className="sub" style={{ marginBottom: 10 }}>
                {rows.length} comentário{rows.length === 1 ? '' : 's'}
                {q.trim() ? ` de ${all.length}` : ''} · clique para abrir o trecho no documento
              </p>

              <table className="quote-table">
                <thead>
                  <tr>
                    <th style={{ width: 200 }}>Documento</th>
                    <th style={{ width: 46, textAlign: 'right' }}>Pág.</th>
                    <th>Trecho</th>
                    <th style={{ width: 300 }}>Comentário</th>
                    <th style={{ width: 130 }}>Quando</th>
                    <th style={{ width: 84 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} onClick={() => open(r)}>
                      <td className="doc" title={r.docName}>{r.docName}</td>
                      <td className="page">{r.page || '—'}</td>
                      <td className="text" title={r.text}>“{r.text}”</td>
                      <td className="comment-text-cell" title={r.comment}>{r.comment}</td>
                      <td className="comment-when">{whenLabel(r.when)}</td>
                      <td className="comment-actions" onClick={(e) => e.stopPropagation()}>
                        <button className="comment-act" onClick={() => copy(r)}>{copied === r.id ? 'Copiado' : 'Copiar'}</button>
                        <button
                          className="comment-act comment-act--danger"
                          title="Remover comentário"
                          onClick={() => saveMemo(r.quoteId, '', 'comment')}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {rows.length === 0 && (
                <p className="sub" style={{ marginTop: 18 }}>Nenhum comentário corresponde ao filtro.</p>
              )}
            </div>
          )}
      </div>
    </>
  )
}
