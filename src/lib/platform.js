/**
 * Rótulos de atalho conforme o sistema.
 *
 * No macOS o app mostra os símbolos do teclado (⌘, ⇧); no Windows, as teclas
 * escritas (Ctrl, Shift), que é o que o usuário realmente vê no teclado.
 */
export const IS_MAC = typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(String(navigator.platform || navigator.userAgent || ''))

/** "⌘B" no macOS; "Ctrl+B" no Windows/Linux. */
export function modKey (key) {
  return IS_MAC ? '⌘' + key : 'Ctrl+' + key
}

/** "⇧⌘G" no macOS; "Ctrl+Shift+G" no Windows/Linux. */
export function shiftModKey (key) {
  return IS_MAC ? '⇧⌘' + key : 'Ctrl+Shift+' + key
}
