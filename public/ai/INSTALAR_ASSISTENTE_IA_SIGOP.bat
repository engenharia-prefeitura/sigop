@echo off
setlocal
title SIGOP - Instalador do Assistente IA Local

set "VISION_MODEL=moondream"
set "TEXT_MODEL=qwen2.5:1.5b"
set "COMPUTE_MODE=auto"
set "SCRIPT_URL=https://engenharia-prefeitura.github.io/sigop/ai/install_sigop_ai_assistant.ps1"
set "SCRIPT_DIR=%LOCALAPPDATA%\SIGOP\AI"
set "SCRIPT_PATH=%SCRIPT_DIR%\install_sigop_ai_assistant.ps1"

echo.
echo ============================================================
echo  SIGOP - Instalador do Assistente IA Local
echo ============================================================
echo.
echo Modelo para fotos: %VISION_MODEL%
echo Modelo para texto: %TEXT_MODEL%
echo Modo de execucao: %COMPUTE_MODE%
echo.
echo Este instalador vai:
echo  1. Verificar ou instalar o Ollama
echo  2. Iniciar o Ollama local
echo  3. Criar a ponte local do SIGOP
echo  4. Ativar monitor automatico da ponte
echo  5. Baixar ou confirmar os modelos selecionados
echo  6. Aplicar o modo CPU/GPU escolhido
echo.
echo O download dos modelos pode demorar na primeira vez. Se ja existir, ele apenas confirma.
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

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_PATH%" -Model "%VISION_MODEL%" -TextModel "%TEXT_MODEL%" -ComputeMode "%COMPUTE_MODE%"

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
