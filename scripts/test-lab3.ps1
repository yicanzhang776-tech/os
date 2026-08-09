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
$log = Join-Path $repo "target/qemu-lab3.log"
$errLog = Join-Path $repo "target/qemu-lab3.err.log"
$timeoutSeconds = 20

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
            throw "Expected marker '$marker' after previous Lab3 marker."
        }
        $position = $next
    }
}

if ($ExpectIncomplete) {
    if ($output -match "\[Lab3\] PASS") {
        throw "Unexpected Lab3 success marker [Lab3] PASS was found in starter output."
    }
    Assert-Contains $output "\[Lab2\] PASS" "Lab2 regression marker was not found."
    Assert-Contains $output "\[Lab3\] start" "Lab3 start marker was not found."
    if ($output -notmatch "TODO\(LAB3-|Lab3.*TODO") {
        throw "Expected Lab3 starter TODO output was not found in QEMU output."
    }
    Write-Output "Lab3 QEMU starter incomplete test passed."
}
else {
    $stage1Markers = @("[Lab3-T1] address types ready", "[Lab3-T1] PASS")
    $stage2Markers = $stage1Markers + @("[Lab3-T2] allocator can allocate", "[Lab3-T2] PASS")
    $stage3Markers = $stage2Markers + @("[Lab3] frame allocator ready", "[Lab3] PASS")

    if ($Stage -eq 1) {
        foreach ($marker in $stage1Markers) {
            Assert-Contains $output ([regex]::Escape($marker)) "Expected Stage 1 marker '$marker' was not found."
        }
        Assert-Ordered $output $stage1Markers
        Write-Output "Lab3 Stage 1 test passed."
    }
    elseif ($Stage -eq 2) {
        foreach ($marker in $stage2Markers) {
            Assert-Contains $output ([regex]::Escape($marker)) "Expected Stage 2 marker '$marker' was not found."
        }
        Assert-Ordered $output $stage2Markers
        Write-Output "Lab3 Stage 2 test passed."
    }
    else {
        foreach ($marker in $stage3Markers) {
            Assert-Contains $output ([regex]::Escape($marker)) "Expected Stage 3 marker '$marker' was not found."
        }
        Assert-Ordered $output $stage3Markers
        if ($output -match "\[Lab3.*TODO") {
            throw "Lab3 final output still contains a TODO marker."
        }
        Write-Output "Lab3 Stage 3 test passed."
    }
}
