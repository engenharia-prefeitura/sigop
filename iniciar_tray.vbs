
Set objShell = CreateObject("WScript.Shell")
' Executa o PowerShell de forma oculta (-WindowStyle Hidden)
objShell.Run "powershell.exe -WindowStyle Hidden -ExecutionPolicy Bypass -File tray_sigop.ps1", 0, False
