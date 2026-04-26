@echo off
setlocal enabledelayedexpansion

echo Encerrando todos os processos do Chrome...
taskkill /F /IM chrome.exe /T >nul 2>&1
timeout /t 1 /nobreak >nul
taskkill /F /IM chrome.exe /T >nul 2>&1
timeout /t 3 /nobreak >nul

echo Detectando caminho do Chrome...
set "CHROME="

if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
  set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
) else if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" (
  set "CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) else if exist "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe" (
  set "CHROME=%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
)

if "!CHROME!"=="" (
  echo ERRO: Chrome nao encontrado.
  pause
  exit /b 1
)

echo Abrindo: !CHROME!
start "" "!CHROME!" --kiosk-printing --disable-print-preview --disable-popup-blocking --autoplay-policy=no-user-gesture-required "https://pedidos-joey.web.app/painel.html"
