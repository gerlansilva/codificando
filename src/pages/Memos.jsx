import React, { useMemo, useState } from 'react'
import { useData, navigate } from '../App.jsx'

/**
 * Visão unificada de memorandos: citações, códigos e documentos.
 * É o elo narrativo entre os elementos codificados.
 */
export default function Memos () {
  const { data } = useData()
  const [type, setType] = useState('all')

  const memos = useMemo(() => {
    const out = []

    for (const m of data.memos || []) {
      const ex = data.excerpts.find((e) => (e.quoteId || e.id) === m.quoteId)
      if (!ex) continue
      const doc = data.transcripts.find((t) => t.id === ex.transcriptId)
      out.push({
        id: 'q' + m.id,
        kind: m.kind === 'comment' ? 'comment' : 'quote',
        kindLabel: m.kind === 'comment' ? 'Comentário' : 'Citação',
        where: doc?.name || 'Documento',
        page: ex.page,
        excerptId: ex.id,
        transcriptId: ex.transcriptId,
        text: m.text,
        quote: ex.text.slice(0, 140)
      })
    }

    for (const c of data.codes) {
      if (!c.description || !c.description.trim()) continue
      out.push({
        id: 'c' + c.id,
        kind: 'code',
        kindLabel: 'Código',
        where: c.name,
        text: c.description
      })
    }

    for (const t of data.transcripts) {
      if (!t.memo || !t.memo.trim()) continue
      out.push({
        id: 'd' + t.id,
        kind: 'doc',
        kindLabel: 'Documento',
        where: t.name,
        transcriptId: t.id,
        text: t.memo
      })
    }
    return out
  }, [data])

  const filtered = type === 'all' ? memos : memos.filter((m) => m.kind === type)

  return (
    <>
      <div className="topbar">
        <h1>Memorandos</h1>
        <div className="topbar-actions">
          <select className="input" style={{ width: 170 }} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="all">Todos</option>
            <option value="quote">Memorandos de citação</option>
            <option value="comment">Comentários</option>
            <option value="code">Códigos</option>
            <option value="doc">Documentos</option>
          </select>
        </div>
      </div>

      <div className="page">
        {memos.length === 0
          ? (
            <div className="empty">
              <h2>Anote o raciocínio, não só o trecho</h2>
              <p>
                Escreva um memo numa citação (ao clicar no destaque), numa definição de código
                (⋯) ou nas informações do documento.
              </p>
              <div className="empty-actions">
                <button className="btn btn--blue" onClick={() => navigate('/documents')}>Abrir documentos</button>
              </div>
            </div>
          )
          : (
            <div className="pane-page" style={{ maxWidth: 1180 }}>
              <p className="sub">{filtered.length} {filtered.length === 1 ? 'memorando' : 'memorandos'}</p>

              <table className="quote-table">
                <thead>
                  <tr>
                    <th style={{ width: 96 }}>Tipo</th>
                    <th style={{ width: 240 }}>Onde</th>
                    <th>Memorando</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr
                      key={m.id}
                      onClick={() => {
                        if (m.kind === 'quote') navigate('/documents/' + m.transcriptId + (m.page ? '?page=' + m.page : '?excerpt=' + m.excerptId))
                        else if (m.kind === 'doc') navigate('/documents/' + m.transcriptId)
                        else navigate('/codes')
                      }}
                    >
                      <td><span className={'memo-kind memo-kind--' + m.kind}>{m.kindLabel}</span></td>
                      <td className="doc" title={m.where}>{m.where}{m.page ? ` · p.${m.page}` : ''}</td>
                      <td className="text" title={m.text}>“{m.text}”</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </>
  )
}
