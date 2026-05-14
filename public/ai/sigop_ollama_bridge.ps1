$ErrorActionPreference = "Stop"

$listenUrl = "http://localhost:11435/"
$ollamaBaseUrl = "http://127.0.0.1:11434"

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

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $request = $context.Request
  $response = $context.Response
  Add-CorsHeaders $response $request

  try {
    if ($request.HttpMethod -eq "OPTIONS") {
      $response.StatusCode = 204
      $response.Close()
      continue
    }

    if (-not $request.RawUrl.StartsWith("/api/")) {
      $response.StatusCode = 404
      $bytes = [System.Text.Encoding]::UTF8.GetBytes("SIGOP Ollama bridge")
      $response.OutputStream.Write($bytes, 0, $bytes.Length)
      $response.Close()
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
    $response.StatusCode = 502
    $response.ContentType = "application/json"
    $message = ($_ | Out-String).Replace("\", "\\").Replace('"', '\"').Replace("`r", "").Replace("`n", "\n")
    $bytes = [System.Text.Encoding]::UTF8.GetBytes("{""error"":""$message""}")
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
  } finally {
    $response.Close()
  }
}
