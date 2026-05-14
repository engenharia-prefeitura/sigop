@echo off
setlocal
title SIGOP - Instalador do Assistente IA Local

set "MODEL=qwen2.5vl:3b"

echo.
echo ============================================================
echo  SIGOP - Instalador do Assistente IA Local
echo ============================================================
echo.
echo Este instalador vai:
echo  1. Verificar ou instalar o Ollama
echo  2. Iniciar o Ollama local
echo  3. Criar uma ponte local para o site do SIGOP
echo  4. Baixar o modelo %MODEL%
echo.
echo O download do modelo pode demorar na primeira vez.
echo.
pause

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop';" ^
  "$model='%MODEL%';" ^
  "$bridgeUrl='https://engenharia-prefeitura.github.io/sigop/ai/sigop_ollama_bridge.ps1';" ^
  "$bridgeDir=Join-Path $env:LOCALAPPDATA 'SIGOP\AI';" ^
  "$bridgePath=Join-Path $bridgeDir 'sigop_ollama_bridge.ps1';" ^
  "function Test-Cmd($name){ return $null -ne (Get-Command $name -ErrorAction SilentlyContinue) };" ^
  "function Wait-Ollama{ for($i=0;$i -lt 30;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing 'http://localhost:11434/api/tags' -TimeoutSec 2; if($r.StatusCode -eq 200){ return $true } } catch {}; Start-Sleep -Seconds 2 }; return $false };" ^
  "function Wait-Bridge{ for($i=0;$i -lt 30;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing 'http://localhost:11435/api/tags' -TimeoutSec 2; if($r.StatusCode -eq 200){ return $true } } catch {}; Start-Sleep -Seconds 2 }; return $false };" ^
  "Write-Host 'Verificando Ollama...' -ForegroundColor Cyan;" ^
  "if(-not (Test-Cmd 'ollama')){ " ^
  "  Write-Host 'Ollama nao encontrado. Tentando instalar com winget...' -ForegroundColor Yellow;" ^
  "  if(-not (Test-Cmd 'winget')){ throw 'winget nao esta disponivel. Instale o Ollama manualmente em https://ollama.com/download' };" ^
  "  winget install --id Ollama.Ollama --source winget --accept-package-agreements --accept-source-agreements;" ^
  "};" ^
  "if(-not (Test-Cmd 'ollama')){ $p=$env:LOCALAPPDATA + '\Programs\Ollama\ollama.exe'; if(Test-Path $p){ $env:Path=$env:LOCALAPPDATA + '\Programs\Ollama;' + $env:Path } };" ^
  "Write-Host 'Configurando permissao de acesso do SIGOP ao Ollama local...' -ForegroundColor Cyan;" ^
  "$origins='*';" ^
  "[Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS',$origins,'User');" ^
  "setx OLLAMA_ORIGINS $origins | Out-Null;" ^
  "$env:OLLAMA_ORIGINS=$origins;" ^
  "Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue;" ^
  "Write-Host 'Iniciando Ollama local...' -ForegroundColor Cyan;" ^
  "try { Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null } catch {};" ^
  "if(-not (Wait-Ollama)){ throw 'Nao foi possivel confirmar o Ollama em http://localhost:11434. Abra o app Ollama e tente novamente.' };" ^
  "Write-Host 'Instalando ponte local SIGOP...' -ForegroundColor Cyan;" ^
  "New-Item -ItemType Directory -Force -Path $bridgeDir | Out-Null;" ^
  "Invoke-WebRequest -UseBasicParsing $bridgeUrl -OutFile $bridgePath;" ^
  "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*sigop_ollama_bridge.ps1*' } | ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate | Out-Null };" ^
  "Start-Process powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$bridgePath) -WindowStyle Hidden;" ^
  "if(-not (Wait-Bridge)){ throw 'Nao foi possivel iniciar a ponte local SIGOP em http://localhost:11435.' };" ^
  "Write-Host ('Baixando modelo ' + $model + '...') -ForegroundColor Yellow;" ^
  "ollama pull $model;" ^
  "Write-Host '';" ^
  "Write-Host 'Assistente IA Local pronto para uso no SIGOP.' -ForegroundColor Green;" ^
  "Write-Host ('Modelo instalado: ' + $model) -ForegroundColor Green;" ^
  "Write-Host 'Endpoint do SIGOP: http://localhost:11435' -ForegroundColor Green;"

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
