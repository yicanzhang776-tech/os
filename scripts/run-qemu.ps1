$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$kernel = Join-Path $repo "target/riscv64gc-unknown-none-elf/debug/ai-os-kernel"
$qemu = "qemu-system-riscv64"

Push-Location $repo
try {
    cargo build -p ai-os-kernel
    & $qemu -machine virt -nographic -bios default -kernel $kernel
}
finally {
    Pop-Location
}
