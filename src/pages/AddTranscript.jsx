import React, { useCallback, useRef, useState } from 'react'
import { useData, navigate } from '../App.jsx'
import { MAX_CHARS } from '../lib/importers.js'
import { fromBase64 } from '../lib/files.js'
import { bridge } from '../lib/bridge.js'
import { importOneFile, ACCEPT } from '../lib/importOne.js'

export default function AddTranscript () {
  const { createTranscript, updateTranscript } = useData()
  const [name, setName] = useState('')
  const [dragover, setDragover] = useState(false)
  const [alert, setAlert] = useState(null)
  const [queue, setQueue] = useState(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)



  const startFiles = useCallback(async (files) => {
    const list = [...files]
    if (!list.length) return
    if (list.some((f) => !ACCEPT.some((ext) => f.name.toLowerCase().endsWith(ext)))) {
      setAlert('unsupported')
      return
    }
    const typed = name.trim()
    const items = list.map((f) => ({
      id: f.name + Math.random(),
      file: f,
      name: f.name,
      title: list.length === 1 && typed ? typed : f.name,
      status: 'pending'
    }))
    setQueue(items)
    setBusy(true)
    setAlert(null)

    let imported = 0
    for (const item of items) {
      try {
        const res = await importOneFile(item.file, createTranscript, list.length === 1 ? typed : '', {
          onStatus: (status) => setQueue((q) => (q ? q.map((x) => (x.id === item.id ? { ...x, status } : x)) : q))
        })
        if (!res.ok) throw new Error(res.error)
        imported += 1
        setQueue((q) => (q ? q.map((x) => (x.id === item.id ? { ...x, status: 'ok', docId: res.id, title: res.name } : x)) : q))
      } catch (err) {
        console.error('Falha ao importar', item.name, err)
        setQueue((q) => (q ? q.map((x) => (x.id === item.id ? { ...x, status: 'error', error: err.message } : x)) : q))
      }
    }
    setBusy(false)
    if (imported > 0) {
      bridge.notify(
        'Importação concluída',
        imported === 1
          ? '1 documento adicionado ao projeto.'
          : `${imported} documentos adicionados ao projeto.`
      )
    }
  }, [createTranscript, name])

  const openPicker = useCallback(async () => {
    if (!bridge.isNative) { inputRef.current?.click(); return }
    try {
      const picked = await bridge.pickFiles()
      if (!picked || !picked.length) return
      const files = []
      for (const p of picked) {
        const b64 = await bridge.readPath(p.path)
        if (!b64) continue
        const bytes = fromBase64(b64)
        files.push({
          name: p.name,
          arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          text: async () => new TextDecoder('utf-8').decode(bytes)
        })
      }
      if (files.length) startFiles(files)
    } catch (err) {
      console.error('Falha ao escolher arquivos', err)
    }
  }, [startFiles])

  const applyTitles = (items) => {
    for (const f of items) {
      if (f.status !== 'ok' || !f.docId) continue
      const title = (f.title || '').trim() || f.name
      updateTranscript(f.docId, { name: title })
    }
  }

  const okCount = queue ? queue.filter((f) => f.status === 'ok').length : 0
  const errCount = queue ? queue.filter((f) => f.status === 'error').length : 0

  return (
    <>
      <div className="topbar">
        <h1>Adicionar documento</h1>
      </div>

      <div className="page">
        <div className="import-page">
          <div className="flow-hint">
            Envie PDF, Word, TXT ou RTF. Se o texto tiver falantes (“Nome:”), o editor mostra os diálogos por falante.
          </div>

          <label className="field-label" htmlFor="tname">Nome do documento</label>
          <input
            id="tname"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Entrevista 01 — Maria, ou Tese — Barros (2020)"
            style={{ marginBottom: 22 }}
          />

          <span className="field-label">Arquivo</span>

          <div
            className={'dropzone' + (dragover ? ' dragover' : '')}
            onClick={openPicker}
            onDragOver={(e) => { e.preventDefault(); setDragover(true) }}
            onDragLeave={() => setDragover(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragover(false)
              startFiles(e.dataTransfer.files)
            }}
          >
            <div className="dropzone-title">Arraste um documento</div>
            <div className="dropzone-title" style={{ fontSize: 30 }}>aceita .pdf, .doc, .docx, .txt ou .rtf</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>clique ou arraste para enviar</div>
            <div style={{ marginTop: 18 }}>
              <span className="btn btn--sm">Escolher arquivos…</span>
            </div>
            <input
              id="doc-file"
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT.join(',')}
              className="file-input"
              onChange={(e) => { startFiles(e.target.files); e.target.value = '' }}
            />
          </div>

          <div className="import-actions">
            <button className="btn btn--blue btn--block" onClick={openPicker}>
              Adicionar documento
            </button>
          </div>
        </div>
      </div>

      {alert === 'unsupported' && (
        <div className="import-modal" onClick={() => setAlert(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <h3>Tipo de arquivo não suportado</h3>
            <p className="modal-sub">Documentos aceitam .pdf, .doc, .docx, .txt ou .rtf.</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn--blue" onClick={() => setAlert(null)}>Entendi</button>
            </div>
          </div>
        </div>
      )}

      {alert === 'big' && (
        <div className="import-modal" onClick={() => setAlert(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center' }}>
            <h3>Texto muito grande</h3>
            <p className="modal-sub">O limite é de {MAX_CHARS.toLocaleString('pt-BR')} caracteres por documento.</p>
            <div className="modal-actions" style={{ justifyContent: 'center' }}>
              <button className="btn btn--blue" onClick={() => setAlert(null)}>Entendi</button>
            </div>
          </div>
        </div>
      )}

      {queue && (
        <div className="import-modal">
          <div className="modal-card">
            <h3>{busy ? `Importando arquivos: ${okCount + errCount}/${queue.length}` : `${okCount} ${okCount === 1 ? 'arquivo importado' : 'arquivos importados'}`}</h3>
            {!busy && errCount > 0 && (
              <div className="alert-error">Problemas ao importar {errCount} {errCount === 1 ? 'arquivo' : 'arquivos'}</div>
            )}
            <div style={{ overflow: 'auto' }}>
              {queue.map((f) => (
                <div className="file-row" key={f.id}>
                  {f.status === 'ok'
                    ? (
                      <input
                        className="input import-name"
                        value={f.title}
                        title="Nome do documento"
                        onChange={(e) => setQueue((q) => q.map((x) => (x.id === f.id ? { ...x, title: e.target.value } : x)))}
                      />
                    )
                    : <span>{f.name}</span>}
                  {f.status === 'pending' && <span style={{ color: 'var(--blue)' }}>importando…</span>}
                  {f.status === 'ocr' && <span style={{ color: 'var(--blue)' }}>PDF escaneado: aplicando OCR…</span>}
                  {f.status === 'ok' && <span className="status-ok">✓</span>}
                  {f.status === 'error' && (
                    <span className="status-err">
                      {f.error === 'empty' ? 'Sem texto extraível'
                        : f.error === 'ocr-failed' ? 'OCR falhou'
                          : f.error === 'ocr-empty' ? 'OCR não reconheceu texto'
                            : f.error === 'ocr-unavailable' ? 'PDF escaneado: OCR só no app'
                              : f.error === 'big' ? 'Acima do limite'
                                : f.error === 'convert-unsupported' ? 'Conversão de .doc só no app'
                                  : 'Algo deu errado'}
                    </span>
                  )}
                </div>
              ))}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => { applyTitles(queue); setQueue(null); setName('') }}>Adicionar mais</button>
              <button
                className="btn btn--blue"
                disabled={busy}
                onClick={() => {
                  const okItems = queue.filter((f) => f.status === 'ok')
                  applyTitles(okItems)
                  const first = okItems[0]
                  setQueue(null)
                  navigate(first?.docId ? '/documents/' + first.docId : '/documents')
                }}
              >
                Começar a codificar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
