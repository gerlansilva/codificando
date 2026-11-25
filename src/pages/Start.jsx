import React, { useState } from 'react'
import { useData, navigate } from '../App.jsx'
import { loadRecentProjects, shortPath } from '../data/store.js'
import { bridge } from '../lib/bridge.js'
import Logo from '../components/Logo.jsx'
import wordmark from '../assets/codificando-wordmark.png'
import { AUTHOR } from '../lib/about.js'

/**
 * Tela inicial: logo, criar/abrir projeto e recentes.
 * Não é obrigatória — quem só quer experimentar pode continuar sem arquivo.
 */
export default function Start () {
  const api = useData()
  const { data, projectPath, startNotice, dismissStartNotice } = api
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(null)
  const recents = loadRecentProjects().filter((r) => r.path !== projectPath)
  const hasContent = data.transcripts.length > 0 || data.codes.length > 0
  const unsaved = !projectPath && hasContent

  const create = async (e) => {
    e?.preventDefault()
    setBusy('new')
    api.newProject(name, description)
    // no app instalado, já pergunta onde guardar o arquivo do projeto
    if (bridge.isNative) await api.saveProjectAs()
    setBusy(null)
    navigate('/home')
  }

  const open = async (path) => {
    setBusy(path || 'open')
    try {
      if (path) await api.openProjectAt(path)
      else await api.openProject()
    } finally { setBusy(null) }
  }

  return (
    <div className="start">
      <div className="start-card">
        <div className="start-brand">
          <Logo size={64} />
          <img className="start-wordmark" src={wordmark} alt="Codificando" />
        </div>
        <p className="start-tagline">Análise qualitativa de entrevistas, documentos e artigos — do primeiro trecho marcado à rede de relações.</p>

        {startNotice && (
          <div className="start-notice" role="alert">
            <p>{startNotice}</p>
            <button className="btn--link" onClick={dismissStartNotice}>Entendi</button>
          </div>
        )}

        {!creating
          ? (
            <div className="start-actions">
              <button className="start-choice start-choice--primary" onClick={() => setCreating(true)}>
                <strong>Novo projeto</strong>
                <span>Comece do zero: dê um nome e escolha onde guardar.</span>
              </button>
              {bridge.isNative && (
                <button className="start-choice" disabled={!!busy} onClick={() => open(null)}>
                  <strong>{busy === 'open' ? 'Abrindo…' : 'Abrir projeto…'}</strong>
                  <span>Escolher um arquivo .investigando no computador.</span>
                </button>
              )}
              {hasContent && (
                <button className="start-choice" onClick={() => navigate('/home')}>
                  <strong>Continuar “{data.project.name}”</strong>
                  <span>{data.transcripts.length} documentos · {data.codes.length} códigos</span>
                </button>
              )}
            </div>
          )
          : (
            <form className="start-form" onSubmit={create}>
              <label className="field-label" htmlFor="start-name">Nome do projeto</label>
              <input
                id="start-name"
                className="input"
                autoFocus
                placeholder="Ex.: Entrevistas com professores — 2026"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <label className="field-label" htmlFor="start-desc">Objetivo ou pergunta de pesquisa (opcional)</label>
              <textarea
                id="start-desc"
                className="input"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
              {unsaved && (
                <p className="start-warn">
                  O projeto atual (“{data.project.name}”) ainda não foi guardado em arquivo e será substituído.
                  {bridge.isNative && <> <button type="button" className="btn--link" onClick={() => api.saveProjectAs()}>Salvar o atual primeiro…</button></>}
                </p>
              )}
              <div className="start-form-actions">
                <button type="button" className="btn" onClick={() => setCreating(false)}>Voltar</button>
                <button type="submit" className="btn btn--blue" disabled={!!busy}>
                  {busy === 'new' ? 'Criando…' : bridge.isNative ? 'Criar e escolher onde salvar' : 'Criar projeto'}
                </button>
              </div>
            </form>
          )}

        {recents.length > 0 && !creating && (
          <section className="start-recents" aria-label="Projetos recentes">
            <h2>Recentes</h2>
            {recents.slice(0, 6).map((r) => (
              <button key={r.path} className="start-recent" title={r.path} disabled={!!busy} onClick={() => open(r.path)}>
                <strong>{r.name}</strong>
                <span>{busy === r.path ? 'Abrindo…' : shortPath(r.path)}</span>
              </button>
            ))}
          </section>
        )}

        <details className="start-help">
          <summary>Como funcionam os projetos?</summary>
          <p>
            Um projeto é um arquivo (<code>.investigando</code>) que guarda seus documentos, códigos, citações, comentários e redes.
            Tudo é salvo automaticamente a cada alteração, no seu computador — nada vai para a internet.
          </p>
          <p>
            Não é obrigatório criar um projeto antes: dá para começar direto e usar “Salvar como…” depois.
            Se o arquivo de um projeto for apagado ou movido, o programa continua funcionando normalmente:
            ele avisa que não encontrou o arquivo e tira o projeto da lista de recentes. Para recuperar, abra o arquivo no novo local
            ou restaure uma cópia de segurança em Configurações.
          </p>
        </details>

        <footer className="start-credit">
          Criado por <strong>{AUTHOR.name}</strong>
          {' · '}
          <a href={AUTHOR.orcidUrl} onClick={(e) => { e.preventDefault(); bridge.openExternal(AUTHOR.orcidUrl) }}>ORCID</a>
          {' · '}
          <a href="#/settings" onClick={(e) => { e.preventDefault(); navigate('/settings') }}>Sobre e como citar</a>
          {' · '}versão {__APP_VERSION__}
        </footer>
      </div>
    </div>
  )
}
