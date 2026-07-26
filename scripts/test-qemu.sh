#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
kernel="$repo/target/riscv64gc-unknown-none-elf/debug/ai-os-kernel"
qemu="${QEMU:-qemu-system-riscv64}"
mode="solution"
name="qemu"
marker=""
log="$repo/target/qemu-ci.log"
err_log="$repo/target/qemu-ci.err.log"
timeout_seconds="${QEMU_TIMEOUT_SECONDS:-20}"
required_texts=()

usage() {
    cat <<'EOF'
Usage: scripts/test-qemu.sh --name NAME --marker TEXT [--mode solution|expect-incomplete] [--require TEXT] [--log PATH]

Modes:
  solution           QEMU output must contain --marker.
  expect-incomplete  QEMU output must not contain --marker and must contain every --require text.
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --name)
            name="$2"
            shift 2
            ;;
        --marker)
            marker="$2"
            shift 2
            ;;
        --mode)
            mode="$2"
            shift 2
            ;;
        --require)
            required_texts+=("$2")
            shift 2
            ;;
        --log)
            log="$2"
            err_log="${log%.log}.err.log"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown argument: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

if [[ -z "$marker" ]]; then
    echo "--marker is required" >&2
    usage >&2
    exit 2
fi

if [[ "$mode" != "solution" && "$mode" != "expect-incomplete" ]]; then
    echo "--mode must be solution or expect-incomplete" >&2
    exit 2
fi

mkdir -p "$(dirname "$log")"
rm -f "$log" "$err_log"

cd "$repo"
cargo build -p ai-os-kernel

if [[ ! -f "$kernel" ]]; then
    echo "Kernel ELF not found after build: $kernel" >&2
    exit 1
fi

set +e
timeout "${timeout_seconds}s" "$qemu" -machine virt -nographic -bios default -kernel "$kernel" >"$log" 2>"$err_log"
exit_code=$?
set -e

output="$(cat "$log" "$err_log")"
printf '%s\n' "$output"

if [[ "$exit_code" -eq 124 ]]; then
    echo "$name QEMU timed out after $timeout_seconds seconds." >&2
    exit 1
fi

if [[ "$exit_code" -ne 0 ]]; then
    echo "$name QEMU exited with code $exit_code." >&2
    exit 1
fi

if [[ "$mode" == "solution" ]]; then
    if ! grep -Fq "$marker" <<<"$output"; then
        echo "Expected $name success marker $marker was not found in QEMU output." >&2
        exit 1
    fi
    echo "$name QEMU solution test passed."
else
    if grep -Fq "$marker" <<<"$output"; then
        echo "Unexpected $name success marker $marker was found in starter output." >&2
        exit 1
    fi
    for required in "${required_texts[@]}"; do
        if ! grep -Fq "$required" <<<"$output"; then
            echo "Expected starter text was not found in $name output: $required" >&2
            exit 1
        fi
    done
    echo "$name QEMU starter incomplete test passed."
fi
