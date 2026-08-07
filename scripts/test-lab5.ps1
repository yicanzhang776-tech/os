param(
    [switch]$ExpectIncomplete
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$kernel = Join-Path $repo "target/riscv64gc-unknown-none-elf/debug/ai-os-kernel"
$qemu = "qemu-system-riscv64"
$log = Join-Path $repo "target/qemu-lab5.log"
$errLog = Join-Path $repo "target/qemu-lab5.err.log"
$timeoutSeconds = 20

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $log) | Out-Null
Remove-Item -LiteralPath $log -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $errLog -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $kernel -ErrorAction SilentlyContinue

Push-Location $repo
$buildExitCode = $null
try {
    cargo build -p ai-os-kernel
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

if ($output -notmatch "\[Lab4\] PASS") {
    throw "Expected Lab4 success marker [Lab4] PASS was not found in QEMU output."
}

if ($ExpectIncomplete) {
    if ($output -match "\[Lab5\] PASS") {
        throw "Unexpected Lab5 success marker [Lab5] PASS was found in starter output."
    }
    foreach ($marker in @(
        "\[Lab5\] start",
        "\[Lab5\] scheduler initialized",
        "\[Lab5\] TODO: implement cooperative scheduler"
    )) {
        if ($output -notmatch $marker) {
            throw "Expected Lab5 starter marker $marker was not found in QEMU output."
        }
    }
    Write-Output "Lab5 QEMU starter incomplete test passed."
}
else {
    foreach ($marker in @(
        "\[Lab5\] task A step 1",
        "\[Lab5\] task B step 1",
        "\[Lab5\] task C step 1",
        "\[Lab5\] task A step 2",
        "\[Lab5\] task B step 2",
        "\[Lab5\] task C step 2",
        "\[Lab5\] scheduler finished",
        "\[Lab5\] PASS"
    )) {
        if ($output -notmatch $marker) {
            throw "Expected Lab5 solution marker $marker was not found in QEMU output."
        }
    }
    Write-Output "Lab5 QEMU smoke test passed."
}
