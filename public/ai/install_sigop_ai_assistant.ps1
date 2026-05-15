param(
  [string]$Model = "moondream",
  [string]$TextModel = "qwen2.5:1.5b",
  [string]$ComputeMode = "auto"
)

$ErrorActionPreference = "Stop"
$bridgeUrl = "https://engenharia-prefeitura.github.io/sigop/ai/sigop_ollama_bridge.ps1"
$monitorUrl = "https://engenharia-prefeitura.github.io/sigop/ai/sigop_ai_bridge_monitor.ps1"
$bridgeDir = Join-Path $env:LOCALAPPDATA "SIGOP\AI"
$bridgePath = Join-Path $bridgeDir "sigop_ollama_bridge.ps1"
$monitorPath = Join-Path $bridgeDir "sigop_ai_bridge_monitor.ps1"

Write-Host "SIGOP - Instalador do Assistente IA Local" -ForegroundColor Cyan
if (-not [string]::IsNullOrWhiteSpace($Model)) {
  Write-Host "Modelo visual legado: $Model" -ForegroundColor Cyan
}
Write-Host "Modelo textual: $TextModel" -ForegroundColor Cyan
Write-Host "Modo de execucao: $ComputeMode" -ForegroundColor Cyan

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
  $monitorCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$monitorPath`" -BridgePath `"$bridgePath`" -ComputeMode `"$ComputeMode`""

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
    $startupContent = "@echo off`r`nstart `"`" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$monitorPath`" -BridgePath `"$bridgePath`" -ComputeMode `"$ComputeMode`"`r`n"
    Set-Content -Path $startupBat -Value $startupContent -Encoding ASCII
  } catch {
    Write-Host "Nao foi possivel criar atalho de inicializacao. O assistente ainda funcionara nesta sessao." -ForegroundColor Yellow
  }
}

function Set-UserEnv {
  param([string]$Name, [AllowNull()][AllowEmptyString()][string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) {
    [Environment]::SetEnvironmentVariable($Name, $null, "User")
    Remove-Item "Env:\$Name" -ErrorAction SilentlyContinue
  } else {
    [Environment]::SetEnvironmentVariable($Name, $Value, "User")
    Set-Item "Env:\$Name" $Value
  }
}

function Set-UserEnvAndSetx {
  param([string]$Name, [AllowNull()][AllowEmptyString()][string]$Value)
  Set-UserEnv $Name $Value
  if (-not [string]::IsNullOrWhiteSpace($Value)) {
    setx $Name $Value | Out-Null
  }
}

function Set-OllamaComputeEnvironment {
  $mode = $ComputeMode
  if ([string]::IsNullOrWhiteSpace($mode)) {
    $mode = "auto"
  }
  $mode = $mode.ToLowerInvariant()
  if (@("auto", "cpu", "gpu") -notcontains $mode) {
    $mode = "auto"
  }

  $origins = "*"
  Set-UserEnv "OLLAMA_ORIGINS" $origins
  setx OLLAMA_ORIGINS $origins | Out-Null

  if ($mode -eq "cpu") {
    Set-UserEnvAndSetx "OLLAMA_VULKAN" $null
    Set-UserEnvAndSetx "ROCR_VISIBLE_DEVICES" "-1"
    Set-UserEnvAndSetx "GGML_VK_VISIBLE_DEVICES" "-1"
    Set-UserEnvAndSetx "CUDA_VISIBLE_DEVICES" "-1"
    Set-UserEnvAndSetx "HIP_VISIBLE_DEVICES" "-1"
    Set-UserEnvAndSetx "GPU_DEVICE_ORDINAL" "-1"
    Write-Host "Ollama configurado para tentar usar apenas CPU." -ForegroundColor Yellow
    return
  }

  Set-UserEnvAndSetx "ROCR_VISIBLE_DEVICES" $null
  Set-UserEnvAndSetx "GGML_VK_VISIBLE_DEVICES" $null
  Set-UserEnvAndSetx "CUDA_VISIBLE_DEVICES" $null
  Set-UserEnvAndSetx "HIP_VISIBLE_DEVICES" $null
  Set-UserEnvAndSetx "GPU_DEVICE_ORDINAL" $null

  if ($mode -eq "gpu") {
    Set-UserEnvAndSetx "OLLAMA_VULKAN" "1"
    Write-Host "Ollama configurado para tentar GPU. Vulkan foi ativado para ampliar compatibilidade." -ForegroundColor Yellow
    return
  }

  Set-UserEnvAndSetx "OLLAMA_VULKAN" $null
  Write-Host "Ollama configurado em modo automatico." -ForegroundColor Yellow
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
Set-OllamaComputeEnvironment
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

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*sigop_ai_bridge_monitor.ps1*" } |
  ForEach-Object { Invoke-CimMethod -InputObject $_ -MethodName Terminate -ErrorAction SilentlyContinue | Out-Null }

$lockPath = Join-Path $bridgeDir "sigop_ai_bridge_monitor.pid"
Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue

Install-BridgeMonitor

Start-Process powershell.exe -ArgumentList @(
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-File",
  $monitorPath,
  "-BridgePath",
  $bridgePath,
  "-ComputeMode",
  $ComputeMode
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
