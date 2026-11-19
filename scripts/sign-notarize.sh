#!/usr/bin/env bash
#
# Assina (Developer ID) e notariza o Codificando no macOS.
#
# Uso:
#   scripts/sign-notarize.sh caminho/Codificando.app
#   scripts/sign-notarize.sh caminho/Codificando_0.2.0_aarch64.dmg
#
# Variáveis de ambiente obrigatórias (nunca ficam no repositório):
#   APPLE_ID           e-mail da conta Apple Developer
#   APPLE_TEAM_ID      Team ID (10 caracteres, em developer.apple.com > Membership)
#   APPLE_APP_PASSWORD senha de app gerada em appleid.apple.com
#
# Opcional:
#   APPLE_SIGNING_IDENTITY  identidade do certificado; se vazio, usa o primeiro
#                           "Developer ID Application: ..." instalado no chaveiro.
#
# O certificado Developer ID Application precisa estar no chaveiro (ver
# docs/DISTRIBUICAO.md). O script não guarda nem imprime segredos.

set -euo pipefail

TARGET="${1:-}"

fail () {
  printf 'erro: %s\n' "$*" >&2
  exit 1
}

usage () {
  cat >&2 <<'EOF'
Uso: scripts/sign-notarize.sh <Codificando.app | arquivo.dmg>

Antes, exporte no terminal (sem salvar em arquivo do repositório):
  export APPLE_ID="seu@email.com"
  export APPLE_TEAM_ID="ABCDE12345"
  export APPLE_APP_PASSWORD="abcd-efgh-ijkl-mnop"   # senha de app, não a do iCloud
EOF
}

[[ -n "$TARGET" ]] || { usage; exit 2; }
[[ -e "$TARGET" ]] || fail "arquivo não encontrado: $TARGET"
[[ "$(uname -s)" == "Darwin" ]] || fail "este script só roda no macOS"

for tool in codesign xcrun ditto spctl; do
  command -v "$tool" >/dev/null 2>&1 || fail "ferramenta ausente: $tool (instale as Command Line Tools: xcode-select --install)"
done

missing=()
[[ -n "${APPLE_ID:-}" ]] || missing+=("APPLE_ID")
[[ -n "${APPLE_TEAM_ID:-}" ]] || missing+=("APPLE_TEAM_ID")
[[ -n "${APPLE_APP_PASSWORD:-}" ]] || missing+=("APPLE_APP_PASSWORD")
if (( ${#missing[@]} > 0 )); then
  printf 'erro: variáveis de ambiente ausentes: %s\n\n' "${missing[*]}" >&2
  usage
  exit 1
fi

IDENTITY="${APPLE_SIGNING_IDENTITY:-}"
if [[ -z "$IDENTITY" ]]; then
  IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null \
    | sed -n 's/.*"\(Developer ID Application: .*\)"/\1/p' | head -n 1)"
fi
[[ -n "$IDENTITY" ]] || fail "nenhum certificado 'Developer ID Application' encontrado no chaveiro. Veja docs/DISTRIBUICAO.md."

xattr_clean () {
  xattr -cr "$1" 2>/dev/null || true
}

sign_app () {
  local app="$1"
  printf 'assumindo identidade: %s\n' "$IDENTITY"
  xattr_clean "$app"

  # Binários aninhados primeiro; o bundle por último.
  while IFS= read -r -d '' bin; do
    codesign --force --options runtime --timestamp --sign "$IDENTITY" "$bin"
  done < <(find "$app/Contents" -type f \( -name '*.dylib' -o -name '*.so' -o -name '*.node' \) -print0 2>/dev/null || true)

  while IFS= read -r -d '' fw; do
    codesign --force --options runtime --timestamp --sign "$IDENTITY" "$fw"
  done < <(find "$app/Contents/Frameworks" -maxdepth 1 -name '*.framework' -print0 2>/dev/null || true)

  local main_bin="$app/Contents/MacOS"
  if [[ -d "$main_bin" ]]; then
    while IFS= read -r -d '' bin; do
      codesign --force --options runtime --timestamp --sign "$IDENTITY" "$bin"
    done < <(find "$main_bin" -maxdepth 1 -type f -print0)
  fi

  codesign --force --options runtime --timestamp --sign "$IDENTITY" "$app"
  codesign --verify --deep --strict --verbose=2 "$app"
}

notarize () {
  local file="$1"
  printf 'enviando para a notarização da Apple (pode levar alguns minutos)…\n'
  xcrun notarytool submit "$file" \
    --apple-id "$APPLE_ID" \
    --team-id "$APPLE_TEAM_ID" \
    --password "$APPLE_APP_PASSWORD" \
    --wait
}

staple_ticket () {
  local file="$1"
  printf 'grampeando o ticket de notarização…\n'
  xcrun stapler staple "$file"
  xcrun stapler validate "$file"
}

case "$TARGET" in
  *.app)
    [[ -d "$TARGET" ]] || fail "não é um bundle .app: $TARGET"
    sign_app "$TARGET"
    ZIP="$(mktemp -d)/$(basename "$TARGET" .app).zip"
    ditto -c -k --keepParent "$TARGET" "$ZIP"
    notarize "$ZIP"
    rm -rf "$(dirname "$ZIP")"
    staple_ticket "$TARGET"
    printf '\npronto: %s assinado e notarizado.\n' "$TARGET"
    printf 'validação do Gatekeeper:\n'
    spctl --assess --type execute --verbose=2 "$TARGET" || \
      printf 'aviso: o Gatekeeper ainda pode reclamar em outro Mac; confira a identidade e o ticket.\n'
    ;;
  *.dmg)
    [[ -f "$TARGET" ]] || fail "não é um arquivo .dmg: $TARGET"
    xattr -cr "$TARGET" 2>/dev/null || true
    codesign --force --timestamp --sign "$IDENTITY" "$TARGET"
    codesign --verify --verbose=2 "$TARGET"
    notarize "$TARGET"
    staple_ticket "$TARGET"
    printf '\npronto: %s assinado e notarizado.\n' "$TARGET"
    spctl --assess --type open --context context:primary-signature --verbose=2 "$TARGET" || true
    ;;
  *)
    fail "esperado um .app ou .dmg: $TARGET"
    ;;
esac
