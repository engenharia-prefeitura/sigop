Set WshShell = CreateObject("WScript.Shell")
strDesktop = WshShell.SpecialFolders("Desktop")
strPath = WshShell.CurrentDirectory

' Criar atalho para o Painel de Controle (Launcher)
Set oShortcut = WshShell.CreateShortcut(strDesktop & "\SIGOP.lnk")
oShortcut.TargetPath = strPath & "\Painel_SIGOP.hta"
oShortcut.WorkingDirectory = strPath
oShortcut.Description = "Sistema de Gerenciamento de Obras Públicas"
oShortcut.IconLocation = strPath & "\utils\app.ico"
oShortcut.Save

MsgBox "Atalho 'SIGOP' criado na sua Área de Trabalho com seu ícone personalizado!", 64, "Instalação Concluída"
