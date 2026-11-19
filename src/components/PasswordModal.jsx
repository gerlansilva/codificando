import React, { useEffect, useRef, useState } from 'react'

/**
 * Modal de senha do projeto. Um componente para todos os fluxos:
 * abrir protegido, proteger, trocar, remover e decidir no “Salvar como…”.
 *
 * A senha existe apenas neste estado do React e, depois, na memória de
 * `src/data/store.js`. Nunca é gravada em disco nem em localStorage.
 */
export default function PasswordModal ({
  mode = 'unlock',
  projectName = '',
  error = null,
  busy = false,
  onSubmit,
  onCancel,
  onKeepOpen
}) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [current, setCurrent] = useState('')
  const [localError, setLocalError] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const askNew = mode === 'create' || mode === 'change' || mode === 'saveAs'
  const askCurrent = mode === 'change' || mode === 'remove'

  const submit = (e) => {
    e?.preventDefault?.()
    setLocalError(null)

    if (mode === 'unlock') {
      if (!password) return setLocalError('Digite a senha do projeto.')
      onSubmit(password)
      return
    }

    if (mode === 'remove') {
      if (!current) return setLocalError('Digite a senha atual para remover a proteção.')
      onSubmit({ current })
      return
    }

    if (askCurrent && !current) return setLocalError('Digite a senha atual.')
    if (!password) return setLocalError('Digite a nova senha.')
    if (password.length < 4) return setLocalError('Use pelo menos 4 caracteres.')
    if (password !== confirm) return setLocalError('As senhas não coincidem.')

    onSubmit(askCurrent ? { current, password } : { password })
  }

  const titles = {
    unlock: 'Projeto protegido',
    create: 'Proteger com senha',
    change: 'Trocar senha',
    remove: 'Remover senha',
    saveAs: 'Salvar como…'
  }

  const intro = {
    unlock: 'Este arquivo está cifrado. Digite a senha para abri-lo. Ela fica só na memória desta sessão.',
    create: 'O arquivo passa a ser gravado cifrado (AES-GCM 256, chave derivada da senha). Guarde a senha: sem ela o projeto não pode ser aberto.',
    change: 'Informe a senha atual e escolha uma nova. O arquivo será regravado com a nova chave.',
    remove: 'O projeto voltará a ser um JSON simples, legível por qualquer pessoa com acesso ao arquivo.',
    saveAs: 'Arquivo escolhido. Você pode gravá-lo protegido por senha ou manter aberto (JSON simples).'
  }

  const messages = {
    saveAs: 'Proteger ao salvar',
    create: 'Proteger projeto',
    change: 'Trocar senha',
    remove: 'Remover proteção',
    unlock: 'Abrir projeto'
  }

  const canKeepOpen = mode === 'saveAs' && typeof onKeepOpen === 'function'

  return (
    <div className="import-modal" role="dialog" aria-modal="true" aria-label={titles[mode]}>
      <form className="modal-card password-card" onSubmit={submit} onClick={(e) => e.stopPropagation()} style={{ width: 460 }}>
        <h3>{titles[mode]}{projectName ? <span className="password-project"> · {projectName}</span> : null}</h3>
        <p className="modal-sub">{intro[mode]}</p>

        {askCurrent && (
          <>
            <label className="field-label">Senha atual</label>
            <input
              ref={askCurrent && mode !== 'unlock' ? inputRef : undefined}
              className="input"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              style={{ marginBottom: 12 }}
            />
          </>
        )}

        {mode === 'unlock' && (
          <>
            <label className="field-label">Senha</label>
            <input
              ref={inputRef}
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ marginBottom: 6 }}
            />
          </>
        )}

        {askNew && (
          <>
            <label className="field-label">Nova senha</label>
            <input
              ref={askCurrent ? undefined : inputRef}
              className="input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ marginBottom: 12 }}
            />
            <label className="field-label">Confirmar senha</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              style={{ marginBottom: 6 }}
            />
          </>
        )}

        {localError && <p className="settings-error">{localError}</p>}
        {!localError && error && <p className="settings-error">{error}</p>}

        <div className="modal-actions" style={{ marginTop: 18 }}>
          {!canKeepOpen && (
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancelar</button>
          )}
          {canKeepOpen && (
            <button type="button" className="btn" onClick={onKeepOpen} disabled={busy}>
              Manter sem senha
            </button>
          )}
          <button type="submit" className="btn btn--blue" disabled={busy}>
            {busy ? 'Aguarde…' : messages[mode]}
          </button>
        </div>
      </form>
    </div>
  )
}
