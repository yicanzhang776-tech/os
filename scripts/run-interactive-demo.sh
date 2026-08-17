#!/usr/bin/env sh
set -eu

# The page includes branch-specific teaching questions and needs no extra feedback service.

PORT="${OS_DEMO_PORT:-8888}"
TARGET="${OS_DEMO_TARGET:-riscv64gc-unknown-none-elf}"
RUN_KERNEL=0
OPEN_BROWSER=1
CHECK_ONLY=0
DESKTOP_PET=0

usage() {
    printf '%s\n' "Usage: sh scripts/run-interactive-demo.sh [--port PORT] [--run] [--check-only] [--no-browser] [--desktop-pet]"
    printf '%s\n' "  --port PORT    Set the local page port (default: 8888)."
    printf '%s\n' "  --run          Build and run the current OS branch after startup."
    printf '%s\n' "  --check-only   Check the complete Linux build/QEMU chain, then exit."
    printf '%s\n' "  --no-browser   Do not try to open the page automatically."
    printf '%s\n' "  --desktop-pet  Start the optional transparent desktop companion."
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --port)
            if [ "$#" -lt 2 ]; then
                printf '%s\n' "--port requires a number." >&2
                exit 2
            fi
            PORT="$2"
            shift 2
            ;;
        --run)
            RUN_KERNEL=1
            shift
            ;;
        --check-only)
            CHECK_ONLY=1
            shift
            ;;
        --no-browser)
            OPEN_BROWSER=0
            shift
            ;;
        --desktop-pet)
            DESKTOP_PET=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            printf 'Unknown option: %s\n' "$1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

case "$PORT" in
    ''|*[!0-9]*)
        printf 'Invalid port: %s\n' "$PORT" >&2
        exit 2
        ;;
esac

if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    printf 'Port must be between 1 and 65535.\n' >&2
    exit 2
fi

require_command() {
    command_name="$1"
    install_hint="$2"
    if command -v "$command_name" >/dev/null 2>&1; then
        printf 'found %s: %s\n' "$command_name" "$(command -v "$command_name")"
        return 0
    fi
    printf 'Missing dependency: %s. %s\n' "$command_name" "$install_hint" >&2
    return 1
}

check_bridge_dependencies() {
    failed=0
    require_command node "Install Node.js 18 or newer." || failed=1
    require_command git "Install Git." || failed=1
    if [ "$failed" -ne 0 ]; then
        return 1
    fi
    node_major=$(node -p 'Number(process.versions.node.split(".")[0])')
    if [ "$node_major" -lt 18 ]; then
        printf 'Node.js 18 or newer is required; found %s.\n' "$(node --version)" >&2
        return 1
    fi
}

check_kernel_dependencies() {
    failed=0
    require_command cargo "Install Rust via rustup." || failed=1
    require_command rustc "Install Rust via rustup." || failed=1
    require_command "${QEMU:-qemu-system-riscv64}" "Install QEMU with RISC-V system support." || failed=1
    if [ "$failed" -ne 0 ]; then
        return 1
    fi
    if ! rustc --print target-libdir --target "$TARGET" >/dev/null 2>&1; then
        printf 'Rust target %s is unavailable. Run: rustup target add %s\n' "$TARGET" "$TARGET" >&2
        return 1
    fi
    printf 'found Rust target: %s\n' "$TARGET"
}

check_bridge_dependencies
if [ "$DESKTOP_PET" -eq 1 ]; then
    node_version=$(node -p 'process.versions.node')
    node_major=$(node -p 'Number(process.versions.node.split(".")[0])')
    node_minor=$(node -p 'Number(process.versions.node.split(".")[1])')
    if [ "$node_major" -lt 22 ] || { [ "$node_major" -eq 22 ] && [ "$node_minor" -lt 12 ]; }; then
        printf 'The optional desktop pet requires Node.js 22.12 or newer; found %s. The browser-only demo can still use Node.js 18+.\n' "$node_version" >&2
        exit 1
    fi
    if [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
        printf '%s\n' "The desktop pet requires an active X11, XWayland, or Wayland graphical session." >&2
        exit 1
    fi
fi
if [ "$RUN_KERNEL" -eq 1 ] || [ "$CHECK_ONLY" -eq 1 ]; then
    check_kernel_dependencies
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
    printf '%s\n' "Linux visualization run chain check passed."
    exit 0
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
SERVER="$REPO_DIR/docs/interactive-demo/server.js"
URL="http://127.0.0.1:$PORT"
DESKTOP_DIR="$REPO_DIR/desktop/kernel-buddy"
ELECTRON="$DESKTOP_DIR/node_modules/.bin/electron"
PET_PID=""

if [ "$DESKTOP_PET" -eq 1 ]; then
    if [ ! -f "$DESKTOP_DIR/package-lock.json" ]; then
        printf 'Desktop pet lockfile was not found: %s\n' "$DESKTOP_DIR/package-lock.json" >&2
        exit 1
    fi
    if [ ! -x "$ELECTRON" ]; then
        require_command npm "Installing the optional desktop pet requires a Node.js distribution that includes npm." || exit 1
        printf '%s\n' "Installing the locked desktop pet dependency with npm ci..."
        if ! (cd "$DESKTOP_DIR" && npm ci --no-audit --no-fund); then
            printf '%s\n' "Desktop pet dependency installation failed. Check npm network/proxy settings, then retry." >&2
            exit 1
        fi
    fi
    if ! "$ELECTRON" --version >/dev/null; then
        printf '%s\n' "Electron 43.2.0 could not download its Linux runtime. Check npm/Electron proxy access, remove desktop/kernel-buddy/node_modules, then retry." >&2
        exit 1
    fi
fi

if [ ! -f "$SERVER" ]; then
    printf 'Interactive Demo server was not found: %s\n' "$SERVER" >&2
    exit 1
fi

cleanup() {
    trap - EXIT INT TERM HUP
    if [ -n "$PET_PID" ] && kill -0 "$PET_PID" >/dev/null 2>&1; then
        kill "$PET_PID" >/dev/null 2>&1 || true
        wait "$PET_PID" 2>/dev/null || true
    fi
    if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
        kill "$SERVER_PID" >/dev/null 2>&1 || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
}

cd "$REPO_DIR"
export OS_DEMO_PORT="$PORT"
export OS_DEMO_TARGET="$TARGET"
if [ "$RUN_KERNEL" -eq 1 ]; then
    node "$SERVER" --port "$PORT" --run &
else
    node "$SERVER" --port "$PORT" &
fi
SERVER_PID=$!
trap cleanup EXIT INT TERM HUP

sleep 1
if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    wait "$SERVER_PID"
    exit $?
fi

printf '\nOS experiment visualization is running at %s\n' "$URL"
printf '%s\n' "Keep this terminal open. Press Ctrl+C to stop the local service."

if [ "$DESKTOP_PET" -eq 1 ]; then
    "$ELECTRON" "$DESKTOP_DIR" --bridge-origin "$URL" &
    PET_PID=$!
    sleep 1
    if ! kill -0 "$PET_PID" >/dev/null 2>&1; then
        wait "$PET_PID" || true
        printf '%s\n' "The desktop pet exited during startup. Review the Electron output above." >&2
        exit 1
    fi
    printf '%s\n' "Kernel Buddy desktop companion is active. Use its tray menu to hide or exit it."
fi

if [ "$OPEN_BROWSER" -eq 1 ]; then
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$URL" >/dev/null 2>&1 &
    else
        printf '%s\n' "xdg-open is unavailable; open the URL above in your browser."
    fi
fi

wait "$SERVER_PID"
