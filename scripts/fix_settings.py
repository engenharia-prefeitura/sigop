import re

# Ler arquivo
with open('d:/SIGOP COMPLETO/SIGOP DESENVOLVIMENTO/pages/Settings.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"Total de linhas: {len(lines)}")

# Encontrar e deletar todo o código órfão a partir da linha 551
# até encontrar "const handleDeletePessoa"

start_delete = 550  # Linha 551 em índice 0-based
end_delete = None

for i in range(start_delete, len(lines)):
    if 'const handleDeletePessoa' in lines[i]:
        end_delete = i
        break

if end_delete:
    print(f"Encontrado handleDeletePessoa na linha {end_delete + 1}")
    print(f"Deletando linhas {start_delete + 1} a {end_delete}")
    
    # Criar novo conteúdo
    new_lines = lines[:start_delete] + lines[end_delete:]
    
    # Salvar
    with open('d:/SIGOP COMPLETO/SIGOP DESENVOLVIMENTO/pages/Settings.tsx', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    
    print(f"✅ Arquivo corrigido! Removidas {end_delete - start_delete} linhas")
    print(f"Novo total de linhas: {len(new_lines)}")
else:
    print("❌ Não encontrou handleDeletePessoa")
