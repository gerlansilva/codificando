import React, { useEffect, useState } from 'react'
import { readBinary } from '../lib/files.js'
import Logo from './Logo.jsx'
import meta from '../assets/avatars/meta.json'

/**
 * Avatares embutidos: TODA imagem colocada em src/assets/avatars/ entra
 * automaticamente no build (import.meta.glob), sem alteração do arquivo.
 */
const files = import.meta.glob('../assets/avatars/*.{png,jpg,jpeg,webp}', {
  eager: true,
  query: '?url',
  import: 'default'
})

const LABELS = { princesa: 'Princesa', bmo: 'BMO', lsp: 'LSP', finn: 'Finn', jake: 'Jake', marceline: 'Marceline', iceking: 'Rei do Gelo' }

export const BUILTIN_AVATARS = Object.entries(files)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, url]) => {
    const id = path.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase()
    const file = path.split('/').pop()
    return {
      builtin: id,
      name: LABELS[id] || id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' '),
      url,
      scale: meta[file]?.scale || 1.14
    }
  })

function useAvatarUrl (ref) {
  const [url, setUrl] = useState(null)

  useEffect(() => {
    let alive = true
    if (!ref?.key) { setUrl(null); return }
    readBinary(ref.key).then((bytes) => {
      if (!alive || !bytes || !bytes.length) return
      setUrl(URL.createObjectURL(new Blob([bytes])))
    })
    return () => { alive = false }
  }, [ref?.key])

  return url
}

export function Avatar ({ srcRef, size = 32, title }) {
  const key = srcRef?.builtin === 'marceline' ? 'marceline' : srcRef?.builtin
  const builtin = key ? BUILTIN_AVATARS.find((b) => b.builtin === key) : null
  const loaded = useAvatarUrl(srcRef)
  const url = builtin?.url || loaded

  if (!url) {
    return (
      <span className="avatar-badge avatar-badge--fallback" style={{ width: size, height: size }} title={title}>
        <Logo size={size} />
      </span>
    )
  }
  return (
    <span className="avatar-badge" style={{ width: size, height: size }} title={title || srcRef?.name}>
      <img
        src={url}
        alt={srcRef?.name || 'Avatar'}
        className="avatar-img"
        style={{ transform: `scale(${builtin?.scale || 1.14})` }}
      />
    </span>
  )
}
