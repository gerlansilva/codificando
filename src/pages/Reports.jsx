import React, { useEffect, useState } from 'react'
import { useData, navigate } from '../App.jsx'
import { projectStats, formatDate } from '../lib/transcript.js'
import { dataPath } from '../data/store.js'
import { bridge } from '../lib/bridge.js'
import { exportDocx, exportHtml } from '../lib/exports.js'

function download (name, content, type) {
  return bridge.saveFile(name, content, type)
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`

export default function Reports () {
  const { data } = useData()
  const stats = projectStats(data)
  const [path, setPath] = useState('')
  const [printing, setPrinting] = useState(false)
  const [exporting, setExporting] = useState(null)
  const [exportError, setExportError] = useState('')

  useEffect(() => { dataPath().then(setPath) }, [])

  useEffect(() => {
    if (!printing) return
    const t = setTimeout(() => {
      bridge.print()
      setPrinting(false)
    }, 120)
    return () => clearTimeout(t)
  }, [printing])

  const exportCodesCsv = async () => {
    const rows = [['Codigo', 'Trechos', 'Criado em']]
    for (const c of data.codes) {
      rows.push([c.name, data.excerpts.filter((e) => e.codeId === c.id).length, formatDate(c.createdAt)])
    }
    const ok = await download('investigando-codigos.csv', rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8')
    if (ok) bridge.notify('Exportação concluída', 'Planilha do codebook salva em investigando-codigos.csv.')
  }

  const exportExcerptsCsv = async () => {
    const rows = [['Transcricao', 'Codigo', 'Inicio', 'Fim', 'Trecho']]
    for (const e of data.excerpts) {
      const t = data.transcripts.find((x) => x.id === e.transcriptId)
      const c = data.codes.find((x) => x.id === e.codeId)
      rows.push([t?.name, c?.name, e.start, e.end, e.text])
    }
    const ok = await download('investigando-trechos.csv', '\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8')
    if (ok) bridge.notify('Exportação concluída', 'Trechos codificados salvos em investigando-trechos.csv.')
  }

  const exportAllTxt = async () => {
    const parts = data.transcripts.map((t) => {
      const ex = data.excerpts.filter((e) => e.transcriptId === t.id)
      const coded = ex.map((e) => `[${data.codes.find((c) => c.id === e.codeId)?.name}] ${e.text}`).join('\n')
      return `### ${t.name}\n\n${t.body}\n\n--- TRECHOS CODIFICADOS ---\n${coded}\n`
    })
    const ok = await download('investigando-documentos.txt', parts.join('\n====================\n\n'), 'text/plain;charset=utf-8')
    if (ok) bridge.notify('Exportação concluída', 'Documentos e códigos salvos em investigando-documentos.txt.')
  }

  const runExport = async (kind, fn) => {
    if (exporting) return
    setExportError('')
    setExporting(kind)
    try {
      await fn(data)
    } catch (err) {
      console.error('Falha na exportação', err)
      setExportError(`Não foi possível gerar o arquivo: ${err?.message || err}`)
    } finally {
      setExporting(null)
    }
  }

  const byCode = data.codes
    .map((c) => ({ ...c, n: data.excerpts.filter((e) => e.codeId === c.id).length }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n)

  return (
    <>
      <div className="topbar">
        <h1>Relatórios</h1>
        <div className="topbar-actions">
          <button className="btn" onClick={() => setPrinting(true)}>Salvar como PDF</button>
        </div>
      </div>

      <div className="page">
        <div className="pane-page">
          <div className="stat-grid">
            <div className="stat"><div className="n">{stats.transcripts}</div><div className="l">documentos</div></div>
            <div className="stat"><div className="n">{stats.codes}</div><div className="l">códigos</div></div>
            <div className="stat"><div className="n">{stats.excerpts}</div><div className="l">trechos codificados</div></div>
            <div className="stat"><div className="n">{stats.codedTranscripts}</div><div className="l">documentos com código</div></div>
          </div>

          <div className="report-export">
            <span className="report-export-label">Exportar</span>
            <div className="report-actions">
              <div className="report-group">
                <span className="report-group-label">Relatório completo</span>
                <button className="btn btn--blue" disabled={!!exporting} onClick={() => runExport('docx', exportDocx)}>
                  {exporting === 'docx' ? 'Gerando…' : 'Word (.docx)'}
                </button>
                <button className="btn" disabled={!!exporting} onClick={() => runExport('html', exportHtml)}>
                  {exporting === 'html' ? 'Gerando…' : 'Página web (.html)'}
                </button>
              </div>
              <div className="report-group">
                <span className="report-group-label">Dados para planilha</span>
                <button className="btn" onClick={exportCodesCsv}>Livro de códigos (.csv)</button>
                <button className="btn" onClick={exportExcerptsCsv}>Trechos codificados (.csv)</button>
              </div>
              <div className="report-group">
                <span className="report-group-label">Texto simples</span>
                <button className="btn" onClick={exportAllTxt}>Documentos + códigos (.txt)</button>
              </div>
            </div>
          </div>

          {exportError && (
            <p style={{ color: 'var(--error-text)', fontSize: 13 }}>{exportError}</p>
          )}

          <h2 className="report-section">Distribuição dos códigos</h2>

          {byCode.length === 0
            ? <p style={{ color: 'var(--text-muted)' }}>Nenhum trecho codificado ainda.</p>
            : (
              <table className="t-table">
                <thead>
                  <tr><th>Código</th><th style={{ width: 120 }}>Trechos</th><th style={{ width: 220 }}>Proporção</th></tr>
                </thead>
                <tbody>
                  {byCode.map((c) => {
                    const max = byCode[0].n || 1
                    return (
                      <tr key={c.id}>
                        <td className="name">{c.name}</td>
                        <td>{c.n}</td>
                        <td>
                          <div style={{ background: 'var(--gray-100)', height: 8, borderRadius: 4, width: '100%' }}>
                            <div style={{ background: c.color, height: 8, borderRadius: 4, width: `${(c.n / max) * 100}%` }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}

          <h2 className="report-section">Trechos por documento</h2>
          <table className="t-table">
            <thead>
              <tr><th>Documento</th><th style={{ width: 140 }}>Trechos</th><th style={{ width: 180 }}>Adicionado em</th></tr>
            </thead>
            <tbody>
              {data.transcripts.map((t) => (
                <tr key={t.id} onClick={() => navigate('/documents/' + t.id)}>
                  <td className="name">{t.name}</td>
                  <td>{data.excerpts.filter((e) => e.transcriptId === t.id).length}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{formatDate(t.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="report-foot" title={path || ''}>
            Salvo localmente em {path || '…'}
          </p>
        </div>
      </div>
    </>
  )
}
