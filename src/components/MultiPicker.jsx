import React, { useEffect, useState } from 'react'

/**
 * Seletor múltiplo com busca — escala para centenas de itens.
 * Mostra apenas os selecionados fora do popover.
 */
export default function MultiPicker ({ title, items, selected, onToggle, onClose, anchor }) {
  const [q, setQ] = useState('')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    const onDown = () => onClose()
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [onClose])

  const rect = anchor?.getBoundingClientRect?.() || { left: 300, bottom: 240 }
  const left = Math.min(rect.left, window.innerWidth - 340)
  const top = Math.min(rect.bottom + 6, window.innerHeight - 360)

  const filtered = items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div className="picker" style={{ left, top }} onMouseDown={(e) => e.stopPropagation()}>
      <input
        className="input"
        autoFocus
        placeholder={`Buscar ${title.toLowerCase()}…`}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        style={{ padding: '6px 8px', fontSize: 13 }}
      />
      <div className="picker-list">
        {filtered.map((i) => (
          <label key={i.id} className="picker-item">
            <input type="checkbox" checked={selected.has(i.id)} onChange={() => onToggle(i.id)} />
            {i.color && <span className="code-dot" style={{ background: i.color }} />}
            <span className="picker-name">{i.name}</span>
          </label>
        ))}
        {filtered.length === 0 && <div className="picker-empty">nada encontrado</div>}
      </div>
      <div className="picker-foot">
        {selected.size} selecionado{selected.size === 1 ? '' : 's'} · {items.length} no total
        <button className="btn--link" onClick={onClose} style={{ float: 'right' }}>fechar</button>
      </div>
    </div>
  )
}
