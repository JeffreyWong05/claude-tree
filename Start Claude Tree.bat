@echo off
rem Double-click to start Claude Tree. It runs in the background; this window closes by itself.
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

node scripts\launch.mjs %*
if errorlevel 1 (
  echo.
  pause
  exit /b 1
)
rem Leave the result on screen briefly, then close.
timeout /t 3 >nul
