param(
  [string]$Model = "qwen2.5vl:3b"
)

$ErrorActionPreference = "Stop"

Write-Host "SIGOP - Instalador do Assistente IA Local" -ForegroundColor Cyan
Write-Host "Modelo selecionado: $Model" -ForegroundColor Cyan

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

Write-Host "Baixando modelo $Model. Isso pode demorar na primeira vez..." -ForegroundColor Yellow
ollama pull $Model

Write-Host ""
Write-Host "Assistente IA Local pronto para uso no SIGOP." -ForegroundColor Green
Write-Host "Modelo instalado: $Model" -ForegroundColor Green
Write-Host "Endpoint: http://localhost:11434" -ForegroundColor Green
Read-Host "Pressione Enter para finalizar"
