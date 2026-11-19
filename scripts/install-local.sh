#!/usr/bin/env bash
#
# Instala o build local do Codificando em /Applications sem perder a versão antiga.
#
# Uso:
#   scripts/install-local.sh                                  # build release padrão
#   scripts/install-local.sh caminho/para/Codificando.app     # bundle específico
#
# O app antigo em /Applications vira Codificando-Swift.app (ou
# Codificando-Swift-AAAAMMDD-HHMMSS.app, se esse nome já existir), para que dê
# para voltar atrás a qualquer momento. O novo app é aberto no fim.

set -euo pipefail

APP_NAME="Codificando"
DEST_DIR="/Applications"
DEST="$DEST_DIR/$APP_NAME.app"
BACKUP="$DEST_DIR/$APP_NAME-Swift.app"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="${1:-$ROOT_DIR/src-tauri/target/release/bundle/macos/$APP_NAME.app}"

fail () {
  printf 'erro: %s\n' "$*" >&2
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "este script só roda no macOS"
[[ -d "$SOURCE" ]] || fail "build não encontrado: $SOURCE (rode: npm run tauri build)"
[[ "$SOURCE" == *.app ]] || fail "esperado um bundle .app: $SOURCE"

app_running () {
  pgrep -x "$APP_NAME" >/dev/null 2>&1 || pgrep -f "$DEST/Contents/MacOS/$APP_NAME" >/dev/null 2>&1
}

ask_close_app () {
  if ! app_running; then
    return 0
  fi
  printf 'O %s está aberto. Feche-o para continuar.\n' "$APP_NAME"
  printf 'Encerrar agora? [s/N] '
  local answer=""
  read -r answer || answer=""
  case "$answer" in
    s|S|sim|Sim|y|Y|yes)
      osascript -e "tell application \"$APP_NAME\" to quit" >/dev/null 2>&1 || true
      for _ in 1 2 3 4 5 6 7 8 9 10; do
        app_running || return 0
        sleep 0.5
      done
      printf 'O app não fechou sozinho; encerrando o processo.\n'
      pkill -x "$APP_NAME" 2>/dev/null || pkill -f "$DEST/Contents/MacOS/$APP_NAME" 2>/dev/null || true
      sleep 1
      app_running && fail "não foi possível encerrar o $APP_NAME. Feche-o manualmente e tente de novo."
      ;;
    *)
      fail "nada foi alterado. Feche o $APP_NAME e rode o script novamente."
      ;;
  esac
}

ask_close_app

# Move a versão atual para um nome de reserva, sem nunca sobrescrever uma reserva.
if [[ -e "$DEST" ]]; then
  if [[ -e "$BACKUP" ]]; then
    STAMP="$(date +%Y%m%d-%H%M%S)"
    BACKUP="$DEST_DIR/$APP_NAME-Swift-$STAMP.app"
  fi
  printf 'movendo a versão atual para %s\n' "$BACKUP"
  mv "$DEST" "$BACKUP"
fi

printf 'copiando %s para %s\n' "$SOURCE" "$DEST"
ditto "$SOURCE" "$DEST"

# O build local não é notarizado; não bloqueie a abertura por isso.
xattr -dr com.apple.quarantine "$DEST" 2>/dev/null || true

printf 'abrindo o novo %s…\n' "$APP_NAME"
open "$DEST"

printf '\npronto. Versão instalada: %s\n' "$DEST"
if [[ -e "$BACKUP" ]]; then
  printf 'versão anterior preservada em: %s\n' "$BACKUP"
fi
