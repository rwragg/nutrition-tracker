@echo off
REM Stop the nutrition tracker. Windows.

cd /d "%~dp0.."

docker compose down
echo Stopped.
