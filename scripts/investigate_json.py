import json

# Ler o arquivo
with open('d:/SIGOP COMPLETO/arquivo para investigar/Relatorio_limpo.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print(f"Total de registros: {len(data)}\n")

# Mostrar chaves do primeiro objeto
print("Chaves do primeiro objeto:")
print(list(data[0].keys()))
print()

# Mostrar primeiros 3 objetos
for i in range(min(3, len(data))):
    print(f"--- Objeto {i+1} ---")
    print(json.dumps(data[i], ensure_ascii=False, indent=2))
    print()

# Verificar se as chaves estão corrompidas
print("\n=== ANÁLISE DAS CHAVES ===")
for key in data[0].keys():
    print(f"'{key}' -> bytes: {key.encode('utf-8')[:50]}")
