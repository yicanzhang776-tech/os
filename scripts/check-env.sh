#!/usr/bin/env sh
set -eu

REQUIRED_TARGET="riscv64gc-unknown-none-elf"
FAILED=0

check_command() {
    name="$1"
    hint="$2"
    if command -v "$name" >/dev/null 2>&1; then
        printf 'found %s: %s\n' "$name" "$(command -v "$name")"
    else
        printf 'Missing dependency: %s. %s\n' "$name" "$hint" >&2
        FAILED=1
    fi
}

check_command rustc "Install Rust via rustup."
check_command cargo "Install Rust via rustup."
check_command rustup "Install rustup."
check_command qemu-system-riscv64 "Install QEMU with RISC-V system emulator support."

if command -v rustc >/dev/null 2>&1; then
    rustc --version
fi
if command -v cargo >/dev/null 2>&1; then
    cargo --version
fi
if command -v rustup >/dev/null 2>&1; then
    rustup --version
    if rustup target list --installed | grep -qx "$REQUIRED_TARGET"; then
        printf 'found Rust target: %s\n' "$REQUIRED_TARGET"
    else
        printf 'Missing Rust target: %s. Run: rustup target add %s\n' "$REQUIRED_TARGET" "$REQUIRED_TARGET" >&2
        FAILED=1
    fi
fi
if command -v qemu-system-riscv64 >/dev/null 2>&1; then
    qemu-system-riscv64 --version
fi

if command -v make >/dev/null 2>&1; then
    printf 'found make: %s\n' "$(command -v make)"
else
    printf 'Warning: make was not found. Shell scripts can still build and test P0 directly.\n' >&2
fi

if [ "$FAILED" -ne 0 ]; then
    exit 1
fi

printf 'P0 environment check passed.\n'
