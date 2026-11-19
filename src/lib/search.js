/**
 * Busca tolerante a acentos: "ciencia" encontra "ciência", "codigo" encontra "código".
 * Cada letra vira uma classe com as variantes acentuadas (sempre 1 caractere),
 * então os deslocamentos no texto continuam válidos.
 */

const GROUPS = {
  a: 'aáàâãä',
  e: 'eéèêë',
  i: 'iíìîï',
  o: 'oóòôõö',
  u: 'uúùûü',
  c: 'cç',
  n: 'nñ',
  y: 'yýÿ'
}

function baseOf (ch) {
  return ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

export function searchPattern (term) {
  return [...String(term || '')].map((ch) => {
    const base = baseOf(ch)
    const group = GROUPS[base]
    if (group) {
      const upper = group.toUpperCase()
      return '[' + group + upper + ']'
    }
    return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }).join('')
}

export function makeSearchRegex (term) {
  return new RegExp(searchPattern(term), 'gi')
}
