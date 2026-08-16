#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_dir="${CARGO_TARGET_DIR:-$repo/target}"
kernel="$target_dir/riscv64gc-unknown-none-elf/debug/ai-os-kernel"
qemu="${QEMU:-qemu-system-riscv64}"
stdbuf_command="${QEMU_STDBUF_COMMAND:-stdbuf}"
ubuntu_opensbi_firmware="/usr/lib/riscv64-linux-gnu/opensbi/generic/fw_jump.bin"
opensbi_firmware=""
mode="solution"
name="qemu"
marker=""
log="$repo/target/qemu-ci.log"
err_log="$repo/target/qemu-ci.err.log"
timeout_seconds="${QEMU_TIMEOUT_SECONDS:-20}"
required_texts=()
qemu_pid=""
qemu_exit=0
descendant_pids=()

usage() {
    cat <<'EOF'
Usage: scripts/test-qemu.sh --name NAME --marker TEXT [--mode solution|expect-incomplete] [--require TEXT] [--log PATH]

Modes:
  solution           QEMU output must contain --marker and every --require text.
  expect-incomplete  QEMU output must not contain --marker and must contain every --require text.
EOF
}

require_value() {
    local option="$1"
    local remaining="$2"
    if [[ "$remaining" -lt 2 ]]; then
        echo "$option requires a value" >&2
        usage >&2
        exit 2
    fi
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --name)
            require_value "$1" "$#"
            name="$2"
            shift 2
            ;;
        --marker)
            require_value "$1" "$#"
            marker="$2"
            shift 2
            ;;
        --mode)
            require_value "$1" "$#"
            mode="$2"
            shift 2
            ;;
        --require)
            require_value "$1" "$#"
            required_texts+=("$2")
            shift 2
            ;;
        --log)
            require_value "$1" "$#"
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

if [[ ! "$timeout_seconds" =~ ^[1-9][0-9]*$ ]]; then
    echo "QEMU_TIMEOUT_SECONDS must be a positive integer" >&2
    exit 2
fi

if [[ "${OPENSBI_FIRMWARE+x}" == "x" ]]; then
    if [[ -z "$OPENSBI_FIRMWARE" || ! -f "$OPENSBI_FIRMWARE" ]]; then
        echo "OPENSBI_FIRMWARE must reference an existing firmware file." >&2
        exit 2
    fi
    opensbi_firmware="$OPENSBI_FIRMWARE"
elif [[ -f "$ubuntu_opensbi_firmware" ]]; then
    opensbi_firmware="$ubuntu_opensbi_firmware"
else
    opensbi_firmware="default"
fi

