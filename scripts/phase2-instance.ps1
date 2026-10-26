$ErrorActionPreference = 'Stop'
function Get-Phase2Paths {
  $projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
  $directory = Join-Path $projectRoot '.local\mongodb-phase2-rs0'
  foreach ($candidate in @($projectRoot, (Join-Path $projectRoot '.local'), $directory)) {
    if ((Test-Path -LiteralPath $candidate) -and ((Get-Item -LiteralPath $candidate -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Refusing a linked P2 instance directory.' }
  }
  return @{ root=$projectRoot; directory=$directory; marker=(Join-Path $directory 'project2-instance.json') }
}
function Assert-Phase2Marker($paths) {
  if (!(Test-Path -LiteralPath $paths.marker)) { throw 'Missing P2 ownership marker; refusing connection or process changes.' }
  $data = Get-Content -LiteralPath $paths.marker -Raw | ConvertFrom-Json
  if ($data.kind -ne 'phase2-runtime-v1' -or $data.projectRoot -ne $paths.root -or $data.port -ne 27019 -or $data.replicaSet -ne 'rs0' -or @($data.PSObject.Properties).Count -ne 4) { throw 'P2 instance marker mismatch; left unchanged.' }
}
function Get-Phase2Listener {
  # Inventory failure is an error, never interpreted as an idle port.
  return @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -eq 27019 })
}
function Assert-Phase2DataDirectory($paths) {
  if (Test-Path -LiteralPath $paths.directory) {
    if (Test-Path -LiteralPath $paths.marker) { Assert-Phase2Marker $paths }
    elseif (Get-ChildItem -LiteralPath $paths.directory -Force | Select-Object -First 1) { throw 'Refusing unknown nonempty P2 directory; no data changed.' }
  }
}
function Assert-Phase2Process($paths) {
  Assert-Phase2Marker $paths
  $listeners = @(Get-Phase2Listener)
  if ($listeners.Count -eq 0) { throw 'P2 MongoDB is not listening on 27019.' }
  $ids = @($listeners.OwningProcess | Select-Object -Unique)
  if ($ids.Count -ne 1) { throw 'Ambiguous P2 listener ownership.' }
  $info = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $ids[0]) -ErrorAction Stop
  $escapedDirectory = [regex]::Escape($paths.directory)
  if (!$info -or $info.Name -ne 'mongod.exe' -or !$info.CommandLine -or
    $info.CommandLine -notmatch ('--dbpath\s+(?:"' + $escapedDirectory + '"|' + $escapedDirectory + ')(?:\s|$)') -or
    $info.CommandLine -notmatch '--port\s+27019(?:\s|$)' -or
    $info.CommandLine -notmatch '--replSet\s+rs0(?:\s|$)' -or
    $info.CommandLine -notmatch '--bind_ip\s+localhost(?:\s|$)') { throw 'Unrecognized port 27019 process; no process or data changed.' }
  return @{ processId=[int]$info.ProcessId; executable=$info.ExecutablePath; projectRoot=$paths.root; dbPath=$paths.directory; port=27019; replicaSet='rs0'; marker=$paths.marker }
}
