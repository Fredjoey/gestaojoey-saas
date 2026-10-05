# Instala o Joey AutoSync no Agendador de Tarefas do Windows (a cada 3 min, oculto).
$ErrorActionPreference = 'Stop'
$dir = Join-Path $env:LOCALAPPDATA 'joey-autosync'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot 'autosync.ps1') (Join-Path $dir 'autosync.ps1')

# Lancador .vbs: roda o PowerShell sem abrir janela preta a cada 3 min
$ps1 = Join-Path $dir 'autosync.ps1'
$vbs = Join-Path $dir 'rodar-oculto.vbs'
$cmd = 'powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""' + $ps1 + '""'
Set-Content -Path $vbs -Encoding ASCII -Value ('CreateObject("WScript.Shell").Run "' + $cmd + '", 0, False')

$action   = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + $vbs + '"')
$trigger  = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 3)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
              -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 2)
Register-ScheduledTask -TaskName 'Joey AutoSync' -Action $action -Trigger $trigger -Settings $settings `
  -Description 'Envia para o GitHub os commits pendentes dos projetos da Area de Trabalho (so push, nunca commit).' -Force | Out-Null

Write-Host ''
Write-Host 'Joey AutoSync instalado. Rodando agora uma vez para testar...' -ForegroundColor Green
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ps1
$log = Join-Path $dir 'sync.log'
if (Test-Path $log) { Write-Host ''; Write-Host 'Ultimas linhas do log:'; Get-Content $log -Tail 10 }
else { Write-Host 'Nada pendente para enviar. Tudo em dia.' }
Write-Host ''
Write-Host "Log fica em: $log"
