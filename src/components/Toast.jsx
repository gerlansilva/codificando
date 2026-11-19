import React, { useEffect } from 'react'

export default function Toast ({ text, onUndo, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 7000)
    return () => clearTimeout(t)
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="toast" role="status">
      <span>{text}</span>
      {onUndo && (
        <button className="toast-action" onClick={() => { onUndo(); onClose() }}>
          Desfazer
        </button>
      )}
      <button className="toast-close" onClick={onClose} title="Fechar">×</button>
    </div>
  )
}
