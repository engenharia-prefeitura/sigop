import os

# Ler Settings.tsx
with open('d:/SIGOP COMPLETO/SIGOP DESENVOLVIMENTO/pages/Settings.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Ler funções de pessoas
with open('d:/SIGOP COMPLETO/SIGOP DESENVOLVIMENTO/documentation/PESSOAS_FUNCTIONS.txt', 'r', encoding='utf-8') as f:
    pessoas_functions = f.read()

# Inserir após linha 321 (índice 320)
insert_pos = 321

# Criar novo conteúdo
new_lines = lines[:insert_pos] + [pessoas_functions + '\r\n'] + lines[insert_pos:]

# Salvar
with open('d:/SIGOP COMPLETO/SIGOP DESENVOLVIMENTO/pages/Settings.tsx', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"✅ Funções de Pessoas adicionadas com sucesso!")
print(f"Total de linhas antes: {len(lines)}")
print(f"Total de linhas depois: {len(new_lines)}")
