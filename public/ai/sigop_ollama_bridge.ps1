$ErrorActionPreference = "Stop"

$listenUrl = "http://localhost:11435/"
$ollamaBaseUrl = "http://127.0.0.1:11434"
$logDir = Join-Path $env:LOCALAPPDATA "SIGOP\AI"
$logPath = Join-Path $logDir "sigop_ollama_bridge.log"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

function Write-BridgeLog {
  param([string]$Message)
  try {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Add-Content -Path $logPath -Value "$timestamp - $Message" -Encoding UTF8
  } catch {}
}

function Add-CorsHeaders {
  param($Response, $Request)
  $origin = $Request.Headers["Origin"]
  if ($origin -and ($origin -eq "https://engenharia-prefeitura.github.io" -or $origin -eq "http://localhost:5173" -or $origin -eq "http://127.0.0.1:5173")) {
    $Response.Headers["Access-Control-Allow-Origin"] = $origin
    $Response.Headers["Vary"] = "Origin"
  } else {
    $Response.Headers["Access-Control-Allow-Origin"] = "*"
  }
  $Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
  $Response.Headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, Access-Control-Request-Private-Network"
  $Response.Headers["Access-Control-Allow-Private-Network"] = "true"
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($listenUrl)
$listener.Start()
Write-BridgeLog "Ponte SIGOP iniciada em $listenUrl"

while ($listener.IsListening) {
  $context = $null
  $response = $null

  try {
    $context = $listener.GetContext()
    $request = $context.Request
    $response = $context.Response
    Add-CorsHeaders $response $request

    if ($request.HttpMethod -eq "OPTIONS") {
      $response.StatusCode = 204
      continue
    }

    if ($request.RawUrl -eq "/sigop-health") {
      $response.StatusCode = 200
      $response.ContentType = "application/json"
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("{""ok"":true}")
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
      continue
    }

    if (-not $request.RawUrl.StartsWith("/api/")) {
      $response.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("SIGOP Ollama bridge")
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
      continue
    }

    $targetUrl = $ollamaBaseUrl + $request.RawUrl
    $body = $null

    if ($request.HasEntityBody) {
      $reader = [System.IO.StreamReader]::new($request.InputStream, $request.ContentEncoding)
      $body = $reader.ReadToEnd()
      $reader.Close()
    }

    $headers = @{}
    if ($request.ContentType) {
      $headers["Content-Type"] = $request.ContentType
    }

    $invokeParams = @{
      Uri = $targetUrl
      Method = $request.HttpMethod
      UseBasicParsing = $true
      TimeoutSec = 180
    }

    if ($body -ne $null) {
      $invokeParams.Body = $body
      if ($request.ContentType) {
        $invokeParams.ContentType = $request.ContentType
      } else {
        $invokeParams.ContentType = "application/json"
      }
    }

    $ollamaResponse = Invoke-WebRequest @invokeParams
    $response.StatusCode = [int]$ollamaResponse.StatusCode
    $contentType = $ollamaResponse.Headers["Content-Type"]
    if ($contentType) {
      $response.ContentType = $contentType
    } else {
      $response.ContentType = "application/json"
    }

    $responseBytes = [System.Text.Encoding]::UTF8.GetBytes($ollamaResponse.Content)
    $response.OutputStream.Write($responseBytes, 0, $responseBytes.Length)
  } catch {
    Write-BridgeLog ($_ | Out-String)
    try {
      if ($response -ne $null) {
        $response.StatusCode = 502
        $response.ContentType = "application/json"
        $message = ($_ | Out-String).Replace("\", "\\").Replace('"', '\"').Replace("`r", "").Replace("`n", "\n")
        $bytes = [System.Text.Encoding]::UTF8.GetBytes("{""error"":""$message""}")
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
      }
    } catch {
      Write-BridgeLog ("Falha ao responder erro: " + ($_ | Out-String))
    }
  } finally {
    try {
      if ($response -ne $null) { $response.Close() }
    } catch {
      Write-BridgeLog ("Falha ao fechar resposta: " + ($_ | Out-String))
    }
  }
}
