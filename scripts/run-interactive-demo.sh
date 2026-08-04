#!/usr/bin/env sh
set -eu

PORT="${OS_DEMO_PORT:-4173}"
RUN_KERNEL=0
OPEN_BROWSER=1

usage() {
    printf '%s\n' "Usage: sh scripts/run-interactive-demo.sh [--port PORT] [--run] [--no-browser]"
    printf '%s\n' "  --port PORT    Set the local page port (default: 4173)."
    printf '%s\n' "  --run          Build and run the current OS branch after startup."
    printf '%s\n' "  --no-browser   Do not try to open the page automatically."
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
        --no-browser)
            OPEN_BROWSER=0
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

if ! command -v node >/dev/null 2>&1; then
    printf '%s\n' "Node.js was not found. Install Node.js 18 or newer first." >&2
    exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
SERVER="$REPO_DIR/docs/interactive-demo/server.js"
URL="http://127.0.0.1:$PORT"

if [ ! -f "$SERVER" ]; then
    printf 'Interactive Demo server was not found: %s\n' "$SERVER" >&2
    exit 1
fi

cleanup() {
    trap - EXIT INT TERM HUP
    if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
        kill "$SERVER_PID" >/dev/null 2>&1 || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
}

cd "$REPO_DIR"
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

if [ "$OPEN_BROWSER" -eq 1 ]; then
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$URL" >/dev/null 2>&1 &
    else
        printf '%s\n' "xdg-open is unavailable; open the URL above in your browser."
    fi
fi

wait "$SERVER_PID"
