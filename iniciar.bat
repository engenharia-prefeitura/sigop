@echo off
cd /d "%~dp0"
echo Iniciando servidor SIGOP...
npx -y serve -s dist -l 5173
