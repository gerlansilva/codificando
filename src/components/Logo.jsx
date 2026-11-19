import React from 'react'
import icon from '../assets/codificando-icon.png'

/** Marca oficial do Codificando (PNG original, apenas recorte). */
export default function Logo ({ size = 34 }) {
  return (
    <img
      src={icon}
      width={size}
      height={size}
      alt="Codificando"
      className="brand-icon"
    />
  )
}
