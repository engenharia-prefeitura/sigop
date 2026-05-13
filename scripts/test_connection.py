import os
from pathlib import Path
import requests


def parse_env_file(file_path: Path):
    env = {}
    if not file_path.exists():
        return env

    for raw_line in file_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip().strip('"').strip("'")
    return env


ROOT_DIR = Path(__file__).resolve().parents[1]
FILE_ENV = parse_env_file(ROOT_DIR / ".env.local")

SUPABASE_URL = os.getenv("SUPABASE_URL") or FILE_ENV.get("SUPABASE_URL") or FILE_ENV.get("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY") or FILE_ENV.get("SUPABASE_ANON_KEY") or FILE_ENV.get("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL/VITE_SUPABASE_URL ou SUPABASE_ANON_KEY/VITE_SUPABASE_ANON_KEY nao encontrados no .env.local")

print(f"Testando conexao com: {SUPABASE_URL}")

headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}"
}

try:
    resp = requests.get(f"{SUPABASE_URL}/auth/v1/health")
    print(f"Health Check Status: {resp.status_code}")
except Exception as e:
    print(f"Health Check Falhou: {e}")

try:
    resp = requests.get(f"{SUPABASE_URL}/rest/v1/app_settings?select=count", headers=headers)
    print(f"API Query Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"Erro detalhado: {resp.text}")
    else:
        print("SUCESSO: Chave valida e banco acessivel!")
except Exception as e:
    print(f"API Query Falhou: {e}")
