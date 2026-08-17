[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8888,
    [switch]$NoBrowser,
    [switch]$ServeOnly,
    [switch]$DesktopPet
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

$desktopPetDir = Join-Path $repo "desktop/kernel-buddy"
$electron = Join-Path $desktopPetDir "node_modules/.bin/electron.cmd"
if ($DesktopPet) {
    $nodeVersion = [version](& $node.Source -p "process.versions.node")
    if ($nodeVersion -lt [version]"22.12.0") {
        throw "The optional desktop pet requires Node.js 22.12 or newer; found $nodeVersion. The browser-only demo can still use Node.js 18+."
    }
    $lockFile = Join-Path $desktopPetDir "package-lock.json"
    if (-not (Test-Path $lockFile)) {
        throw "Desktop pet lockfile not found: $lockFile"
    }
    if (-not (Test-Path $electron)) {
        $npm = Get-Command npm -ErrorAction SilentlyContinue
        if ($null -eq $npm) {
            throw "Installing the optional desktop pet requires npm. Install a Node.js distribution that includes npm, then run again."
        }
        Write-Host "Installing the locked desktop pet dependency with npm ci..."
        & $npm.Source ci --prefix $desktopPetDir --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            throw "Desktop pet dependency installation failed. Check npm network/proxy settings, then retry."
        }
    }
    & $electron --version | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Electron 43.2.0 could not download its Windows runtime. Check npm/Electron proxy access, remove desktop/kernel-buddy/node_modules, then retry."
    }
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

$serverArgs = @($server, "--port", [string]$Port)
if (-not $ServeOnly) {
    $serverArgs += "--run"
}

Push-Location $repo
try {
    if (-not $DesktopPet) {
        if (-not $NoBrowser) {
            Start-Process $url
        }
        & $node.Source @serverArgs
        return
    }

    $serverProcess = Start-Process -FilePath $node.Source -ArgumentList $serverArgs -WorkingDirectory $repo -WindowStyle Hidden -PassThru
    $petProcess = $null
    try {
        $healthy = $false
        for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
            if ($serverProcess.HasExited) {
                throw "The local bridge exited before becoming ready."
            }
            try {
                $health = Invoke-RestMethod -Uri "$url/health" -TimeoutSec 1
                if ($health.ok) { $healthy = $true; break }
            }
            catch {
                Start-Sleep -Milliseconds 250
            }
        }
        if (-not $healthy) {
            throw "The local bridge did not become ready at $url. Check whether the port is already in use."
        }
        if (-not $NoBrowser) {
            Start-Process $url
        }
        $petProcess = Start-Process -FilePath $electron -ArgumentList @(".", "--bridge-origin", $url) -WorkingDirectory $desktopPetDir -WindowStyle Hidden -PassThru
        Start-Sleep -Milliseconds 800
        if ($petProcess.HasExited) {
            throw "The desktop pet exited during startup. Run npm start in desktop/kernel-buddy to inspect the platform error."
        }
        Write-Host "Kernel Buddy desktop companion is active. Use its tray menu to hide or exit it."
        Wait-Process -Id $serverProcess.Id
    }
    finally {
        if ($null -ne $petProcess -and -not $petProcess.HasExited) {
            Stop-Process -Id $petProcess.Id -Force -ErrorAction SilentlyContinue
        }
        if ($null -ne $serverProcess -and -not $serverProcess.HasExited) {
            Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
        }
    }
}
finally {
    Pop-Location
}
