import React, { useEffect, useMemo, useState } from 'react'

export const CODE_RELATIONS = [
  { value: 'associado', label: 'está associado a' },
  { value: 'parte', label: 'é parte de' },
  { value: 'contradiz', label: 'contradiz' },
  { value: 'explica', label: 'explica' },
  { value: 'precede', label: 'precede' }
]

export const QUOTE_RELATIONS = [
  { value: 'associado', label: 'está associado a' },
  { value: 'contradiz', label: 'contradiz' },
  { value: 'exemplifica', label: 'exemplifica' },
  { value: 'precede', label: 'precede' },
  { value: 'retoma', label: 'retoma' }
]

export function relationLabel (type, items) {
  return (items || []).find((r) => r.value === type)?.label || type || 'relacionado a'
}

/**
 * Escolhe um item e um tipo de relação.
 * items: [{ id, name, color?, meta? }]
 */
export default function RelationModal ({ title, from, items, relations, fixedTarget = null, onSave, onClose }) {
  const [q, setQ] = useState('')
  const [targetId, setTargetId] = useState(fixedTarget?.id || '')
  const [type, setType] = useState(relations[0]?.value || 'associado')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    return term ? items.filter((i) => i.name.toLowerCase().includes(term)) : items
  }, [q, items])

  const target = fixedTarget || items.find((i) => i.id === targetId)

  const submit = (e) => {
    e.preventDefault()
    if (!targetId) return
    onSave(type, targetId)
    onClose()
  }

  return (
    <div className="import-modal" onClick={onClose}>
      <form className="modal-card relation-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit} role="dialog" aria-label={title}>
        <h3>{title}</h3>
        {from && <p className="relation-from" title={from}>De: <strong>{from}</strong></p>}

        <label className="field-label" htmlFor="rel-type">Tipo de relação</label>
        <select id="rel-type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
          {relations.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>

        {fixedTarget
          ? (
            <p className="relation-fixed" title={fixedTarget.name}>
              Com: <strong>{fixedTarget.name}</strong>
            </p>
            )
          : (
            <>
              <label className="field-label relation-gap" htmlFor="rel-search">Para</label>
              <input
                id="rel-search"
                className="input"
                placeholder="Buscar…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <div className="relation-list">
                {filtered.length === 0 && <p className="sub">Nada encontrado.</p>}
                {filtered.map((i) => (
                  <button
                    type="button"
                    key={i.id}
                    className={'relation-item' + (i.id === targetId ? ' active' : '')}
                    onClick={() => setTargetId(i.id)}
                  >
                    {i.color && <span className="code-dot" style={{ background: i.color }} />}
                    <span className="relation-item-name">{i.name}</span>
                    {i.meta && <small>{i.meta}</small>}
                  </button>
                ))}
              </div>
            </>
            )}

        <div className="modal-actions relation-actions">
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn btn--blue" disabled={!targetId || !target}>
            Relacionar
          </button>
        </div>
      </form>
    </div>
  )
}
