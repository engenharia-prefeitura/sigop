import json
import sys

# Ler apenas os primeiros objetos do arquivo original
arquivo = 'd:/SIGOP COMPLETO/arquivo para investigar/Relatorio.json'

print(f"Investigando: {arquivo}\n")

try:
    with open(arquivo, 'r', encoding='utf-8', errors='ignore') as f:
        # Ler só um pedaço para análise rápida
        content = f.read(50000)  # Primeiros 50KB
        
    # Tentar encontrar o primeiro objeto
    import re
    objects = re.findall(r'\{[^}]+\}', content)
    
    if objects:
        print(f"Encontrados {len(objects)} objetos nos primeiros 50KB\n")
        
        # Tentar parsear os primeiros
        for i, obj_str in enumerate(objects[:3]):
            try:
                obj = json.loads(obj_str)
                print(f"--- Objeto {i+1} ---")
                print("Chaves:")
                for key, value in obj.items():
                    print(f"  '{key}' = '{value}'")
                print()
            except:
                print(f"Objeto {i+1}: Não foi possível parsear")
                print(f"String: {obj_str[:100]}...\n")
    else:
        print("Nenhum objeto encontrado")
        print(f"Primeiros 500 caracteres:\n{content[:500]}")
        
except Exception as e:
    print(f"Erro: {e}")
    sys.exit(1)
