#!/usr/bin/env python3
"""
Script para limpar e corrigir o arquivo Relatorio.json
Remove caracteres inválidos e gera um JSON válido.
"""

import json
import re
import sys

def clean_json_file(input_path, output_path):
    print(f"Lendo arquivo: {input_path}")
    
    with open(input_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    print(f"Tamanho original: {len(content)} caracteres")
    
    # Limpeza agressiva
    print("Limpando caracteres inválidos...")
    
    # 1. Remover caracteres de controle (exceto tabs e newlines que são válidos)
    content = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]', '', content)
    
    # 2. Corrigir escape sequences inválidas comum em exports mal feitos
    # Remove backslashes antes de caracteres que não precisam de escape
    content = re.sub(r'\\([^"\\\/bfnrtu])', r'\1', content)
    
    # 3. Normalizar quebras de linha
    content = content.replace('\r\n', '\n').replace('\r', '\n')
    
    print(f"Tamanho após limpeza: {len(content)} caracteres")
    
    # Tentar parsear
    try:
        print("Tentando converter para JSON...")
        data = json.loads(content)
        print(f"✓ JSON válido! {len(data)} registros encontrados.")
    except json.JSONDecodeError as e:
        print(f"✗ Erro no JSON na posição {e.pos}: {e.msg}")
        print(f"Contexto: ...{content[max(0, e.pos-50):e.pos+50]}...")
        
        # Tentar abordagem manual: extrair objetos individuais
        print("\nTentando recuperação manual...")
        objects = re.findall(r'\{[^}]+\}', content)
        print(f"Encontrados {len(objects)} objetos potenciais")
        
        data = []
        for i, obj_str in enumerate(objects):
            try:
                obj = json.loads(obj_str)
                data.append(obj)
            except:
                if i < 5:  # Mostrar apenas os 5 primeiros erros
                    print(f"  Objeto {i} inválido: {obj_str[:50]}...")
        
        print(f"✓ Recuperados {len(data)} objetos válidos")
    
    # Salvar arquivo limpo
    print(f"\nSalvando em: {output_path}")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    
    print(f"✓ Arquivo salvo com sucesso!")
    print(f"  Registros: {len(data)}")
    
    # Mostrar exemplo do primeiro registro
    if data:
        print("\nExemplo do primeiro registro:")
        print(json.dumps(data[0], ensure_ascii=False, indent=2))

if __name__ == '__main__':
    input_file = 'd:/SIGOP COMPLETO/arquivo para investigar/Relatorio.json'
    output_file = 'd:/SIGOP COMPLETO/arquivo para investigar/Relatorio_limpo.json'
    
    try:
        clean_json_file(input_file, output_file)
        print("\n✅ Processo concluído!")
        print(f"\nAgora use o arquivo: {output_file}")
    except Exception as e:
        print(f"\n❌ Erro: {e}")
        sys.exit(1)
