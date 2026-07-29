[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 4173,
    [switch]$NoBrowser,
    [switch]$ServeOnly
)

$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$node = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $node) {
    throw "Node.js is required for the live demo bridge. Install Node.js, then run this script again."
}

$server = Join-Path $repo "docs/interactive-demo/server.js"
if (-not (Test-Path $server)) {
    throw "Live demo server not found: $server"
}

$url = "http://127.0.0.1:$Port"
$branch = (& git -C $repo rev-parse --abbrev-ref HEAD 2>$null)
if ([string]::IsNullOrWhiteSpace($branch)) {
    $branch = "unknown"
}

Write-Host "OS learning map: $url"
Write-Host "Tracking Git branch: $branch"
if ($ServeOnly) {
    Write-Host "The bridge will stay active while you switch branches. Run the current branch from the page."
}
else {
    Write-Host "The current branch will be built and launched immediately."
}

if (-not $NoBrowser) {
    Start-Process $url
}

$serverArgs = @($server, "--port", [string]$Port)
if (-not $ServeOnly) {
    $serverArgs += "--run"
}

Push-Location $repo
try {
    & $node.Source @serverArgs
}
finally {
    Pop-Location
}
