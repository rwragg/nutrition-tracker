@echo off
REM Start the nutrition tracker. Windows.
setlocal

cd /d "%~dp0.."

docker info >nul 2>&1
if errorlevel 1 (
    echo docker is not reachable.
    echo Check that Docker Desktop is running.
    exit /b 1
)

docker compose up -d --build
if errorlevel 1 exit /b 1

echo Waiting for the health check...
for /l %%i in (1,1,60) do (
    curl -sf -o nul http://localhost:8000/api/health && (
        echo Ready: http://localhost:8000/
        exit /b 0
    )
    timeout /t 1 /nobreak >nul
)

echo The container started but never passed its health check. Try: docker compose logs
exit /b 1
