import React from 'react'

/**
 * Explicações ilustradas do codebook — mesmas três operações que o Delve
 * apresenta (merge / re-code / re-arrange), em português.
 */

function Bullet ({ children }) {
  return <li>{children}</li>
}

function MergeArt () {
  return (
    <svg viewBox="0 0 340 170" role="img" aria-label="Dois códigos se juntando em um">
      <rect x="26" y="22" width="252" height="34" rx="9" fill="#EAEAEA" />
      <rect x="268" y="22" width="11" height="34" rx="4" fill="#4A90E2" />
      <g stroke="#4A90E2" strokeWidth="2.5" strokeLinecap="round">
        <path d="M152 78 v22" />
        <path d="M141 89 h22" />
      </g>
      <rect x="26" y="116" width="252" height="34" rx="9" fill="#EAEAEA" />
      <rect x="268" y="116" width="11" height="34" rx="4" fill="#4A90E2" />
    </svg>
  )
}

function RecodeArt () {
  return (
    <svg viewBox="0 0 340 180" role="img" aria-label="Trechos sendo movidos entre códigos">
      <rect x="10" y="8" width="148" height="26" rx="7" fill="#EAEAEA" />
      <rect x="148" y="8" width="9" height="26" rx="4" fill="#4A90E2" />
      <rect x="182" y="8" width="148" height="26" rx="7" fill="#EAEAEA" />
      <rect x="320" y="8" width="9" height="26" rx="4" fill="#4A90E2" />

      <g fill="#fff" stroke="#D2D2D2" strokeWidth="1.4">
        <rect x="16" y="62" width="112" height="62" rx="10" />
        <rect x="206" y="56" width="112" height="62" rx="10" transform="rotate(9 262 87)" />
        <rect x="108" y="104" width="112" height="62" rx="10" transform="rotate(-8 164 135)" />
      </g>

      <g stroke="#D9D9D9" strokeWidth="4" strokeLinecap="round">
        <path d="M34 80 h76" /><path d="M34 94 h64" /><path d="M34 108 h70" />
        <path d="M224 76 h76" /><path d="M224 90 h64" /><path d="M224 104 h70" transform="rotate(9 262 87)" />
        <path d="M126 122 h76" /><path d="M126 136 h64" /><path d="M126 150 h70" transform="rotate(-8 164 135)" />
      </g>

      <g stroke="#4A90E2" strokeWidth="2.4" strokeLinecap="round" fill="none">
        <path d="M124 158 C 60 178, 40 140, 70 120" />
        <path d="M66 128 l6 -9 8 6" />
        <path d="M300 128 C 300 160, 220 168, 190 150" />
      </g>

      <g stroke="#4A90E2" strokeWidth="2.4" strokeLinecap="round">
        <path d="M148 112 l34 34" /><path d="M182 112 l-34 34" />
      </g>
    </svg>
  )
}

function RearrangeArt () {
  return (
    <svg viewBox="0 0 340 170" role="img" aria-label="Reordenando os códigos do codebook">
      <rect x="60" y="14" width="220" height="30" rx="8" fill="#EAEAEA" />
      <rect x="270" y="14" width="10" height="30" rx="4" fill="#4A90E2" />
      <rect x="112" y="62" width="188" height="30" rx="8" fill="#EAEAEA" />
      <rect x="290" y="62" width="10" height="30" rx="4" fill="#4A90E2" />
      <rect x="42" y="112" width="152" height="30" rx="8" fill="#EAEAEA" transform="rotate(-7 118 127)" />
      <rect x="186" y="112" width="10" height="30" rx="4" fill="#4A90E2" transform="rotate(-7 118 127)" />

      <g stroke="#4A90E2" strokeWidth="2.4" fill="none" strokeLinecap="round">
        <path d="M30 128 C 18 74, 46 40, 78 30" />
        <path d="M68 28 l12 -2 -3 12" />
      </g>
    </svg>
  )
}

export default function CodeGuides () {
  return (
    <section className="guides">
      <h2>Organize o codebook</h2>
      <p className="sub">Três operações para manter a análise coerente enquanto o projeto cresce.</p>

      <div className="guides-grid">
        <article className="guide">
          <h3>Mesclar códigos</h3>
          <div className="guide-art"><MergeArt /></div>
          <p>Junte dois códigos que significam a mesma coisa.</p>
          <ul>
            <Bullet>Escolha o código que vai permanecer.</Bullet>
            <Bullet>Todos os trechos do outro são transferidos para ele.</Bullet>
            <Bullet>O código absorvido desaparece do codebook.</Bullet>
          </ul>
        </article>

        <article className="guide">
          <h3>Recodificar trechos</h3>
          <div className="guide-art"><RecodeArt /></div>
          <p>Mova um trecho de um código para outro sem perder o contexto.</p>
          <ul>
            <Bullet>Abra o código, localize o trecho e clique em “mover para”.</Bullet>
            <Bullet>Use quando perceber que a citação pertence a outro tema.</Bullet>
            <Bullet>O trecho continua na mesma posição do documento.</Bullet>
          </ul>
        </article>

        <article className="guide">
          <h3>Reordenar códigos</h3>
          <div className="guide-art"><RearrangeArt /></div>
          <p>Coloque os códigos na ordem em que você pensa a análise.</p>
          <ul>
            <Bullet>Use as setas do cartão para subir ou descer.</Bullet>
            <Bullet>A ordem vale para o codebook e para os relatórios.</Bullet>
            <Bullet>Agrupe códigos irmãos para revelar a estrutura.</Bullet>
          </ul>
        </article>
      </div>
    </section>
  )
}
