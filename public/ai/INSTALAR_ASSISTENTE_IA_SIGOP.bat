@echo off
setlocal
title SIGOP - Instalador do Assistente IA Local

set "MODEL=qwen2.5vl:3b"
set "SCRIPT_URL=https://engenharia-prefeitura.github.io/sigop/ai/install_sigop_ai_assistant.ps1"
set "SCRIPT_DIR=%LOCALAPPDATA%\SIGOP\AI"
set "SCRIPT_PATH=%SCRIPT_DIR%\install_sigop_ai_assistant.ps1"

echo.
echo ============================================================
echo  SIGOP - Instalador do Assistente IA Local
echo ============================================================
echo.
echo Este instalador vai:
echo  1. Verificar ou instalar o Ollama
echo  2. Iniciar o Ollama local
echo  3. Criar a ponte local do SIGOP
echo  4. Baixar o modelo %MODEL%
echo.
echo O download do modelo pode demorar na primeira vez.
echo.
pause

if not exist "%SCRIPT_DIR%" mkdir "%SCRIPT_DIR%"

echo Baixando instalador atualizado do SIGOP...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing '%SCRIPT_URL%' -OutFile '%SCRIPT_PATH%'"

if errorlevel 1 (
  echo.
  echo Nao foi possivel baixar o instalador atualizado.
  echo Verifique a internet e tente novamente.
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_PATH%" -Model "%MODEL%"

if errorlevel 1 (
  echo.
  echo ============================================================
  echo  Nao foi possivel concluir a instalacao automaticamente.
  echo ============================================================
  echo.
  echo Se o erro foi sobre winget, instale o Ollama manualmente:
  echo https://ollama.com/download
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  Pronto! Volte ao SIGOP e clique em "Verificar IA local".
echo ============================================================
echo.
pause
