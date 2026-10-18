@echo off
rem Double-click to start Claude Tree. Keep the window open while you use the app; close it to stop.
title Claude Tree
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Claude Tree needs Node.js, which isn't installed yet.
  echo.
  echo Opening the download page: install the "LTS" version, then double-click this file again.
  start "" "https://nodejs.org/en/download"
  echo.
  pause
  exit /b 1
)

node scripts\launch.mjs
if errorlevel 1 (
  echo.
  pause
)
