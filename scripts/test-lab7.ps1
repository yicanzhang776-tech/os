param(
    [ValidateSet(1, 2, 3)]
    [int]$Stage = 3,
    [switch]$ExpectIncomplete
)

$ErrorActionPreference = "Stop"

if ($ExpectIncomplete -and $PSBoundParameters.ContainsKey("Stage")) {
    throw "Use either -ExpectIncomplete or -Stage, not both."
}

$repo = Split-Path -Parent $PSScriptRoot
$kernel = Join-Path $repo "target/riscv64gc-unknown-none-elf/debug/ai-os-kernel"
$qemu = "qemu-system-riscv64"
$log = Join-Path $repo "target/qemu-lab7.log"
$errLog = Join-Path $repo "target/qemu-lab7.err.log"
$timeoutSeconds = 20

function Assert-Marker {
    param(
        [string]$Output,
        [string]$Marker
    )
    if ($Output -notmatch [regex]::Escape($Marker)) {
        throw "Expected marker '$Marker' was not found in QEMU output."
    }
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $log) | Out-Null
Remove-Item -LiteralPath $log -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $errLog -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $kernel -ErrorAction SilentlyContinue

Push-Location $repo
$buildExitCode = $null
try {
    cargo build -p ai-os-kernel --target riscv64gc-unknown-none-elf
    $buildExitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

if ($buildExitCode -ne 0) {
    throw "cargo build failed with exit code $buildExitCode. QEMU was not started."
}

if (-not (Test-Path $kernel)) {
    throw "Kernel ELF not found after build: $kernel"
}

$arguments = @("-machine", "virt", "-nographic", "-bios", "default", "-kernel", $kernel)
$processInfo = New-Object System.Diagnostics.ProcessStartInfo
$processInfo.FileName = $qemu
$processInfo.Arguments = ($arguments -join " ")
$processInfo.UseShellExecute = $false
$processInfo.RedirectStandardOutput = $true
$processInfo.RedirectStandardError = $true
$processInfo.CreateNoWindow = $true

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $processInfo

[void]$process.Start()
$stdoutTask = $process.StandardOutput.ReadToEndAsync()
$stderrTask = $process.StandardError.ReadToEndAsync()

$exited = $process.WaitForExit($timeoutSeconds * 1000)
if (-not $exited) {
    try {
        $process.Kill()
    }
    catch {
        Write-Warning "Failed to kill timed-out QEMU process: $_"
    }
    throw "QEMU timed out after $timeoutSeconds seconds."
}

$process.WaitForExit()
$stdout = $stdoutTask.Result
$stderr = $stderrTask.Result
$stdout | Set-Content -LiteralPath $log -Encoding UTF8
$stderr | Set-Content -LiteralPath $errLog -Encoding UTF8
$output = $stdout + $stderr

Write-Output $output

if ($process.ExitCode -ne 0) {
    throw "QEMU exited with code $($process.ExitCode)."
}

Assert-Marker $output "[Lab6] PASS"
Assert-Marker $output "[Lab7] start"

if ($ExpectIncomplete) {
    if ($output -match "\[Lab7\] PASS") {
        throw "Unexpected Lab7 success marker [Lab7] PASS was found in starter output."
    }
    Assert-Marker $output "[Lab7-T1] TODO: implement RAM byte device"
    Assert-Marker $output "[Lab7-T2] TODO: implement simple file system"
    Assert-Marker $output "[Lab7] TODO: implement memory file system"
    Write-Output "Lab7 starter incomplete test passed."
    exit 0
}

if ($Stage -ge 1) {
    Assert-Marker $output "[Lab7] start"
}
if ($Stage -ge 2) {
    Assert-Marker $output "[Lab7] file opened"
    Assert-Marker $output "[OS_DEMO] lab=lab7 step=file-write"
    Assert-Marker $output "[OS_DEMO] lab=lab7 step=file-read"
}
if ($Stage -ge 3) {
    Assert-Marker $output "[Lab7] file opened"
    Assert-Marker $output "[Lab7] write/read verified"
    Assert-Marker $output "[Lab7] PASS"
}

Write-Output "Lab7 Stage $Stage test passed."
