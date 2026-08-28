@echo off
REM ABD Universal Bank Manager — Master Build Script
REM Usage: build.bat [clean|generate|build|all]

set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

set BUILD_TYPE=Release

if "%1"=="clean" (
    echo Cleaning build directories...
    if exist build rmdir /s /q build
    if exist WebUI/dist rmdir /s /q WebUI/dist
    if exist apps/standalone/src-tauri/target rmdir /s /q apps/standalone/src-tauri/target
    exit /b 0
)

if "%1"=="generate" (
    echo Generating registry and build version...
    node Scripts/registry_generator.js
    if errorlevel 1 exit /b 1
    node Scripts/build_webui.js
    if errorlevel 1 exit /b 1
    exit /b 0
)

if "%1"=="build" (
    echo Building C++ targets...
    cmake -B build -S . -DCMAKE_BUILD_TYPE=%BUILD_TYPE%
    if errorlevel 1 exit /b 1
    cmake --build build --config %BUILD_TYPE% --parallel
    if errorlevel 1 exit /b 1
    exit /b 0
)

if "%1"=="webui" (
    echo Building WebUI...
    npm run build:webui
    if errorlevel 1 exit /b 1
    exit /b 0
)

if "%1"=="tauri" (
    echo Building Tauri app...
    cd apps/standalone
    npm run tauri build
    if errorlevel 1 exit /b 1
    exit /b 0
)

REM Default: generate + build
echo ==========================================
echo ABD Universal Bank Manager - Full Build
echo ==========================================

echo.
echo [1/3] Generating registry and build version...
node Scripts/registry_generator.js
if errorlevel 1 (
    echo ERROR: Registry generation failed
    exit /b 1
)
node Scripts/build_webui.js
if errorlevel 1 (
    echo ERROR: Build version generation failed
    exit /b 1
)

echo.
echo [2/3] Configuring CMake...
cmake -B build -S . -DCMAKE_BUILD_TYPE=%BUILD_TYPE%
if errorlevel 1 (
    echo ERROR: CMake configure failed
    exit /b 1
)

echo.
echo [3/3] Building...
cmake --build build --config %BUILD_TYPE% --parallel
if errorlevel 1 (
    echo ERROR: Build failed
    exit /b 1
)

echo.
echo ==========================================
echo BUILD SUCCESSFUL
echo ==========================================
echo Output: build\ABDBankManagerCore_%BUILD_TYPE%.lib
echo         build\ABDBankManagerCore_%BUILD_TYPE%.dll (if shared)