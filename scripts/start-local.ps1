[CmdletBinding()]
param(
    [string]$RuntimeRoot = '',
    [switch]$RestartBackend
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $RuntimeRoot) { $RuntimeRoot = Join-Path $projectRoot '.localtools\personalab' }
$runtime = [System.IO.Path]::GetFullPath($RuntimeRoot)
$python = Join-Path $runtime 'venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw "Python runtime not found: $python" }
$logRoot = Join-Path $runtime 'logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
function Test-LocalPort([int]$Port) {
    $client = New-Object System.Net.Sockets.TcpClient
    try { $pending = $client.BeginConnect('127.0.0.1', $Port, $null, $null); if (-not $pending.AsyncWaitHandle.WaitOne(500)) { return $false }; $client.EndConnect($pending); return $true } catch { return $false } finally { $client.Dispose() }
}
function Wait-LocalPort([int]$Port) {
    for ($attempt = 0; $attempt -lt 100; $attempt++) { if (Test-LocalPort $Port) { return }; Start-Sleep -Milliseconds 200 }
    throw "Service did not start on port $Port. Check $logRoot"
}
$backendPidFile = Join-Path $runtime 'backend.pid'
if ($RestartBackend -and (Test-Path -LiteralPath $backendPidFile)) {
    $ownedPid = [int]([System.IO.File]::ReadAllText($backendPidFile).Trim())
    $ownedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $ownedPid" -ErrorAction SilentlyContinue
    if (-not $ownedProcess -and (Test-LocalPort 8000)) {
        $managedPythonRoot = (Join-Path $runtime 'python') + '\'
        $candidates = @(Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($managedPythonRoot, [System.StringComparison]::OrdinalIgnoreCase) -and $_.CommandLine -match 'uvicorn app\.main:app' -and $_.CommandLine -match '--port 8000' })
        if ($candidates.Count -ne 1) { throw 'Cannot uniquely identify the owned backend process.' }
        $ownedProcess = $candidates[0]
        $ownedPid = [int]$ownedProcess.ProcessId
        [System.IO.File]::WriteAllText($backendPidFile, [string]$ownedPid)
    }
    if ($ownedProcess) {
        $managedPythonRoot = (Join-Path $runtime 'python') + '\'
        $ownsExecutable = $ownedProcess.ExecutablePath -eq $python -or $ownedProcess.ExecutablePath.StartsWith($managedPythonRoot, [System.StringComparison]::OrdinalIgnoreCase)
        if (-not $ownsExecutable -or $ownedProcess.CommandLine -notmatch 'uvicorn app\.main:app' -or $ownedProcess.CommandLine -notmatch '--port 8000') { throw 'PID file does not identify the PersonaLab backend; refusing to stop it.' }
        Stop-Process -Id $ownedPid
        Start-Sleep -Milliseconds 500
    }
}
if (-not (Test-LocalPort 55432)) {
    Start-Process -FilePath 'node.exe' -ArgumentList @('start.mjs') -WorkingDirectory (Join-Path $runtime 'postgres-runtime') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'postgres.log') -RedirectStandardError (Join-Path $logRoot 'postgres-error.log') | Out-Null
    Wait-LocalPort 55432
}
$env:PYTHONUTF8 = '1'
$env:LOCAL_TOOLS_ENABLED = 'true'
$env:HF_HOME = Join-Path $runtime 'hf-cache'
if (-not (Test-LocalPort 8000)) {
    Push-Location -LiteralPath (Join-Path $projectRoot 'backend')
    try { & $python -m alembic upgrade head; if ($LASTEXITCODE -ne 0) { throw 'DB migration failed.' } } finally { Pop-Location }
    $backendProcess = Start-Process -FilePath $python -ArgumentList @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8000') -WorkingDirectory (Join-Path $projectRoot 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logRoot 'backend.log') -RedirectStandardError (Join-Path $logRoot 'backend-error.log')
    Wait-LocalPort 8000
    $managedPythonRoot = (Join-Path $runtime 'python') + '\'
    $candidates = @(Get-CimInstance Win32_Process -Filter "Name = 'python.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($managedPythonRoot, [System.StringComparison]::OrdinalIgnoreCase) -and $_.CommandLine -match 'uvicorn app\.main:app' -and $_.CommandLine -match '--port 8000' })
    if ($candidates.Count -eq 1) { [System.IO.File]::WriteAllText($backendPidFile, [string]$candidates[0].ProcessId) }
}
if (-not (Test-LocalPort 5173)) {
    $frontendRoot = Join-Path $projectRoot 'frontend'
    Start-Process -FilePath 'node.exe' -ArgumentList @((Join-Path $frontendRoot 'node_modules\vite\bin\vite.js'),'--host','127.0.0.1','--port','5173','--strictPort') -WorkingDirectory $frontendRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logRoot 'frontend.log') -RedirectStandardError (Join-Path $logRoot 'frontend-error.log') | Out-Null
    Wait-LocalPort 5173
}
$ready = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/capabilities' -TimeoutSec 10
Write-Output ('Local backend ready; persona library: ' + $ready.library_count)
Write-Output 'PersonaLab: http://127.0.0.1:5173/#landing'
Write-Output 'API docs: http://127.0.0.1:8000/docs'
Write-Output ('Logs: ' + $logRoot)
