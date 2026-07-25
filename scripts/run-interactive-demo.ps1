[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 4173,
    [switch]$NoBrowser
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
if (-not $NoBrowser) {
    Start-Process $url
}

Push-Location $repo
try {
    & $node.Source $server --run --port $Port
}
finally {
    Pop-Location
}
