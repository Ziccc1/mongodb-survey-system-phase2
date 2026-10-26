$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'phase2-instance.ps1')
$paths = Get-Phase2Paths
Set-Location -LiteralPath $paths.root
$listeners = @(Get-Phase2Listener)
if ($listeners.Count -gt 0) {
  $owned = Assert-Phase2Process $paths
  Write-Host ('Recognized P2 MongoDB pid ' + $owned.processId + ' on localhost:27019.')
} else {
  Assert-Phase2DataDirectory $paths
  New-Item -ItemType Directory -Path $paths.directory -Force | Out-Null
  if (!(Test-Path -LiteralPath $paths.marker)) {
    @{ kind='phase2-runtime-v1'; projectRoot=$paths.root; port=27019; replicaSet='rs0' } | ConvertTo-Json | Set-Content -LiteralPath $paths.marker -Encoding UTF8
  }
  Assert-Phase2Marker $paths
  $mongodExe = (Get-Command mongod.exe -ErrorAction Stop).Source
  $logPath = Join-Path $paths.directory 'mongod.log'
  $mongoArguments = @('--dbpath', ('"'+$paths.directory+'"'), '--replSet', 'rs0', '--bind_ip', 'localhost', '--port', '27019', '--logpath', ('"'+$logPath+'"'), '--logappend')
  $securityKey = Join-Path $paths.root '.local\security\mongodb-keyfile'
  if (Test-Path -LiteralPath $securityKey) { $mongoArguments += @('--auth', '--keyFile', ('"'+$securityKey+'"')) }
  $started = Start-Process -FilePath $mongodExe -ArgumentList $mongoArguments -WindowStyle Hidden -PassThru
  for ($attempt=0; $attempt -lt 30; $attempt++) {
    if ($started.HasExited) { throw 'P2 MongoDB exited; inspect its dedicated log.' }
    if (@(Get-Phase2Listener).Count -gt 0) { break }
    Start-Sleep -Milliseconds 500
  }
  $owned = Assert-Phase2Process $paths
  if ($owned.processId -ne $started.Id) { throw 'Listener is not the process just started; refusing replica initialization.' }
  Write-Host ('Started dedicated P2 MongoDB pid ' + $owned.processId + ' in ' + $paths.directory)
}
node --import tsx scripts/init-replica.ts
if ($LASTEXITCODE -ne 0) { throw 'P2 replica setup failed; no reconfiguration was attempted.' }
