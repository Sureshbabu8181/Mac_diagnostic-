@echo off
echo ========================================
echo   One Diagnose - Windows Setup
echo ========================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is NOT installed!
    echo Download from: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Node.js found:
node -v
echo.

echo Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo npm install failed!
    pause
    exit /b 1
)

echo.
echo Starting One Diagnose...
call npx electron .
