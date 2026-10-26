$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'phase2-instance.ps1')
$paths = Get-Phase2Paths
$owned = Assert-Phase2Process $paths
# A shutdown command closes only the freshly verified instance; never kill by stale PID.
$shutdownInfo = New-Object System.Diagnostics.ProcessStartInfo
$shutdownInfo.FileName = (Get-Command node.exe -ErrorAction Stop).Source
$shutdownInfo.Arguments = '"' + (Join-Path $paths.root 'scripts\mongo-maintenance.mjs') + '" shutdown'
$shutdownInfo.UseShellExecute = $false
$shutdownInfo.WorkingDirectory = $paths.root
$shutdownInfo.CreateNoWindow = $true
$shutdownInfo.RedirectStandardOutput = $true
$shutdownInfo.RedirectStandardError = $true
$shutdownProcess = New-Object System.Diagnostics.Process
$shutdownProcess.StartInfo = $shutdownInfo
$shutdownProcess.Start() | Out-Null
$shutdownStdout = $shutdownProcess.StandardOutput.ReadToEndAsync()
$shutdownStderr = $shutdownProcess.StandardError.ReadToEndAsync()
if (!$shutdownProcess.WaitForExit(30000)) { $shutdownProcess.Kill(); throw 'Shutdown client timed out; recheck the owned instance state.' }
$shutdownOutput = $shutdownStdout.Result + $shutdownStderr.Result
$shutdownExit = $shutdownProcess.ExitCode
for ($attempt=0; $attempt -lt 40; $attempt++) {
  if (@(Get-Phase2Listener).Count -eq 0 -and !(Get-Process -Id $owned.processId -ErrorAction SilentlyContinue)) { break }
  Start-Sleep -Milliseconds 250
}
if (@(Get-Phase2Listener).Count -gt 0 -or (Get-Process -Id $owned.processId -ErrorAction SilentlyContinue)) { throw 'Owned MongoDB did not stop; no process was force-killed.' }
if ($shutdownExit -ne 0 -and (($shutdownOutput | Out-String) -notmatch 'MongoNetworkError.*(ECONNRESET|closed)')) { throw 'Unexpected shutdown command error; inspect the dedicated log.' }
Write-Host ('Owned P2 MongoDB stopped; verified pid exit and port 27019 closed. maintenance client exit=' + $shutdownExit + '; a shutdown connection reset is accepted only after both checks. Data retained in ' + $paths.directory)
