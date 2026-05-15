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

function Read-RequestBody {
  param($Request)
  if (-not $Request.HasEntityBody) { return $null }
  $reader = [System.IO.StreamReader]::new($Request.InputStream, $Request.ContentEncoding)
  try {
    return $reader.ReadToEnd()
  } finally {
    $reader.Close()
  }
}

function Write-JsonResponse {
  param($Response, [int]$StatusCode, [string]$Json)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "application/json"
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Json)
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
}

function Set-OllamaComputeEnvironment {
  param([string]$ComputeMode)
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
    [Environment]::SetEnvironmentVariable("OLLAMA_VULKAN", $null, "User")
    [Environment]::SetEnvironmentVariable("ROCR_VISIBLE_DEVICES", "-1", "User")
    [Environment]::SetEnvironmentVariable("GGML_VK_VISIBLE_DEVICES", "-1", "User")
    [Environment]::SetEnvironmentVariable("CUDA_VISIBLE_DEVICES", "-1", "User")
    [Environment]::SetEnvironmentVariable("HIP_VISIBLE_DEVICES", "-1", "User")
    [Environment]::SetEnvironmentVariable("GPU_DEVICE_ORDINAL", "-1", "User")
    Remove-Item Env:\OLLAMA_VULKAN -ErrorAction SilentlyContinue
    $env:ROCR_VISIBLE_DEVICES = "-1"
    $env:GGML_VK_VISIBLE_DEVICES = "-1"
    $env:CUDA_VISIBLE_DEVICES = "-1"
    $env:HIP_VISIBLE_DEVICES = "-1"
    $env:GPU_DEVICE_ORDINAL = "-1"
    return $mode
  }

  [Environment]::SetEnvironmentVariable("ROCR_VISIBLE_DEVICES", $null, "User")
  [Environment]::SetEnvironmentVariable("GGML_VK_VISIBLE_DEVICES", $null, "User")
  [Environment]::SetEnvironmentVariable("CUDA_VISIBLE_DEVICES", $null, "User")
  [Environment]::SetEnvironmentVariable("HIP_VISIBLE_DEVICES", $null, "User")
  [Environment]::SetEnvironmentVariable("GPU_DEVICE_ORDINAL", $null, "User")
  Remove-Item Env:\ROCR_VISIBLE_DEVICES -ErrorAction SilentlyContinue
  Remove-Item Env:\GGML_VK_VISIBLE_DEVICES -ErrorAction SilentlyContinue
  Remove-Item Env:\CUDA_VISIBLE_DEVICES -ErrorAction SilentlyContinue
  Remove-Item Env:\HIP_VISIBLE_DEVICES -ErrorAction SilentlyContinue
  Remove-Item Env:\GPU_DEVICE_ORDINAL -ErrorAction SilentlyContinue

  if ($mode -eq "gpu") {
    [Environment]::SetEnvironmentVariable("OLLAMA_VULKAN", "1", "User")
    $env:OLLAMA_VULKAN = "1"
  } else {
    [Environment]::SetEnvironmentVariable("OLLAMA_VULKAN", $null, "User")
    Remove-Item Env:\OLLAMA_VULKAN -ErrorAction SilentlyContinue
  }

  return $mode
}

function Restart-Ollama {
  param([string]$ComputeMode)
  $mode = Set-OllamaComputeEnvironment $ComputeMode
  Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  Start-Process -FilePath "ollama" -ArgumentList "serve" -WindowStyle Hidden -ErrorAction SilentlyContinue | Out-Null
  Write-BridgeLog "Ollama reiniciado pela ponte. Modo: $mode"
  return $mode
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
      Write-JsonResponse $response 200 "{""ok"":true}"
      continue
    }

    if ($request.RawUrl -eq "/sigop-compute-mode" -and $request.HttpMethod -eq "POST") {
      $body = Read-RequestBody $request
      $computeMode = "auto"
      if ($body) {
        try {
          $parsed = $body | ConvertFrom-Json
          if ($parsed.computeMode) { $computeMode = [string]$parsed.computeMode }
        } catch {}
      }
      $mode = Restart-Ollama $computeMode
      Write-JsonResponse $response 200 "{""ok"":true,""computeMode"":""$mode"",""restarted"":true}"
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

    $body = Read-RequestBody $request

    $headers = @{}
    if ($request.ContentType) {
      $headers["Content-Type"] = $request.ContentType
    }

    $invokeParams = @{
      Uri = $targetUrl
      Method = $request.HttpMethod
      UseBasicParsing = $true
    }

    if ($body -ne $null) {
      $invokeParams.Body = $body
      if ($request.ContentType) {
        $invokeParams.ContentType = $request.ContentType
      } else {
        $invokeParams.ContentType = "application/json"
      }
    }

    $isStreamingRequest = $body -and ($body -match '"stream"\s*:\s*true')
    if ($isStreamingRequest -and $request.HttpMethod -eq "POST") {
      $ollamaRequest = [System.Net.HttpWebRequest]::Create($targetUrl)
      $ollamaRequest.Method = $request.HttpMethod
      $ollamaRequest.ContentType = if ($request.ContentType) { $request.ContentType } else { "application/json" }
      $ollamaRequest.Accept = "application/x-ndjson, application/json"
      $requestBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
      $ollamaRequest.ContentLength = $requestBytes.Length
      $requestStream = $ollamaRequest.GetRequestStream()
      try {
        $requestStream.Write($requestBytes, 0, $requestBytes.Length)
      } finally {
        $requestStream.Close()
      }

      $ollamaStreamResponse = $ollamaRequest.GetResponse()
      try {
        $response.StatusCode = [int]$ollamaStreamResponse.StatusCode
        $response.ContentType = "application/x-ndjson"
        $inputStream = $ollamaStreamResponse.GetResponseStream()
        $buffer = New-Object byte[] 8192
        while (($read = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
          $response.OutputStream.Write($buffer, 0, $read)
          $response.OutputStream.Flush()
        }
      } finally {
        if ($inputStream) { $inputStream.Close() }
        $ollamaStreamResponse.Close()
      }
      continue
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
    if (($_ | Out-String) -match "tempo limite|timeout|timed out") {
      try {
        Write-BridgeLog "Timeout detectado. Encerrando processos do Ollama para parar inferencia presa."
        Get-Process ollama -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
      } catch {}
    }
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
