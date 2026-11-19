import React from 'react'
import { navigate, useData } from '../App.jsx'
import { parseBlocks } from '../lib/transcript.js'
import { bridge } from '../lib/bridge.js'

export default function Print ({ transcript }) {
  const { data } = useData()
  const blocks = parseBlocks(transcript.body)
  const excerpts = data.excerpts.filter((e) => e.transcriptId === transcript.id)
  const codesById = Object.fromEntries(data.codes.map((c) => [c.id, c]))

  const doPrint = () => {
    bridge.print()
  }

  return (
    <>
      <div className="topbar no-print">
        <h1>Exportar PDF</h1>
        <div className="topbar-actions">
          <button className="btn" onClick={() => navigate('/documents/' + transcript.id)}>Voltar</button>
          <button className="btn btn--blue" onClick={doPrint}>Exportar PDF</button>
        </div>
      </div>

      <div className="page">
        <div className="print-page">
          <h1>{transcript.name}</h1>

          {blocks.map((b, i) => (
            <div className="print-block" key={i}>
              {b.speaker && <div className="print-speaker">{b.speaker}</div>}
              {!b.speaker && b.time && <div className="print-speaker" style={{ color: '#777', fontWeight: 400 }}>{b.time}</div>}
              <div className="print-text">{transcript.body.slice(b.contentStart, b.contentEnd)}</div>
              {excerpts.filter((e) => e.start >= b.contentStart && e.end <= b.contentEnd).length > 0 && (
                <div style={{ marginTop: 4, fontSize: 11, color: '#555' }}>
                  {excerpts
                    .filter((e) => e.start >= b.contentStart && e.end <= b.contentEnd)
                    .map((e) => codesById[e.codeId]?.name)
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
            </div>
          ))}

          <div className="print-footer">Criado com o Investigando — análise qualitativa local.</div>
        </div>
      </div>
    </>
  )
}
