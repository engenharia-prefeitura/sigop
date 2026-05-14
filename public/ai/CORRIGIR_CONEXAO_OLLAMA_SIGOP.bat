@echo off
setlocal
title SIGOP - Corrigir Conexao com Ollama

set "SIGOP_ORIGIN=https://engenharia-prefeitura.github.io"

echo.
echo ============================================================
echo  SIGOP - Corrigir conexao com a IA local
echo ============================================================
echo.
echo Este arquivo configura o Ollama para aceitar chamadas do site:
echo %SIGOP_ORIGIN%
echo.
echo Use quando aparecer erro de CORS no navegador.
echo.
pause

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$origin='%SIGOP_ORIGIN%';" ^
  "$origins=$origin + ',http://localhost,http://localhost:*,http://127.0.0.1,http://127.0.0.1:*';" ^
  "Write-Host 'Configurando OLLAMA_ORIGINS...' -ForegroundColor Cyan;" ^
  "[Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS',$origins,'User');" ^
  "$env:OLLAMA_ORIGINS=$origins;" ^
  "Write-Host 'Reiniciando Ollama...' -ForegroundColor Cyan;" ^
  "Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue;" ^
  "Start-Sleep -Seconds 2;" ^
  "try { Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null } catch {};" ^
  "for($i=0;$i -lt 30;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing 'http://localhost:11434/api/tags' -TimeoutSec 2; if($r.StatusCode -eq 200){ Write-Host 'Ollama pronto para o SIGOP.' -ForegroundColor Green; exit 0 } } catch {}; Start-Sleep -Seconds 2 };" ^
  "throw 'Nao foi possivel confirmar o Ollama em http://localhost:11434. Abra o app Ollama e tente novamente.';"

if errorlevel 1 (
  echo.
  echo Nao foi possivel reiniciar automaticamente.
  echo Abra o app Ollama pelo menu iniciar e tente Verificar IA local no SIGOP.
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
