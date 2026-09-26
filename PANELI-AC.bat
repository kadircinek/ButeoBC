@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Once KURULUM.bat dosyasini calistirin.
  pause
  exit /b 1
)
echo Buteo Analiz paneli baslatiliyor: http://localhost:3000
echo Paneli kapatmak icin bu pencereyi kapatin.
start "" http://localhost:3000
node server/index.js
pause
