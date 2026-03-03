#!/usr/bin/env bash
set -euo pipefail

#
# CSE PV Generation - Script de packaging multiplateforme
#
# Usage:
#   ./scripts/package.sh              # Package pour l'OS courant
#   ./scripts/package.sh mac          # Package macOS (DMG + ZIP)
#   ./scripts/package.sh win          # Package Windows (NSIS installer + ZIP)
#   ./scripts/package.sh linux        # Package Linux (AppImage + DEB)
#   ./scripts/package.sh all          # Package toutes les plateformes
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RELEASE_DIR="$PROJECT_DIR/release"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ─────────────────────────────────────────────────────────
# Pre-flight checks
# ─────────────────────────────────────────────────────────

check_prerequisites() {
  info "Verification des prerequis..."

  if ! command -v node &>/dev/null; then
    error "Node.js n'est pas installe. Installez Node.js >= 18."
    exit 1
  fi

  NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
  if [ "$NODE_VERSION" -lt 18 ]; then
    error "Node.js >= 18 requis. Version actuelle: $(node -v)"
    exit 1
  fi
  ok "Node.js $(node -v)"

  if ! command -v npm &>/dev/null; then
    error "npm n'est pas installe."
    exit 1
  fi
  ok "npm $(npm -v)"

  # Check node_modules
  if [ ! -d "$PROJECT_DIR/node_modules" ]; then
    warn "node_modules absent, installation des dependances..."
    cd "$PROJECT_DIR" && npm install
  fi
  ok "Dependances installees"

  # Check ffmpeg-static binary
  FFMPEG_BIN="$PROJECT_DIR/node_modules/ffmpeg-static/ffmpeg"
  if [ -f "$FFMPEG_BIN" ] || [ -f "${FFMPEG_BIN}.exe" ]; then
    ok "ffmpeg embarque present"
  else
    warn "Binaire ffmpeg-static absent, reinstallation..."
    cd "$PROJECT_DIR" && npm rebuild ffmpeg-static
  fi

  # Check icons
  if [ ! -f "$PROJECT_DIR/build/icon.png" ]; then
    error "Icone build/icon.png manquante. Lancez d'abord la generation d'icones."
    exit 1
  fi
  ok "Icones presentes"
}

# ─────────────────────────────────────────────────────────
# Build
# ─────────────────────────────────────────────────────────

build_app() {
  info "Compilation de l'application..."
  cd "$PROJECT_DIR"

  info "  Compilation du renderer (Vite + React)..."
  npm run build:renderer
  ok "  Renderer compile"

  info "  Compilation du main process (TypeScript)..."
  npm run build:main
  ok "  Main process compile"

  ok "Build complet"
}

# ─────────────────────────────────────────────────────────
# Package functions
# ─────────────────────────────────────────────────────────

package_mac() {
  info "Packaging macOS (DMG + ZIP)..."
  cd "$PROJECT_DIR"
  npx electron-builder --mac --publish never
  ok "Package macOS termine"
  echo ""
  info "Fichiers generes :"
  ls -lh "$RELEASE_DIR"/*.dmg "$RELEASE_DIR"/*.zip 2>/dev/null || true
}

package_win() {
  info "Packaging Windows (NSIS + ZIP)..."
  cd "$PROJECT_DIR"
  npx electron-builder --win --publish never
  ok "Package Windows termine"
  echo ""
  info "Fichiers generes :"
  ls -lh "$RELEASE_DIR"/*.exe "$RELEASE_DIR"/*.zip 2>/dev/null || true
}

package_linux() {
  info "Packaging Linux (AppImage + DEB)..."
  cd "$PROJECT_DIR"
  npx electron-builder --linux --publish never
  ok "Package Linux termine"
  echo ""
  info "Fichiers generes :"
  ls -lh "$RELEASE_DIR"/*.AppImage "$RELEASE_DIR"/*.deb 2>/dev/null || true
}

package_current() {
  case "$(uname -s)" in
    Darwin*)  package_mac ;;
    Linux*)   package_linux ;;
    MINGW*|MSYS*|CYGWIN*) package_win ;;
    *)
      error "OS non reconnu: $(uname -s)"
      exit 1
      ;;
  esac
}

package_all() {
  warn "Le cross-compilation complete necessite les outils de build de chaque plateforme."
  warn "Sur macOS, le packaging Windows necessite 'wine' et Linux necessite des libs additionnelles."
  echo ""
  package_mac
  echo ""
  package_win
  echo ""
  package_linux
}

# ─────────────────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────────────────

print_summary() {
  echo ""
  echo -e "${GREEN}════════════════════════════════════════════════${NC}"
  echo -e "${GREEN}  Packaging termine avec succes !${NC}"
  echo -e "${GREEN}════════════════════════════════════════════════${NC}"
  echo ""
  info "Les fichiers distribuables se trouvent dans :"
  echo "    $RELEASE_DIR/"
  echo ""
  if [ -d "$RELEASE_DIR" ]; then
    info "Contenu :"
    ls -lh "$RELEASE_DIR"/ 2>/dev/null | grep -v "^total" | grep -v "builder-" | grep -v ".yaml" || true
  fi
  echo ""
  info "Distribution :"
  echo "    macOS  : Partagez le .dmg ou .zip"
  echo "    Windows: Partagez le .exe (installeur) ou .zip"
  echo "    Linux  : Partagez le .AppImage (portable) ou .deb (Debian/Ubuntu)"
}

# ─────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────

main() {
  echo ""
  echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║   CSE PV Generation - Packaging               ║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
  echo ""

  TARGET="${1:-current}"

  check_prerequisites
  echo ""
  build_app
  echo ""

  # Clean previous release
  if [ -d "$RELEASE_DIR" ]; then
    info "Nettoyage de l'ancien dossier release..."
    rm -rf "$RELEASE_DIR"
  fi

  case "$TARGET" in
    mac|macos|darwin)
      package_mac
      ;;
    win|windows)
      package_win
      ;;
    linux)
      package_linux
      ;;
    all)
      package_all
      ;;
    current|"")
      package_current
      ;;
    *)
      error "Cible inconnue: $TARGET"
      echo "Usage: $0 [mac|win|linux|all]"
      exit 1
      ;;
  esac

  print_summary
}

main "$@"
