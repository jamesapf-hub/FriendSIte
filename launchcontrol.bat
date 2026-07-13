@echo off
title Co-Cal Launch Control
echo ===================================================
echo             CO-CAL LAUNCH CONTROL
echo ===================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js from https://nodejs.org/ first.
    echo.
    pause
    exit /b 1
)

:: Check if node_modules folder exists, if not run npm install
if not exist "node_modules\" (
    echo [INFO] node_modules not found. Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies.
        pause
        exit /b 1
    )
    echo [INFO] Dependencies installed successfully.
    echo.
)

echo Select launch mode:
echo [1] Local Mode (Express Server + Local JSON Database)
echo [2] Cloudflare Worker Mode (Wrangler + Simulated KV Database)
echo.
set /p mode="Enter choice (1 or 2, default is 1): "

if "%mode%"=="2" (
    echo.
    echo [INFO] Launching Cloudflare Worker Server...
    echo [INFO] Opening http://localhost:8788 in your browser...
    echo.
    start http://localhost:8788
    call npx wrangler dev --port=8788
) else (
    echo.
    echo [INFO] Launching Local Express Server...
    echo [INFO] Opening http://localhost:3000 in your browser...
    echo.
    start http://localhost:3000
    node server.js
)

pause
