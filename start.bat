@echo off
REM ============================================================
REM start.bat - Servidor de desarrollo local para ABD Bank Manager WebUI
REM ============================================================

echo ============================================================
echo  Iniciando Servidor Web Local para ABD Bank Manager
echo  URL de Acceso: http://localhost:8390
echo ============================================================

REM Verificar que existe WebUI/src
if not exist "WebUI\src" (
    echo ERROR: No se encuentra WebUI\src
    echo Ejecute primero: build.bat generate
    pause
    exit /b 1
)

echo.
echo Generando registros y version de build...
node Scripts/registry_generator.js
if errorlevel 1 (
    echo ERROR: Fallo al generar registros
    pause
    exit /b 1
)

node Scripts/build_webui.js
if errorlevel 1 (
    echo ERROR: Fallo al generar version de build
    pause
    exit /b 1
)

echo.
echo Iniciando servidor en http://localhost:8390 ...
echo Presione Ctrl+C para detener.
echo.

npx -y sirv-cli WebUI --port 8390 --cors --single --dev
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo El servidor se ha detenido o no se pudo iniciar.
    echo Verifique que el puerto 8390 no este en uso.
    pause
)