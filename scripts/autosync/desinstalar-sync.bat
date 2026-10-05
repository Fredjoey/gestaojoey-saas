@echo off
powershell.exe -NoProfile -Command "Unregister-ScheduledTask -TaskName 'Joey AutoSync' -Confirm:$false; Write-Host 'Joey AutoSync removido.'"
echo.
pause
