param(
    [int]$Stage = 3,
    [switch]$ExpectIncomplete
)

$ErrorActionPreference = "Stop"

if ($Stage -lt 1 -or $Stage -gt 3) {
    throw "Stage must be 1, 2, or 3."
}

if ($ExpectIncomplete -and $PSBoundParameters.ContainsKey("Stage")) {
    throw "Use either -ExpectIncomplete or -Stage, not both."
}

$repo = Split-Path -Parent $PSScriptRoot
$kernel = Join-Path $repo "target/riscv64gc-unknown-none-elf/debug/ai-os-kernel"
$qemu = "qemu-system-riscv64"
$log = Join-Path $repo "target/qemu-lab6.log"
$errLog = Join-Path $repo "target/qemu-lab6.err.log"
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

function Assert-Contains {
    param(
        [string]$Text,
        [string]$Pattern,
        [string]$Message
    )
    if ($Text -notmatch $Pattern) {
        throw $Message
    }
}

function Assert-Ordered {
    param(
        [string]$Text,
        [string[]]$Markers
    )
    $position = -1
    foreach ($marker in $Markers) {
        $next = $Text.IndexOf($marker, [Math]::Max($position + 1, 0), [StringComparison]::Ordinal)
        if ($next -lt 0) {
            throw "Expected marker '$marker' after previous Lab6 marker."
        }
        $position = $next
    }
}

Assert-Contains $output "\[Lab5\] PASS" "Expected Lab5 success marker [Lab5] PASS was not found in QEMU output."
Assert-Contains $output "\[Lab6\] start" "Expected Lab6 start marker was not found in QEMU output."

if ($ExpectIncomplete) {
    if ($output -match "\[Lab6\] PASS") {
        throw "Unexpected Lab6 success marker [Lab6] PASS was found in starter output."
    }
    foreach ($marker in @(
        "\[Lab6-T1\] TODO: implement user context boundary",
        "\[Lab6-T2\] TODO: implement syscall ABI dispatch",
        "\[Lab6\] user runtime initialized",
        "\[Lab6\] TODO: implement user mode and syscalls"
    )) {
        Assert-Contains $output $marker "Expected Lab6 starter marker $marker was not found in QEMU output."
    }
    Write-Output "Lab6 QEMU starter incomplete test passed."
}
else {
    $stage1Markers = @("[Lab6-T1] user context ready", "[Lab6-T1] PASS")
    $stage2Markers = $stage1Markers + @("[Lab6-T2] syscall ABI ready", "[Lab6-T2] PASS")
    $stage3Markers = $stage2Markers + @(
        "[Lab6] user program: hello",
        "[Lab6] syscall write handled",
        "[Lab6] syscall exit handled",
        "[Lab6] PASS"
    )

    if ($Stage -eq 1) {
        foreach ($marker in $stage1Markers) {
            Assert-Contains $output ([regex]::Escape($marker)) "Expected Stage 1 marker '$marker' was not found."
        }
        Assert-Ordered $output $stage1Markers
        Write-Output "Lab6 Stage 1 test passed."
    }
    elseif ($Stage -eq 2) {
        foreach ($marker in $stage2Markers) {
            Assert-Contains $output ([regex]::Escape($marker)) "Expected Stage 2 marker '$marker' was not found."
        }
        Assert-Ordered $output $stage2Markers
        Write-Output "Lab6 Stage 2 test passed."
    }
    else {
        foreach ($marker in $stage3Markers) {
            Assert-Contains $output ([regex]::Escape($marker)) "Expected Stage 3 marker '$marker' was not found."
        }
        Assert-Ordered $output $stage3Markers
        if ($output -match "\[Lab6.*TODO") {
            throw "Lab6 final output still contains a TODO marker."
        }
        Write-Output "Lab6 Stage 3 test passed."
    }
}
