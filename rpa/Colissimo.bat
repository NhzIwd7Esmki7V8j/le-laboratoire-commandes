@echo off
title Robot Colissimo - Le Laboratoire
set "PATH=C:\Users\Isaac\node20\node-v20.18.1-win-x64;%PATH%"
cd /d "%~dp0"
echo.
set /p REF=Numero de commande (ex: CMD_123456) :
echo.
node colissimo.mjs %REF%
echo.
pause
