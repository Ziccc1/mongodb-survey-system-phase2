param([Parameter(Mandatory=$true)][string]$Ports)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
if ($Ports -notmatch '^\d+(,\d+)*$') { throw 'Explicit numeric listener ports required' }
$wanted = @($Ports.Split(',') | ForEach-Object { [int]$_ })
if (@($wanted | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -gt 0) { throw 'Invalid listener port' }
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object { $_.LocalPort -in $wanted } | ForEach-Object {
  @{ port=[int]$_.LocalPort; pid=[int]$_.OwningProcess; address=[string]$_.LocalAddress }
})
ConvertTo-Json -InputObject $listeners -Compress