if [[ "$log" != /* ]]; then
    log="$(pwd)/$log"
fi
err_log="${log%.log}.err.log"

mkdir -p -- "$(dirname -- "$log")" "$(dirname -- "$err_log")"
: >"$log"
: >"$err_log"
rm -f -- "$kernel"

cd "$repo"
cargo build -p ai-os-kernel

if [[ ! -f "$kernel" ]]; then
    echo "Kernel ELF not found after build: $kernel" >&2
    exit 1
fi

contains_text() {
    local text="$1"
    grep -Fq -- "$text" "$log" "$err_log" 2>/dev/null
}

all_required_present() {
    local required
    for required in "${required_texts[@]}"; do
        if ! contains_text "$required"; then
            return 1
        fi
    done
    return 0
}

report_missing_requirements() {
    local required
    local missing=0
    for required in "${required_texts[@]}"; do
        if ! contains_text "$required"; then
            echo "Expected QEMU text was not found in $name output: $required" >&2
            missing=1
        fi
    done
    return "$missing"
}

print_qemu_output() {
    cat -- "$log" "$err_log"
}

qemu_is_running() {
    local job_pid
    [[ -n "$qemu_pid" ]] || return 1
    kill -0 "$qemu_pid" 2>/dev/null || return 1
    while IFS= read -r job_pid; do
        if [[ "$job_pid" == "$qemu_pid" ]]; then
            return 0
        fi
    done < <(jobs -pr)
    return 1
}

collect_descendants() {
    local parent="$1"
    local child
    local process_rows=""
    local children=""

    if command -v pgrep >/dev/null 2>&1; then
        children="$(pgrep -P "$parent" 2>/dev/null || true)"
    elif command -v ps >/dev/null 2>&1 && command -v awk >/dev/null 2>&1; then
        if process_rows="$(ps -eo pid=,ppid= 2>/dev/null)"; then
            children="$(printf '%s\n' "$process_rows" | awk -v parent="$parent" '$2 == parent { print $1 }')"
        else
            process_rows="$(ps -ef 2>/dev/null || true)"
            children="$(printf '%s\n' "$process_rows" | awk -v parent="$parent" 'NR > 1 && $3 == parent { print $2 }')"
        fi
    fi

    while IFS= read -r child; do
        [[ -n "$child" ]] || continue
        collect_descendants "$child"
        descendant_pids+=("$child")
    done <<<"$children"
}

reap_qemu() {
    local pid="$qemu_pid"
    if wait "$pid"; then
        qemu_exit=0
    else
        qemu_exit=$?
    fi
    qemu_pid=""
}

terminate_qemu() {
    local pid="$qemu_pid"
    local child
    local attempt

    [[ -n "$pid" ]] || return 0

    descendant_pids=()
    collect_descendants "$pid"
    for child in "${descendant_pids[@]}"; do
        kill -TERM "$child" 2>/dev/null || true
    done
    kill -TERM "$pid" 2>/dev/null || true

    for attempt in {1..40}; do
        qemu_is_running || break
        sleep 0.05
    done

    if qemu_is_running; then
        collect_descendants "$pid"
        for child in "${descendant_pids[@]}"; do
            kill -KILL "$child" 2>/dev/null || true
        done
        kill -KILL "$pid" 2>/dev/null || true
    fi

    reap_qemu
}

cleanup_qemu() {
    local status=$?
    if qemu_is_running; then
        terminate_qemu >/dev/null 2>&1 || true
    elif [[ -n "$qemu_pid" ]]; then
        reap_qemu >/dev/null 2>&1 || true
    fi
    return "$status"
}

qemu_command=(
    "$qemu"
    -machine virt
    -nographic
    -bios "$opensbi_firmware"
    -kernel "$kernel"
)

if command -v "$stdbuf_command" >/dev/null 2>&1; then
    qemu_command=("$stdbuf_command" -oL -eL -- "${qemu_command[@]}")
else
    echo "stdbuf is unavailable; continuing with direct QEMU output capture." >&2
fi

trap cleanup_qemu EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"${qemu_command[@]}" >"$log" 2>"$err_log" &
qemu_pid=$!

start_seconds=$SECONDS
timed_out=0
passed_while_running=0
unexpected_marker=0

while true; do
    if ! qemu_is_running; then
        reap_qemu
        break
    fi

    if contains_text "$marker"; then
        if [[ "$mode" == "solution" ]] && all_required_present; then
            passed_while_running=1
            terminate_qemu
            break
        fi
        if [[ "$mode" == "expect-incomplete" ]]; then
            unexpected_marker=1
            terminate_qemu
            break
        fi
    fi

    if (( SECONDS - start_seconds >= timeout_seconds )); then
        timed_out=1
        terminate_qemu
        break
    fi

    sleep 0.1
done

trap - EXIT INT TERM
print_qemu_output

if [[ "$unexpected_marker" -eq 1 ]]; then
    echo "Unexpected $name success marker $marker was found in starter output." >&2
    exit 1
fi

if [[ "$passed_while_running" -eq 0 && "$timed_out" -eq 0 && "$qemu_exit" -ne 0 ]]; then
    echo "$name QEMU exited with code $qemu_exit." >&2
    exit 1
fi

if [[ "$mode" == "solution" ]]; then
    if ! contains_text "$marker"; then
        if [[ "$timed_out" -eq 1 ]]; then
            echo "$name QEMU timed out after $timeout_seconds seconds before marker $marker appeared." >&2
        else
            echo "Expected $name success marker $marker was not found in QEMU output." >&2
        fi
        exit 1
    fi
    if ! report_missing_requirements; then
        exit 1
    fi
    if [[ "$timed_out" -eq 1 ]]; then
        echo "$name QEMU timed out before all success evidence appeared." >&2
        exit 1
    fi
    echo "$name QEMU solution test passed."
else
    if contains_text "$marker"; then
        echo "Unexpected $name success marker $marker was found in starter output." >&2
        exit 1
    fi
    if ! report_missing_requirements; then
        exit 1
    fi
    echo "$name QEMU starter incomplete test passed."
fi
