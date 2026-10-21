@echo off
rem Double-click to stop Claude Tree when it's running in the background.
title Claude Tree
cd /d "%~dp0"
node scripts\launch.mjs --stop
timeout /t 3 >nul
