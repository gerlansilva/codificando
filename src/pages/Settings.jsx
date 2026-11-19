import React, { useEffect, useState } from 'react'
import { useData } from '../App.jsx'
import { bridge } from '../lib/bridge.js'

/** Configurações gerais: quem sou eu e o projeto. Só o essencial. */
export default function Settings () {
  const { data, settings, setProjectMeta } = useData()
  const [name, setName] = useState(data.project.name)
  const [description, setDescription] = useState(data.project.description || '')
  const [saved, setSaved] = useState(false)
  const [dataFolder, setDataFolder] = useState('')

  useEffect(() => { setName(data.project.name); setDescription(data.project.description || '') }, [data.project.name, data.project.description])
  useEffect(() => { bridge.dataDir().then((p) => setDataFolder(p || '')) }, [])

  const profile = {
    name: settings?.profile?.name || 'Gerlan Silva',
    email: settings?.profile?.email || 'gerlan@ufscar.br'
  }
  const initials = profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

  const save = () => {
    setProjectMeta({ name: name.trim() || 'Projeto sem título', description: description.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  return (
    <>
      <div className="topbar">
        <h1>Configurações</h1>
      </div>

      <div className="page">
        <div className="pane-page settings-page">
          <section className="settings-card settings-me">
            <span className="me-avatar">{initials}</span>
            <div>
              <h2>{profile.name}</h2>
              <p className="sub">{profile.email}</p>
            </div>
          </section>

          <section className="settings-card">
            <h2>Projeto</h2>
            <label className="field-label">Nome</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={save} />
            <label className="field-label" style={{ marginTop: 14 }}>Descrição</label>
            <textarea
              className="settings-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={save}
              placeholder="Tema, recorte, objetivos…"
            />
            <div className="settings-actions">
              <button className="btn btn--blue" onClick={save}>{saved ? 'Salvo' : 'Salvar'}</button>
            </div>
          </section>

          <section className="settings-card">
            <h2>Dados</h2>
            <p className="sub">
              O projeto e os arquivos anexados ficam guardados nesta pasta, no seu Mac.
            </p>
            <p className="sub" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, wordBreak: 'break-all' }}>
              {dataFolder || '…'}
            </p>
            <div className="settings-actions">
              <button
                className="btn"
                disabled={!dataFolder || !bridge.isNative}
                title={bridge.isNative ? 'Abrir a pasta no Finder' : 'Disponível apenas no app'}
                onClick={() => bridge.revealPath(dataFolder)}
              >
                Mostrar pasta de dados
              </button>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
