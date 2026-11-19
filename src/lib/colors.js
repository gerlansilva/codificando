/**
 * Cores de destaque legíveis.
 * O código continua com a cor original (ponto, sublinhado); o fundo do
 * destaque é uma mistura clara com branco, para o texto nunca sumir.
 */

export function tint (hex, keep = 0.24) {
  let h = String(hex || '#4A90E2').replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6) return `rgba(74, 144, 226, ${keep})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  const f = (c) => Math.round(255 - (255 - c) * keep)
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`
}

/**
 * O mesmo destaque, mas translúcido.
 *
 * Sobre a página do PDF o destaque fica por cima do desenho, então precisa de
 * alfa: com cor opaca ele cobriria justamente o texto marcado.
 */
export function tintAlpha (hex, alpha = 0.22) {
  let h = String(hex || '#4A90E2').replace('#', '').trim()
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6) return `rgba(74, 144, 226, ${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
