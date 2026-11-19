import React, { useState } from 'react'
import { Avatar, BUILTIN_AVATARS } from './Avatars.jsx'

/** Projeto: nome, descrição, arquivo (novo/abrir/salvar como) e avatar. */
export default function ProjectModal ({
  project, avatarRef, avatars, path, onClose, onSaveMeta, onNew, onOpen, onSaveAs, onAddAvatars, onSelectAvatar, onClearAvatar
}) {
  const [name, setName] = useState(project.name || '')
  const [description, setDescription] = useState(project.description || '')
  const [confirmNew, setConfirmNew] = useState(false)
  const [busy, setBusy] = useState(false)

  const save = () => {
    onSaveMeta({ name: name.trim() || 'Projeto sem título', description: description.trim() })
    onClose()
  }

  const doSaveAs = async () => {
    setBusy(true)
    onSaveMeta({ name: name.trim() || 'Projeto sem título', description: description.trim() })
    await onSaveAs()
    setBusy(false)
  }

  const doOpen = async () => {
    setBusy(true)
    const p = await onOpen()
    setBusy(false)
    if (p) onClose()
  }

  return (
    <div className="import-modal" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: 620 }}>
        <h3>Projeto</h3>
        <p className="modal-sub">
          {path ? <>Arquivo: <code>{path}</code></> : 'Ainda não salvo em arquivo — use “Salvar como…”.'}
        </p>

        <label className="field-label">Nome</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 12 }} />

        <label className="field-label">Comentário do projeto</label>
        <textarea
          className="code-description"
          style={{ borderColor: 'var(--gray-200)', background: '#fff', minHeight: 64, marginBottom: 14 }}
          placeholder="Objetivo, corpus, notas metodológicas…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <label className="field-label">Avatar</label>
        <div className="avatar-row">
          <Avatar srcRef={avatarRef} size={48} />
          <button className="btn btn--sm" onClick={onAddAvatars}>Adicionar imagens…</button>
          {avatarRef && <button className="btn btn--sm" onClick={onClearAvatar}>Remover</button>}
          <span className="avatar-hint">suas imagens, sem alteração — só recorte circular</span>
        </div>
        <div className="avatar-grid" style={{ marginTop: 10 }}>
          {BUILTIN_AVATARS.map((a) => (
            <button
              key={a.builtin}
              className={'avatar-option' + (avatarRef?.builtin === a.builtin ? ' active' : '')}
              title={a.name}
              onClick={() => onSelectAvatar({ builtin: a.builtin, name: a.name })}
            >
              <Avatar srcRef={{ builtin: a.builtin }} size={40} />
            </button>
          ))}
          {avatars?.length > 0 && avatars.map((a, i) => (
              <button
                key={i}
                className={'avatar-option' + (avatarRef?.key === a.key ? ' active' : '')}
                title={a.name}
                onClick={() => onSelectAvatar(a)}
              >
                <Avatar srcRef={a} size={40} />
            </button>
          ))}
        </div>

        <div className="project-actions">
          <button
            className="btn btn--sm"
            style={{ color: confirmNew ? '#fff' : 'var(--error-text)', background: confirmNew ? 'var(--error-text)' : '#fff', borderColor: 'var(--error-text)' }}
            disabled={busy}
            onClick={() => {
              if (!confirmNew) { setConfirmNew(true); return }
              onNew(name, description)
              setConfirmNew(false)
              onClose()
            }}
          >
            {confirmNew ? 'Confirmar novo projeto' : 'Novo projeto'}
          </button>
          <button className="btn btn--sm" disabled={busy} onClick={doOpen}>Abrir projeto…</button>
          <button className="btn btn--sm" disabled={busy} onClick={doSaveAs}>
            {busy ? 'Salvando…' : 'Salvar como…'}
          </button>
        </div>

        <div className="modal-actions" style={{ marginTop: 18 }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn--blue" onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
