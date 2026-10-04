@echo off
chcp 65001 >nul
title MBBank Payment Gateway API
echo ========================================================
echo   MBBank Payment Gateway API (High-Security Edition)
echo ========================================================
echo Dang khoi dong server...
node src/server.js
pause
