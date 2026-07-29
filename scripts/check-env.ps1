$ErrorActionPreference = "Stop"

$requiredTarget = "riscv64gc-unknown-none-elf"
$failed = $false

function Test-Command {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Hint
    )

    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $cmd) {
        Write-Error "Missing dependency: $Name. $Hint"
        $script:failed = $true
        return $false
    }

    Write-Output "found ${Name}: $($cmd.Source)"
    return $true
}

$hasRustc = Test-Command "rustc" "Install Rust via rustup."
$hasCargo = Test-Command "cargo" "Install Rust via rustup."
$hasRustup = Test-Command "rustup" "Install rustup."
$hasQemu = Test-Command "qemu-system-riscv64" "Install QEMU with RISC-V system emulator support."

if ($hasRustc) {
    rustc --version
}
if ($hasCargo) {
    cargo --version
}
if ($hasRustup) {
    rustup --version
    $targets = rustup target list --installed
    if ($targets -contains $requiredTarget) {
        Write-Output "found Rust target: $requiredTarget"
    }
    else {
        Write-Error "Missing Rust target: $requiredTarget. Run: rustup target add $requiredTarget"
        $failed = $true
    }
}
if ($hasQemu) {
    qemu-system-riscv64 --version
}

$make = Get-Command "make" -ErrorAction SilentlyContinue
if ($null -eq $make) {
    Write-Warning "make was not found. PowerShell scripts can still build and test P0 directly."
}
else {
    Write-Output "found make: $($make.Source)"
}

if ($failed) {
    exit 1
}

Write-Output "P0 environment check passed."
