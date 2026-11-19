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
  const { data, settings, setProjectMeta, reloadProject } = useData()
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

          <section className="settings-card settings-backups">
            <h2>Backups do projeto</h2>
            {!projectPath
              ? <p className="sub">Salve o projeto em um arquivo (“Salvar como…”) para manter um histórico de versões.</p>
              : (
                <>
                  <p className="sub">
                    Até 20 versões automáticas, uma por minuto no máximo. Arquivo:{' '}
                    <code title={projectPath}>{shortPath(projectPath, 64)}</code>
                  </p>

                  {backupError && <p className="settings-error">{backupError}</p>}
                  {backupMsg && <p className="settings-note">{backupMsg}</p>}

                  {loadingBackups
                    ? <p className="sub">Carregando backups…</p>
                    : backups.length === 0
                      ? <p className="sub">Nenhum backup ainda. Ele é criado automaticamente ao salvar o projeto.</p>
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

                  <div className="settings-actions">
                    <button className="btn" disabled={busyId !== null} onClick={createBackup}>
                      {busyId === 'create' ? 'Criando…' : 'Criar backup agora'}
                    </button>
                    <button className="btn" disabled={loadingBackups || busyId !== null} onClick={refreshBackups}>
                      Atualizar lista
                    </button>
                  </div>
                </>
              )}
          </section>
          <section className="settings-card settings-updates">
            <h2>Versão e atualizações</h2>
            <p className="sub">
              {appVersion ? `Versão ${appVersion}.` : ''} O Codificando só consulta atualizações quando você pede.
              Seus projetos continuam funcionando offline.
            </p>

            {update.status === 'latest' && (
              <p className="settings-note">Você está na versão mais recente.</p>
            )}
            {update.status === 'error' && <p className="settings-error">{update.message}</p>}

            {update.status === 'available' && (
              <div className="settings-update-available">
                <p>
                  <strong>Nova versão disponível: {update.version}</strong>
                  {update.currentVersion ? ` (você tem a ${update.currentVersion})` : ''}
                </p>
                {update.notes && <pre className="settings-update-notes">{update.notes}</pre>}
                <p className="sub">
                  Baixe e instale quando quiser. O app não baixa nada sozinho.
                </p>
                <div className="settings-actions">
                  <button className="btn btn--blue" onClick={startUpdate}>
                    Baixar e instalar
                  </button>
                  <button className="btn" onClick={cancelUpdate}>Agora não</button>
                </div>
              </div>
            )}

            {update.status === 'downloading' && (
              <p className="settings-note">
                {`Baixando a versão ${update.version}… `}
                {update.percent === null || update.percent === undefined ? '' : `${update.percent}%`}
                {' '}Não feche o app durante a instalação.
              </p>
            )}

            {update.status === 'installed' && (
              <>
                <p className="settings-note">
                  {`Atualização ${update.version} instalada. Reinicie o Codificando para usar a nova versão.`}
                </p>
                <div className="settings-actions">
                  <button
                    className="btn btn--blue"
                    onClick={() => relaunchApp().catch(() => flash('Feche e abra o Codificando manualmente.'))}
                  >
                    Reiniciar agora
                  </button>
                </div>
              </>
            )}

            {!canUpdate && (
              <p className="sub">Disponível apenas no app instalado, não no navegador de desenvolvimento.</p>
            )}

            <div className="settings-actions">
              <button
                className="btn"
                disabled={!canUpdate || update.status === 'checking' || update.status === 'downloading'}
                onClick={verifyUpdates}
              >
                {update.status === 'checking' ? 'Verificando…' : 'Verificar atualizações'}
              </button>
            </div>
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
