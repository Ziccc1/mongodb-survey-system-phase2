. (Join-Path $PSScriptRoot 'phase2-instance.ps1')
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Assert-Phase2Process (Get-Phase2Paths) | ConvertTo-Json -Compress
