import React, { useMemo, useState } from 'react'
import { flattenTree, descendantsOf, CODE_COLORS } from '../lib/codes.js'

/**
 * Diálogo único de gerenciamento do código: nome, cor, hierarquia,
 * mesclagem e exclusão. Usado no Codebook e no painel do editor.
 */
export default function CodeModal ({ code, codes, onClose, onSave, onDelete, onMerge }) {
  const [name, setName] = useState(code.name)
  const [color, setColor] = useState(code.color || CODE_COLORS[0])
  const [parentId, setParentId] = useState(code.parentId || '')
  const [mergeInto, setMergeInto] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const forbidden = useMemo(() => new Set([code.id, ...descendantsOf(codes, code.id)]), [codes, code.id])
  const possibleParents = useMemo(
    () => flattenTree(codes.filter((c) => !forbidden.has(c.id))),
    [codes, forbidden]
  )
  const mergeTargets = useMemo(
    () => flattenTree(codes.filter((c) => c.id !== code.id)),
    [codes, code.id]
  )

  const save = () => {
    const clean = name.trim()
    if (!clean) return
    onSave(code.id, { name: clean, color, parentId: parentId || null })
    onClose()
  }

  return (
    <div className="import-modal" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ width: 560 }}>
        <h3>Editar código</h3>
        <p className="modal-sub">Nome, cor e posição na hierarquia.</p>

        <label className="field-label">Nome</label>
        <input
          className="input"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save() }}
          style={{ marginBottom: 14 }}
        />

        <label className="field-label">Cor</label>
        <div className="color-grid" style={{ marginBottom: 16 }}>
          {CODE_COLORS.map((c) => (
            <button
              key={c}
              className={'color-dot' + (c.toLowerCase() === color.toLowerCase() ? ' active' : '')}
              style={{ background: c }}
              title={c}
              onClick={() => setColor(c)}
            />
          ))}
          <label className="color-custom" title="Outra cor">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
        </div>

        <label className="field-label">Código pai (hierarquia)</label>
        <select className="input" value={parentId} onChange={(e) => setParentId(e.target.value)} style={{ marginBottom: 6 }}>
          <option value="">— nenhum (raiz) —</option>
          {possibleParents.map(({ code: c, depth }) => (
            <option key={c.id} value={c.id}>
              {'   '.repeat(depth)}{depth > 0 ? '↳ ' : ''}{c.name}
            </option>
          ))}
        </select>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 16px' }}>
          Ao escolher um pai, o código passa a aparecer indentado abaixo dele.
        </p>

        <label className="field-label">Mesclar em outro código</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <select className="input" value={mergeInto} onChange={(e) => setMergeInto(e.target.value)}>
            <option value="">— escolher —</option>
            {mergeTargets.map(({ code: c, depth }) => (
              <option key={c.id} value={c.id}>{'   '.repeat(depth)}{c.name}</option>
            ))}
          </select>
          <button
            className="btn"
            disabled={!mergeInto}
            onClick={() => { onMerge(code.id, mergeInto); onClose() }}
          >
            Mesclar
          </button>
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '0 0 4px' }}>
          Os trechos deste código passam para o escolhido; ele sai do codebook.
        </p>

        <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
          <button
            className="btn"
            style={{
              color: confirmDelete ? '#fff' : 'var(--error-text)',
              background: confirmDelete ? 'var(--error-text)' : '#fff',
              borderColor: 'var(--error-text)'
            }}
            onClick={() => {
              if (!confirmDelete) { setConfirmDelete(true); return }
              onDelete(code.id)
              onClose()
            }}
          >
            {confirmDelete ? 'Confirmar exclusão' : 'Excluir código'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Cancelar</button>
            <button className="btn btn--blue" onClick={save}>Salvar</button>
          </div>
        </div>
      </div>
    </div>
  )
}
