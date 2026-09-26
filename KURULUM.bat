@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo   Buteo Analiz - Kurulum
echo ============================================
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js bulunamadi. Once https://nodejs.org adresinden "LTS" surumunu kurun,
  echo sonra bu dosyayi tekrar calistirin.
  start https://nodejs.org
  pause
  exit /b 1
)
echo Node.js surumu:
node -v
echo.
echo Gerekli paketler yukleniyor (1-2 dakika surebilir)...
call npm install
if errorlevel 1 (
  echo.
  echo HATA: Paketler yuklenemedi. Yukaridaki mesaji Claude'a iletin.
  pause
  exit /b 1
)
if not exist imports mkdir imports
if not exist reports mkdir reports
echo.
echo Kurulum tamamlandi. Paneli acmak icin PANELI-AC.bat dosyasina cift tiklayin.
pause
