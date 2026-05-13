import re

# Ler arquivo
with open('d:/SIGOP COMPLETO/SIGOP DESENVOLVIMENTO/pages/Settings.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Tentar identificar onde começa o código duplicado
# Procurar por "};  const file = event.target.files"
pattern = r'(}\s*;\s*const file = event\.target\.files)'

matches = list(re.finditer(pattern, content))

print(f"Encontradas {len(matches)} ocorrências do padrão")

for i, match in enumerate(matches):
    start = match.start()
    # Contar número da linha
    line_num = content[:start].count('\n') + 1
    print(f"Ocorrência {i+1} na linha aproximada {line_num}")
    print(f"Contexto: ...{content[max(0, start-50):start+100]}...")
    print()

# Mostrar linhas 548-555
lines = content.split('\n')
print("\n=== LINHAS 548-555 ===")
for i in range(547, min(555, len(lines))):
    print(f"{i+1}: {lines[i]}")
