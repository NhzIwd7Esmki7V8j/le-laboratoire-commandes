@echo off
title Veilleur - Le Laboratoire (lancement auto du robot Colissimo)
set "PATH=C:\Users\Isaac\node20\node-v20.18.1-win-x64;%PATH%"
cd /d "%~dp0"
node watch.mjs
echo.
echo Le veilleur s'est arrete.
pause
