@echo off
REM ABD Universal Bank Manager - Master Build Script
REM Usage: build.bat [clean|generate|build|all]

set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

set BUILD_TYPE=Release

:: ============================================================================
:: Instancia de Visual Studio para CMake (via vswhere)
:: ============================================================================
:: El CMakeCache recuerda la instancia con la que se configuro por primera vez.
:: Si esa edicion ya no esta instalada (p. ej. Community -> BuildTools),
:: project() aborta con "could not find specified instance of Visual Studio"
:: antes de compilar nada. Se resuelve aqui la instancia real (con toolset C++)
:: y se le pasa a cmake en la linea de comandos.
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "CMAKE_VS_INSTANCE="
if exist "%VSWHERE%" (
    for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "CMAKE_VS_INSTANCE=%%i"
)
set "VS_INSTANCE_ARG="
if defined CMAKE_VS_INSTANCE set VS_INSTANCE_ARG=-DCMAKE_GENERATOR_INSTANCE="%CMAKE_VS_INSTANCE%"

:: ============================================================================
:: Enlace a Assets Compartidos via NTFS Junctions (Cero Copias)
:: ============================================================================
set "SHARED_ASSETS=..\ABDSharedAssets"
if exist "%SHARED_ASSETS%" (
    if not exist "WebUI\vendor\images\models\thumbs" (
        if not exist "WebUI\vendor\images\models" mkdir "WebUI\vendor\images\models"
        mklink /J "WebUI\vendor\images\models\thumbs" "%SHARED_ASSETS%\models" >nul 2>nul
    )
    if not exist "WebUI\vendor\images\models\logos" (
        if not exist "WebUI\vendor\images\models" mkdir "WebUI\vendor\images\models"
        mklink /J "WebUI\vendor\images\models\logos" "%SHARED_ASSETS%\brands" >nul 2>nul
    )
    if exist "%SHARED_ASSETS%\styles" if not exist "WebUI\vendor\styles" (
        mklink /J "WebUI\vendor\styles" "%SHARED_ASSETS%\styles" >nul 2>nul
        if not exist "WebUI\vendor\styles" robocopy "%SHARED_ASSETS%\styles" "WebUI\vendor\styles" /E /NFL /NDL /NJH /NJS /nc /ns /np >nul
    )
    if exist "%SHARED_ASSETS%\icons" if not exist "WebUI\vendor\icons" (
        mklink /J "WebUI\vendor\icons" "%SHARED_ASSETS%\icons" >nul 2>nul
        if not exist "WebUI\vendor\icons" robocopy "%SHARED_ASSETS%\icons" "WebUI\vendor\icons" /E /NFL /NDL /NJH /NJS /nc /ns /np >nul
    )
)

:: Fallback: si no hubo junction (asset ausente o mklink denegado), se copian
:: los SVG sueltos. Solo cuando logos no existe, para no mezclar copia y enlace.
if exist "%SHARED_ASSETS%\brands" (
    if not exist "WebUI\vendor\images\models\logos" (
        if not exist "WebUI\vendor\images\models" mkdir "WebUI\vendor\images\models"
        robocopy "%SHARED_ASSETS%\brands" "WebUI\vendor\images\models\logos" *.svg /XO /NFL /NDL /NJH /NJS /nc /ns /np >nul
    )
)

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
    cmake -B build -S . -DCMAKE_BUILD_TYPE=%BUILD_TYPE% %VS_INSTANCE_ARG%
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
    echo Tauri fue descartado: apps/standalone/src-tauri ya no existe en el arbol.
    echo El host de referencia es ahora apps/juce-plugin ^(build.bat sin argumentos lo compila^).
    echo Ver DOCS\bank-manager-module-cut.md y HANDOFF.md.
    exit /b 1
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
cmake -B build -S . -DCMAKE_BUILD_TYPE=%BUILD_TYPE% %VS_INSTANCE_ARG%
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
