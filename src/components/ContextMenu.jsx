import React, { useEffect } from 'react'

/**
 * Menu de contexto próprio — aparece só ao clicar com o botão direito.
 * Fecha com clique fora, Escape, rolagem ou perda de foco.
 */
export default function ContextMenu ({ x, y, items, onClose }) {
  useEffect(() => {
    const close = () => onClose()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', close)
    document.addEventListener('scroll', close, true)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const left = Math.min(x, window.innerWidth - 240)
  const top = Math.min(y, window.innerHeight - (items.length * 34 + 20))

  return (
    <div
      className="ctx"
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, i) => (
        item.sep
          ? <div className="ctx-sep" key={'s' + i} />
          : (
            <button
              key={i}
              className={item.danger ? 'danger' : ''}
              onClick={() => { item.onClick(); onClose() }}
            >
              {item.label}
            </button>
          )
      ))}
    </div>
  )
}
