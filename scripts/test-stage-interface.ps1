param()

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot

foreach ($lab in 1..7) {
    $script = Join-Path $repo "scripts/test-lab$lab.ps1"
    $ErrorActionPreference = "Continue"
    $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $script -Stage 1 -ExpectIncomplete 2>&1 | Out-String
    $ErrorActionPreference = "Stop"

    if ($LASTEXITCODE -eq 0) {
        throw "Lab$lab unexpectedly accepted -Stage together with -ExpectIncomplete."
    }

    if ($output -notmatch "Use either -ExpectIncomplete or -Stage, not both") {
        throw "Lab$lab did not report the expected mutually exclusive parameter error.`n$output"
    }
}

Write-Output "Lab1-Lab7 Stage parameter interface test passed."
