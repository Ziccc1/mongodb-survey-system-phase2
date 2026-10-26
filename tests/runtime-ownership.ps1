$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\scripts\phase2-instance.ps1')
$actual = Get-Phase2Paths
$probe = Join-Path $actual.root ('.local\phase2-ownership-probes-' + [guid]::NewGuid().ToString('N'))
$paths = @{ root=$actual.root; directory=$probe; marker=(Join-Path $probe 'project2-instance.json') }
New-Item -ItemType Directory -Path $probe | Out-Null
Assert-Phase2DataDirectory $paths
Write-Host 'PASS empty new probe directory accepted without creating an ownership marker'
Set-Content -LiteralPath (Join-Path $probe 'synthetic.txt') -Value 'synthetic unknown directory; no database files'
$rejected = $false
try { Assert-Phase2DataDirectory $paths } catch { $rejected = $true }
if (!$rejected -or (Test-Path -LiteralPath $paths.marker)) { throw 'Unknown directory must be rejected without a marker write' }
Write-Host 'PASS unknown nonempty probe rejected without relabeling'
foreach ($case in @('wrong-project','wrong-port','wrong-replica','extra-field')) {
  $marker = @{ kind='phase2-runtime-v1'; projectRoot=$actual.root; port=27019; replicaSet='rs0' }
  if ($case -eq 'wrong-project') { $marker.projectRoot = Join-Path $actual.root 'unrecognized' }
  if ($case -eq 'wrong-port') { $marker.port = 27018 }
  if ($case -eq 'wrong-replica') { $marker.replicaSet = 'unknown' }
  if ($case -eq 'extra-field') { $marker.extra = 'unexpected' }
  $marker | ConvertTo-Json | Set-Content -LiteralPath $paths.marker -Encoding UTF8
  $before = (Get-FileHash -LiteralPath $paths.marker -Algorithm SHA256).Hash
  $rejected = $false
  try { Assert-Phase2DataDirectory $paths } catch { $rejected = $true }
  if (!$rejected -or (Get-FileHash -LiteralPath $paths.marker -Algorithm SHA256).Hash -ne $before) { throw 'Mismatch must fail without modifying a marker' }
  Write-Host ('PASS ' + $case + ' marker rejected and bytes preserved')
}
Write-Host 'Six ownership guards passed using synthetic file fixtures only; actual database directory unchanged.'
