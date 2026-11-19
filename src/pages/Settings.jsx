import React, { useEffect, useState } from 'react'
import { useData } from '../App.jsx'
import { bridge } from '../lib/bridge.js'
import { getProjectPath, shortPath } from '../data/store.js'
import {
  checkForUpdates,
  currentVersion,
  dismissUpdate,
  friendlyUpdateError,
  installUpdate,
  relaunchApp,
  updaterAvailable
} from '../lib/updater.js'

/** Configurações gerais: quem sou eu e o projeto. Só o essencial. */
export default function Settings () {
  const { data, settings, setProjectMeta, setProfile, reloadProject, protected: isProtected, openPasswordAction } = useData()
  const [name, setName] = useState(data.project.name)
  const [description, setDescription] = useState(data.project.description || '')
  const [saved, setSaved] = useState(false)
  const [dataFolder, setDataFolder] = useState('')

  const projectPath = getProjectPath()
  const [backups, setBackups] = useState([])
  const [loadingBackups, setLoadingBackups] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [backupMsg, setBackupMsg] = useState(null)
  const [backupError, setBackupError] = useState(null)

  const [appVersion, setAppVersion] = useState('')
  const [update, setUpdate] = useState({ status: 'idle' })
  const canUpdate = updaterAvailable()

  useEffect(() => { setName(data.project.name); setDescription(data.project.description || '') }, [data.project.name, data.project.description])
  useEffect(() => { bridge.dataDir().then((p) => setDataFolder(p || '')) }, [])
  useEffect(() => { currentVersion().then((v) => setAppVersion(v || '')) }, [])

  const refreshBackups = async () => {
    if (!projectPath) { setBackups([]); return }
    setLoadingBackups(true)
    setBackupError(null)
    try {
      const list = await bridge.backupList(projectPath)
      setBackups(Array.isArray(list) ? list : [])
    } catch (err) {
      setBackupError(String(err?.message || err))
    } finally {
      setLoadingBackups(false)
    }
  }

  useEffect(() => { refreshBackups() }, [])

  // Sem nome padrão: o app não leva os dados de quem o desenvolveu.
  const profile = {
    name: settings?.profile?.name || '',
    email: settings?.profile?.email || ''
  }
  const initials = profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

  const save = () => {
    setProjectMeta({ name: name.trim() || 'Projeto sem título', description: description.trim() })
    setSaved(true)
    setTimeout(() => setSaved(false), 1600)
  }

  const flash = (message) => {
    setBackupMsg(message)
    setTimeout(() => setBackupMsg(null), 3000)
  }

  const createBackup = async () => {
    if (!projectPath) return
    setBusyId('create')
    setBackupError(null)
    try {
      const id = await bridge.backupCreate(projectPath)
      flash(id ? 'Backup criado.' : 'Já existe um backup recente (menos de 1 minuto).')
      await refreshBackups()
    } catch (err) {
      setBackupError(String(err?.message || err))
    } finally {
      setBusyId(null)
    }
  }

  const restoreBackup = async (b) => {
    if (!projectPath) return
    const when = formatWhen(b.timestamp)
    if (!window.confirm(`Restaurar o backup de ${when}? O estado atual será guardado como um novo backup antes.`)) return
    setBusyId(b.id)
    setBackupError(null)
    try {
      const ok = await bridge.backupRestore(projectPath, b.id)
      if (!ok) throw new Error('não foi possível restaurar o backup')
      await reloadProject()
      await refreshBackups()
      flash('Backup restaurado. A tela foi atualizada.')
    } catch (err) {
      setBackupError(String(err?.message || err))
    } finally {
      setBusyId(null)
    }
  }

  const deleteBackup = async (b) => {
    if (!projectPath) return
    if (!window.confirm(`Excluir o backup de ${formatWhen(b.timestamp)}?`)) return
    setBusyId(b.id)
    setBackupError(null)
    try {
      const ok = await bridge.backupDelete(projectPath, b.id)
      if (!ok) throw new Error('não foi possível excluir o backup')
      await refreshBackups()
      flash('Backup excluído.')
    } catch (err) {
      setBackupError(String(err?.message || err))
    } finally {
      setBusyId(null)
    }
  }

  const verifyUpdates = async () => {
    if (update.status === 'available') await dismissUpdate(update.update)
    setUpdate({ status: 'checking' })
    const result = await checkForUpdates()
    setUpdate(result)
  }

  const startUpdate = async () => {
    if (update.status !== 'available' || !update.update) return
    const version = update.version
    setUpdate({ status: 'downloading', version, percent: null })
    try {
      await installUpdate(update.update, ({ percent }) => {
        setUpdate((prev) => (prev.status === 'downloading' ? { ...prev, percent } : prev))
      })
      setUpdate({ status: 'installed', version })
    } catch (err) {
      setUpdate({ status: 'error', message: friendlyUpdateError(err, 'install') })
    }
  }

  const cancelUpdate = async () => {
    await dismissUpdate(update.update)
    setUpdate({ status: 'idle' })
  }

  return (
    <>
      <div className="topbar">
        <h1>Configurações</h1>
      </div>

      <div className="page">
        <div className="pane-page settings-page">
          {!projectPath && (
            <p className="settings-notice">
              Este projeto ainda não foi salvo em um arquivo. Use <strong>⋯ → Salvar como…</strong> para habilitar senha e backups.
            </p>
          )}

          <section className="settings-card settings-me">
            <span className="me-avatar">{initials || '?'}</span>
            <div className="me-fields">
              <input
                className="me-name-input"
                value={profile.name}
                placeholder="Seu nome"
                aria-label="Seu nome"
                onChange={(e) => setProfile({ name: e.target.value })}
              />
              <input
                className="me-sub-input"
                value={profile.email}
                placeholder="seu@email (opcional)"
                aria-label="Seu e-mail"
                onChange={(e) => setProfile({ email: e.target.value })}
              />
            </div>
          </section>

          <section className="settings-card">
            <div className="card-head">
              <h2>Projeto</h2>
              <div className="settings-actions">
                <button className="btn btn--sm btn--blue" onClick={save}>{saved ? 'Salvo' : 'Salvar'}</button>
              </div>
            </div>
            <label className="field-label" htmlFor="pj-name">Nome</label>
            <input id="pj-name" className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={save} />
            <label className="field-label settings-field-gap" htmlFor="pj-desc">Descrição</label>
            <textarea
              id="pj-desc"
              className="settings-textarea"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={save}
              placeholder="Tema, recorte, objetivos…"
            />
          </section>

          <section className="settings-card">
            <div className="card-head">
              <h2>Dados</h2>
              <div className="settings-actions">
                <button
                  className="btn btn--sm"
                  disabled={!dataFolder || !bridge.isNative}
                  title={bridge.isNative ? 'Abrir a pasta no Finder' : 'Disponível apenas no app'}
                  onClick={() => bridge.revealPath(dataFolder)}
                >
                  Abrir no Finder
                </button>
              </div>
            </div>
            <div className="settings-kv">
              <span>Pasta</span>
              <code title={dataFolder}>{dataFolder || '…'}</code>
            </div>
            <p className="sub settings-hint">Projeto e arquivos anexados ficam só neste Mac.</p>
          </section>

          <section className="settings-card">
            <div className="card-head">
              <h2>
                Senha
                {isProtected
                  ? <span className="status-chip status-chip--ok">Protegido</span>
                  : <span className="status-chip status-chip--muted">Sem proteção</span>}
              </h2>
              <div className="settings-actions">
                {isProtected
                  ? (
                    <>
                      <button className="btn btn--sm" disabled={!projectPath} onClick={() => openPasswordAction('change')}>
                        Trocar
                      </button>
                      <button className="btn btn--sm" disabled={!projectPath} onClick={() => openPasswordAction('remove')}>
                        Remover
                      </button>
                    </>
                    )
                  : (
                    <button className="btn btn--sm" disabled={!projectPath} onClick={() => openPasswordAction('create')}>
                      Proteger com senha
                    </button>
                    )}
              </div>
            </div>
            <p className="sub">
              {isProtected
                ? 'Arquivo cifrado com AES-GCM 256. A senha não é gravada em disco.'
                : 'O arquivo .investigando é um JSON legível por quem tiver acesso a ele.'}
            </p>
          </section>

          <section className="settings-card settings-backups">
            <div className="card-head">
              <h2>
                Backups
                {projectPath && backups.length > 0 && (
                  <span className="status-chip status-chip--muted">{backups.length} de 20</span>
                )}
              </h2>
              <div className="settings-actions">
                <button className="btn btn--sm" disabled={busyId !== null} onClick={createBackup}>
                  {busyId === 'create' ? 'Criando…' : 'Criar agora'}
                </button>
                <button className="btn btn--sm" disabled={loadingBackups || busyId !== null} onClick={refreshBackups}>
                  Atualizar
                </button>
              </div>
            </div>

            {!projectPath
              ? <p className="sub">Disponível depois de salvar o projeto em um arquivo.</p>
              : (
                <>
                  <p className="sub">
                    Uma cópia automática a cada salvamento, no máximo uma por minuto.
                  </p>

                  {backupError && <p className="settings-error">{backupError}</p>}
                  {backupMsg && <p className="settings-note">{backupMsg}</p>}

                  {loadingBackups
                    ? <p className="sub">Carregando…</p>
                    : backups.length === 0
                      ? <p className="sub">Nenhum backup ainda.</p>
                      : (
                        <ul className="backup-list">
                          {backups.map((b) => (
                            <li key={b.id} className="backup-item">
                              <span className="backup-when">{formatWhen(b.timestamp)}</span>
                              <span className="backup-size">{formatBytes(b.bytes)}</span>
                              <span className="backup-actions">
                                <button
                                  className="btn btn--sm"
                                  disabled={busyId !== null}
                                  onClick={() => restoreBackup(b)}
                                >
                                  {busyId === b.id ? 'Restaurando…' : 'Restaurar'}
                                </button>
                                <button
                                  className="btn btn--sm backup-delete"
                                  disabled={busyId !== null}
                                  onClick={() => deleteBackup(b)}
                                >
                                  Excluir
                                </button>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                  <details className="settings-more">
                    <summary>Como funciona</summary>
                    <p>Restaurar sobrescreve o projeto com a versão escolhida; o estado atual é guardado antes como um novo backup.</p>
                    <p>Os backups são cópias exatas do arquivo{isProtected ? ' — permanecem cifrados' : ''}. Arquivo: <code title={projectPath}>{shortPath(projectPath, 72)}</code></p>
                  </details>
                </>
              )}
          </section>

          <section className="settings-card settings-updates">
            <div className="card-head">
              <h2>
                Versão
                {appVersion && <span className="status-chip status-chip--muted">{appVersion}</span>}
              </h2>
              <div className="settings-actions">
                <button
                  className="btn btn--sm"
                  disabled={!canUpdate || update.status === 'checking' || update.status === 'downloading'}
                  onClick={verifyUpdates}
                >
                  {update.status === 'checking' ? 'Verificando…' : 'Verificar atualizações'}
                </button>
              </div>
            </div>
            <p className="sub">A verificação é manual; o app continua funcionando offline.</p>

            {update.status === 'latest' && (
              <p className="settings-note">Você está na versão mais recente.</p>
            )}
            {update.status === 'error' && <p className="settings-error">{update.message}</p>}

            {update.status === 'available' && (
              <div className="settings-update-available">
                <p className="settings-update-title">
                  Nova versão: {update.version}
                  {update.currentVersion ? ` (atual: ${update.currentVersion})` : ''}
                </p>
                {update.notes && <pre className="settings-update-notes">{update.notes}</pre>}
                <div className="settings-actions">
                  <button className="btn btn--sm btn--blue" onClick={startUpdate}>
                    Baixar e instalar
                  </button>
                  <button className="btn btn--sm" onClick={cancelUpdate}>Agora não</button>
                </div>
              </div>
            )}

            {update.status === 'downloading' && (
              <p className="settings-note">
                {`Baixando ${update.version}… `}
                {update.percent === null || update.percent === undefined ? '' : `${update.percent}%`}
                {' '}Não feche o app.
              </p>
            )}

            {update.status === 'installed' && (
              <>
                <p className="settings-note">{`Atualização ${update.version} instalada.`}</p>
                <div className="settings-actions">
                  <button
                    className="btn btn--sm btn--blue"
                    onClick={() => relaunchApp().catch(() => flash('Feche e abra o Codificando manualmente.'))}
                  >
                    Reiniciar agora
                  </button>
                </div>
              </>
            )}

            {!canUpdate && (
              <p className="sub settings-hint">Disponível apenas no app instalado, não no navegador.</p>
            )}
          </section>
        </div>
      </div>
    </>
  )
}

function formatWhen (ms) {
  if (!ms) return '—'
  const d = new Date(Number(ms))
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

function formatBytes (n) {
  const bytes = Number(n) || 0
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}
