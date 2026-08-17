#!/usr/bin/env bash
set -euo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
script="$repo/scripts/test-qemu.sh"
tmp="$(mktemp -d)"
fake_bin="$tmp/bin"
fake_target="$tmp/target"
mkdir -p "$fake_bin" "$fake_target"

cleanup() {
    rm -rf -- "$tmp"
}
trap cleanup EXIT

if LC_ALL=C grep -q $'\r' "$script"; then
    echo "test-qemu.sh contains CR characters" >&2
    exit 1
fi

cat >"$fake_bin/cargo" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${FAKE_CARGO_FAIL:-0}" == "1" ]]; then
    exit 9
fi
mkdir -p -- "$(dirname -- "$FAKE_KERNEL_PATH")"
: >"$FAKE_KERNEL_PATH"
EOF

cat >"$fake_bin/fake-qemu" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

case "$FAKE_QEMU_SCENARIO" in
    marker-running)
        sleep 60 &
        echo "$!" >"$FAKE_CHILD_PID_FILE"
        printf '%s\n' "$FAKE_MARKER"
        printf '%s\n' "$FAKE_REQUIRED_TEXT"
        while true; do sleep 1; done
        ;;
    no-marker)
        printf '%s\n' '[OS_DEMO] lab=lab7 step=start'
        while true; do sleep 1; done
        ;;
    fail)
        printf '%s\n' 'fake QEMU failed' >&2
        exit 7
        ;;
    marker-then-fail)
        printf '%s\n' "$FAKE_MARKER"
        printf '%s\n' "$FAKE_REQUIRED_TEXT"
        exit 7
        ;;
    incomplete)
        printf '%s\n' "$FAKE_REQUIRED_TEXT"
        while true; do sleep 1; done
        ;;
    marker-without-require)
        printf '%s\n' "$FAKE_MARKER"
        while true; do sleep 1; done
        ;;
    unicode)
        printf '%s\n' "$FAKE_MARKER"
        printf '%s\n' "$FAKE_REQUIRED_TEXT"
        while true; do sleep 1; done
        ;;
    *)
        echo "Unknown fake QEMU scenario: $FAKE_QEMU_SCENARIO" >&2
        exit 2
        ;;
esac
EOF

chmod +x "$fake_bin/cargo" "$fake_bin/fake-qemu"

run_case() {
    local case_name="$1"
    local expected_status="$2"
    local scenario="$3"
    local mode="$4"
    local marker="$5"
    local required="$6"
    local stdbuf_command="${7:-stdbuf}"
    local log="$tmp/$case_name.log"
    local output="$tmp/$case_name.output"
    local errors="$tmp/$case_name.errors"
    local child_pid_file="$tmp/$case_name.child.pid"
    local status
    local args=(--name "$case_name" --marker "$marker" --mode "$mode" --log "$log")

    if [[ -n "$required" ]]; then
        args+=(--require "$required")
    fi

    set +e
    PATH="$fake_bin:$PATH" \
        CARGO_TARGET_DIR="$fake_target" \
        FAKE_KERNEL_PATH="$fake_target/riscv64gc-unknown-none-elf/debug/ai-os-kernel" \
        QEMU="$fake_bin/fake-qemu" \
        QEMU_STDBUF_COMMAND="$stdbuf_command" \
        QEMU_TIMEOUT_SECONDS=2 \
        FAKE_QEMU_SCENARIO="$scenario" \
        FAKE_MARKER="$marker" \
        FAKE_REQUIRED_TEXT="$required" \
        FAKE_CHILD_PID_FILE="$child_pid_file" \
        bash "$script" "${args[@]}" >"$output" 2>"$errors"
    status=$?
    set -e

    if [[ "$status" -ne "$expected_status" ]]; then
        echo "$case_name returned $status, expected $expected_status" >&2
        cat "$output" "$errors" >&2
        exit 1
    fi

    if [[ -f "$child_pid_file" ]]; then
        local child_pid
        child_pid="$(cat "$child_pid_file")"
        sleep 0.1
        if kill -0 "$child_pid" 2>/dev/null; then
            echo "$case_name left child process $child_pid running" >&2
            exit 1
        fi
    fi
}

run_case marker-cleanup 0 marker-running solution '[Lab7] PASS' '[OS_DEMO] lab=lab7 step=file-close'
grep -Fq -- '[Lab7] PASS' "$tmp/marker-cleanup.log"
grep -Fq -- '[OS_DEMO] lab=lab7 step=file-close' "$tmp/marker-cleanup.log"

run_case timeout-without-marker 1 no-marker solution '[Lab7] PASS' ''
grep -Fq -- 'timed out' "$tmp/timeout-without-marker.errors"

run_case direct-failure 1 fail solution '[Lab7] PASS' ''
grep -Fq -- 'exited with code 7' "$tmp/direct-failure.errors"

set +e
PATH="$fake_bin:$PATH" \
    CARGO_TARGET_DIR="$fake_target" \
    FAKE_KERNEL_PATH="$fake_target/riscv64gc-unknown-none-elf/debug/ai-os-kernel" \
    FAKE_CARGO_FAIL=1 \
    QEMU="$fake_bin/fake-qemu" \
    bash "$script" --name build-failure --marker '[Lab7] PASS' --log "$tmp/build failure.log" \
    >"$tmp/build-failure.output" 2>"$tmp/build-failure.errors"
build_failure_status=$?
set -e
if [[ "$build_failure_status" -eq 0 ]]; then
    echo "build failure was incorrectly accepted" >&2
    exit 1
fi

run_case marker-does-not-hide-failure 1 marker-then-fail solution '[Lab7] PASS' '[OS_DEMO] lab=lab7 step=file-close'
grep -Fq -- 'exited with code 7' "$tmp/marker-does-not-hide-failure.errors"

run_case expected-incomplete 0 incomplete expect-incomplete '[Lab7] PASS' '[Lab7] TODO: implement memory file system'
grep -Fq -- 'starter incomplete test passed' "$tmp/expected-incomplete.output"

run_case missing-requirement 1 marker-without-require solution '[Lab7] PASS' '[OS_DEMO] lab=lab7 step=file-close'
grep -Fq -- 'Expected QEMU text was not found' "$tmp/missing-requirement.errors"

run_case unicode-and-special 0 unicode solution '[实验] 完成 ✓ [a*b] $value' '证据：串口 [x]* ?'
grep -Fq -- '[实验] 完成 ✓ [a*b] $value' "$tmp/unicode-and-special.log"

run_case no-stdbuf-fallback 0 marker-running solution '[Lab7] PASS' '[OS_DEMO] lab=lab7 step=file-close' missing-stdbuf
grep -Fq -- 'stdbuf is unavailable' "$tmp/no-stdbuf-fallback.errors"

echo "test-qemu.sh behavior tests passed."
