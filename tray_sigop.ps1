
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$notifyIcon = New-Object System.Windows.Forms.NotifyIcon
if (Test-Path "app.ico") {
    $notifyIcon.Icon = New-Object System.Drawing.Icon("app.ico")
}
else {
    $notifyIcon.Icon = [System.Drawing.Icon]::ExtractAssociatedIcon("C:\Windows\System32\shell32.dll")
}
$notifyIcon.Text = "SIGOP - Servidor Ativo"
$notifyIcon.Visible = $true

$contextMenu = New-Object System.Windows.Forms.ContextMenu
$openItem = New-Object System.Windows.Forms.MenuItem("Abrir Painel SIGOP")
$sep = New-Object System.Windows.Forms.MenuItem("-")
$exitItem = New-Object System.Windows.Forms.MenuItem("Encerrar Servidor e Sair")

$openItem.add_Click({
        Start-Process "Painel_SIGOP.hta"
    })

$exitItem.add_Click({
        Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
        $notifyIcon.Visible = $false
        [System.Windows.Forms.Application]::Exit()
        Exit
    })

$contextMenu.MenuItems.Add($openItem)
$contextMenu.MenuItems.Add($sep)
$contextMenu.MenuItems.Add($exitItem)
$notifyIcon.ContextMenu = $contextMenu

# Mantem o script rodando em background
[System.Windows.Forms.Application]::Run()
