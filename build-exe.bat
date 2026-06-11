@echo off
setlocal enabledelayedexpansion

REM ============================================================
REM Infinite Canvas — EXE Build Script (Windows)
REM ============================================================
REM Prerequisites:
REM   - Go 1.25+   (https://go.dev/dl/)
REM   - Bun        (https://bun.sh)
REM
REM Usage:
REM   build-exe.bat                    REM Build for Windows
REM   set VERSION=0.3.0 && build-exe.bat
REM ============================================================

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

REM --- Configuration ---
if "%VERSION%"=="" (
    if exist VERSION (
        set /p VERSION=<VERSION
    ) else (
        set VERSION=dev
    )
)
set TARGET=windows
set ARCH=amd64
set OUTPUT=infinite-canvas.exe

echo ==========================================
echo  Infinite Canvas EXE Builder
echo  Version: %VERSION%
echo  Target:  %TARGET%/%ARCH%
echo  Output:  %OUTPUT%
echo ==========================================

REM --- Step 1: Build Frontend ---
echo.
echo [1/4] Building frontend (Next.js static export)...

set API_ROUTE=web\src\app\api\[...path]\route.ts
set WEBDAV_ROUTE=web\src\app\webdav-proxy\route.ts

REM Temporarily disable API routes (not compatible with Next.js static export)
if exist "%API_ROUTE%" (
    move "%API_ROUTE%" "%API_ROUTE%.exe-build-bak" >nul
    echo       Disabled: %API_ROUTE%
)
if exist "%WEBDAV_ROUTE%" (
    move "%WEBDAV_ROUTE%" "%WEBDAV_ROUTE%.exe-build-bak" >nul
    echo       Disabled: %WEBDAV_ROUTE%
)

cd web
set NEXT_EXPORT=1
call bun install --frozen-lockfile
if %ERRORLEVEL% neq 0 (
    echo ERROR: bun install failed!
    cd ..
    goto :restore
)
call bun run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: bun run build failed!
    cd ..
    goto :restore
)
cd ..

echo       Frontend build complete.

:restore
REM Restore API routes
if exist "%API_ROUTE%.exe-build-bak" (
    move "%API_ROUTE%.exe-build-bak" "%API_ROUTE%" >nul
    echo       Restored: %API_ROUTE%
)
if exist "%WEBDAV_ROUTE%.exe-build-bak" (
    move "%WEBDAV_ROUTE%.exe-build-bak" "%WEBDAV_ROUTE%" >nul
    echo       Restored: %WEBDAV_ROUTE%
)

REM Check if frontend build succeeded
if not exist "web\out\index.html" (
    echo ERROR: web\out\index.html not found — frontend build may have failed!
    exit /b 1
)

REM --- Step 2: Build Go Backend ---
echo.
echo [2/4] Building Go backend (with embedded frontend)...

go build -tags embed -ldflags="-s -w -X main.version=%VERSION%" -o "%OUTPUT%" .
if %ERRORLEVEL% neq 0 (
    echo ERROR: go build failed!
    exit /b 1
)

echo       Go build complete: %OUTPUT%

REM --- Step 3: Report ---
echo.
echo [3/4] Build artifacts:
dir "%OUTPUT%"

echo.
echo       Windows EXE is ready. Double-click to run in the background,
echo       then open http://localhost:8080 in your browser.

REM --- Step 4: Done ---
echo.
echo [4/4] Done!
echo.
echo   To distribute, include:
echo     - %OUTPUT%
echo     - data\ directory (created on first run, contains the database)
echo.
echo ==========================================
echo  Build complete: %OUTPUT%
echo ==========================================

endlocal
