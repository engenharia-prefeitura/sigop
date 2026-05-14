param(
  [string]$Model = "moondream",
  [string]$TextModel = "qwen2.5:1.5b"
)

$ErrorActionPreference = "Stop"
$bridgeUrl = "https://engenharia-prefeitura.github.io/sigop/ai/sigop_ollama_bridge.ps1"
$monitorUrl = "https://engenharia-prefeitura.github.io/sigop/ai/sigop_ai_bridge_monitor.ps1"
$bridgeDir = Join-Path $env:LOCALAPPDATA "SIGOP\AI"
$bridgePath = Join-Path $bridgeDir "sigop_ollama_bridge.ps1"
$monitorPath = Join-Path $bridgeDir "sigop_ai_bridge_monitor.ps1"

Write-Host "SIGOP - Instalador do Assistente IA Local" -ForegroundColor Cyan
Write-Host "Modelo para fotos: $Model" -ForegroundColor Cyan
Write-Host "Modelo para texto: $TextModel" -ForegroundColor Cyan

function Test-Command {
  param([string]$Name)
  $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Wait-Ollama {
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing "http://localhost:11434/api/tags" -TimeoutSec 2
      if ($response.StatusCode -eq 200) { return $true }
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  return $false
}

function Wait-Bridge {
  for ($i = 0; $i -lt 30; $i++) {
    try {
      $response = Invoke-WebRequest -UseBasicParsing "http://localhost:11435/sigop-health" -TimeoutSec 2
      if ($response.StatusCode -eq 200) { return $true }
    } catch {
      Start-Sleep -Seconds 2
    }
  }
  return $false
}

function Install-BridgeMonitor {
  $monitorCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$monitorPath`" -BridgePath `"$bridgePath`""

  try {
    schtasks.exe /Create /TN "SIGOP AI Local Monitor" /SC MINUTE /MO 5 /TR $monitorCommand /F | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "schtasks retornou codigo $LASTEXITCODE" }
    Write-Host "Monitor automatico da ponte local configurado." -ForegroundColor Green
  } catch {
    Write-Host "Nao foi possivel criar tarefa agendada. Criando inicializacao simples." -ForegroundColor Yellow
  }

  try {
    $startupDir = [Environment]::GetFolderPath("Startup")
    $startupBat = Join-Path $startupDir "SIGOP_AI_LOCAL.bat"
    $startupContent = "@echo off`r`nstart `"`" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$monitorPath`" -BridgePath `"$bridgePath`"`r`n"
    Set-Content -Path $startupBat -Value $startupContent -Encoding ASCII
  } catch {
    Write-Host "Nao foi possivel criar atalho de inicializacao. O assistente ainda funcionara nesta sessao." -ForegroundColor Yellow
  }
}

if (-not (Test-Command "ollama")) {
  Write-Host "Ollama nao encontrado. Tentando instalar com winget..." -ForegroundColor Yellow

  if (-not (Test-Command "winget")) {
    Write-Host "winget nao esta disponivel neste Windows." -ForegroundColor Red
    Write-Host "Instale o Ollama manualmente em https://ollama.com/download e execute este script novamente."
    Read-Host "Pressione Enter para sair"
    exit 1
  }

  winget install --id Ollama.Ollama --source winget --accept-package-agreements --accept-source-agreements
}

if (-not (Test-Command "ollama")) {
  $possiblePath = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
  if (Test-Path $possiblePath) {
    $env:Path = "$env:LOCALAPPDATA\Programs\Ollama;$env:Path"
  }
}

Write-Host "Iniciando Ollama local..." -ForegroundColor Yellow
$origins = "*"
[Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", $origins, "User")
$env:OLLAMA_ORIGINS = $origins
setx OLLAMA_ORIGINS $origins | Out-Null
Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

try {
  Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null
} catch {
  Write-Host "Ollama pode ja estar em execucao."
}

if (-not (Wait-Ollama)) {
  Write-Host "Nao foi possivel confirmar o Ollama em http://localhost:11434." -ForegroundColor Red
  Write-Host "Abra o aplicativo Ollama e tente novamente."
  Read-Host "Pressione Enter para sair"
  exit 1
}

Write-Host "Instalando ponte local SIGOP..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $bridgeDir | Out-Null
Invoke-WebRequest -UseBasicParsing $bridgeUrl -OutFile $bridgePath
Invoke-WebRequest -UseBasicParsing $monitorUrl -OutFile $monitorPath

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*sigop_ollama_bridge.ps1*" } |
  ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate -ErrorAction SilentlyContinue | Out-Null }

Install-BridgeMonitor

Start-Process powershell.exe -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  $monitorPath,
  "-BridgePath",
  $bridgePath
) -WindowStyle Hidden

if (-not (Wait-Bridge)) {
  Write-Host "Nao foi possivel iniciar a ponte local SIGOP em http://localhost:11435." -ForegroundColor Red
  Read-Host "Pressione Enter para sair"
  exit 1
}

$modelsToInstall = @($Model, $TextModel) | Where-Object { $_ -and $_.Trim() } | Select-Object -Unique
foreach ($modelToInstall in $modelsToInstall) {
  Write-Host "Baixando modelo $modelToInstall. Isso pode demorar na primeira vez..." -ForegroundColor Yellow
  ollama pull $modelToInstall
}

Write-Host ""
Write-Host "Assistente IA Local pronto para uso no SIGOP." -ForegroundColor Green
Write-Host "Modelos instalados: $($modelsToInstall -join ', ')" -ForegroundColor Green
Write-Host "Endpoint: http://localhost:11435" -ForegroundColor Green
Read-Host "Pressione Enter para finalizar"
