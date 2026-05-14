param(
  [string]$BridgePath = "",
  [string]$ComputeMode = "auto"
)

$ErrorActionPreference = "SilentlyContinue"

$aiDir = Join-Path $env:LOCALAPPDATA "SIGOP\AI"
$lockPath = Join-Path $aiDir "sigop_ai_bridge_monitor.pid"
$logPath = Join-Path $aiDir "sigop_ai_bridge_monitor.log"
if (-not $BridgePath) {
  $BridgePath = Join-Path $aiDir "sigop_ollama_bridge.ps1"
}

New-Item -ItemType Directory -Force -Path $aiDir | Out-Null

function Write-MonitorLog {
  param([string]$Message)
  try {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $logPath -Value "$timestamp - $Message" -Encoding UTF8
  } catch {}
}

function Test-Url {
  param([string]$Url)
  try {
    $response = Invoke-WebRequest -UseBasicParsing $Url -TimeoutSec 2
    return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500)
  } catch {
    return $false
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

  $env:OLLAMA_ORIGINS = "*"

  if ($mode -eq "cpu") {
    Remove-Item Env:\OLLAMA_VULKAN -ErrorAction SilentlyContinue
    $env:ROCR_VISIBLE_DEVICES = "-1"
    $env:GGML_VK_VISIBLE_DEVICES = "-1"
    $env:CUDA_VISIBLE_DEVICES = "-1"
    $env:HIP_VISIBLE_DEVICES = "-1"
    $env:GPU_DEVICE_ORDINAL = "-1"
    return
  }

  Remove-Item Env:\ROCR_VISIBLE_DEVICES -ErrorAction SilentlyContinue
  Remove-Item Env:\GGML_VK_VISIBLE_DEVICES -ErrorAction SilentlyContinue
  Remove-Item Env:\CUDA_VISIBLE_DEVICES -ErrorAction SilentlyContinue
  Remove-Item Env:\HIP_VISIBLE_DEVICES -ErrorAction SilentlyContinue
  Remove-Item Env:\GPU_DEVICE_ORDINAL -ErrorAction SilentlyContinue

  if ($mode -eq "gpu") {
    $env:OLLAMA_VULKAN = "1"
  } else {
    Remove-Item Env:\OLLAMA_VULKAN -ErrorAction SilentlyContinue
  }
}

try {
  if (Test-Path $lockPath) {
    $existingPid = (Get-Content $lockPath -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($existingPid -match '^\d+$') {
      $existingProcess = Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue
      if ($existingProcess -and $existingProcess.Id -ne $PID) {
        exit 0
      }
    }
  }

  Set-Content -Path $lockPath -Value $PID -Encoding ASCII
  Write-MonitorLog "Monitor iniciado. Ponte: $BridgePath. Modo: $ComputeMode"

  $possibleOllamaPath = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
  if (Test-Path $possibleOllamaPath) {
    $env:Path = "$(Split-Path $possibleOllamaPath);$env:Path"
  }

  while ($true) {
    if (-not (Test-Url "http://127.0.0.1:11434/api/tags")) {
      Write-MonitorLog "Ollama nao respondeu. Tentando iniciar."
      Set-OllamaComputeEnvironment
      Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden | Out-Null
      Start-Sleep -Seconds 5
    }

    if (-not (Test-Url "http://localhost:11435/sigop-health")) {
      if (Test-Path $BridgePath) {
        Write-MonitorLog "Ponte SIGOP nao respondeu. Tentando iniciar."
        Start-Process powershell.exe -ArgumentList @(
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          $BridgePath
        ) -WindowStyle Hidden | Out-Null
        Start-Sleep -Seconds 3
      } else {
        Write-MonitorLog "Arquivo da ponte nao encontrado: $BridgePath"
      }
    }

    Start-Sleep -Seconds 20
  }
} finally {
  try {
    $currentPid = (Get-Content $lockPath -ErrorAction SilentlyContinue | Select-Object -First 1)
    if ($currentPid -eq "$PID") {
      Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
    }
  } catch {}
}
