# Inserir UI de Pessoas no Settings.tsx

# Ler arquivos
with open('d:/SIGOP COMPLETO/SIGOP DESENVOLVIMENTO/pages/Settings.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

with open('d:/SIGOP COMPLETO/SIGOP DESENVOLVIMENTO/documentation/PESSOAS_UI.txt', 'r', encoding='utf-8') as f:
    pessoas_ui = f.read()

# Inserir antes da linha 683 (fechamento do div principal)
insert_pos = 682

# Criar novo conteúdo
new_lines = lines[:insert_pos] + [pessoas_ui + '\r\n'] + lines[insert_pos:]

# Salvar
with open('d:/SIGOP COMPLETO/SIGOP DESENVOLVIMENTO/pages/Settings.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"✅ UI de Pessoas adicionada com sucesso!")
print(f"Total de linhas antes: {len(lines)}")
print(f"Total de linhas depois: {len(new_lines)}")
