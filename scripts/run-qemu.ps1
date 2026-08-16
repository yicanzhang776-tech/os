$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$kernel = Join-Path $repo "target/riscv64gc-unknown-none-elf/debug/ai-os-kernel"
$qemu = "qemu-system-riscv64"

Push-Location $repo
$buildExitCode = $null
try {
    Remove-Item -LiteralPath $kernel -ErrorAction SilentlyContinue
    cargo build -p ai-os-kernel
    $buildExitCode = $LASTEXITCODE
    if ($buildExitCode -ne 0) {
        throw "cargo build failed with exit code $buildExitCode. QEMU was not started."
    }
    if (-not (Test-Path $kernel)) {
        throw "Kernel ELF not found after build: $kernel"
    }
    & $qemu -machine virt -nographic -bios default -kernel $kernel
}
finally {
    Pop-Location
}
