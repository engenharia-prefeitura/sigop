# Publicacao no GitHub Pages

## Secrets necessarios

No repositorio GitHub, cadastrar em `Settings > Secrets and variables > Actions > New repository secret`:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Use:

```text
VITE_SUPABASE_URL = URL do projeto Supabase
VITE_SUPABASE_ANON_KEY = publishable key do Supabase
```

Nao cadastrar chaves secretas, service role, secret keys ou URL direta do banco.

## Pages

Em `Settings > Pages`, selecionar:

```text
Source: GitHub Actions
```

O deploy e feito pelo workflow `.github/workflows/deploy-pages.yml`.

## Supabase Auth

Depois que o GitHub Pages gerar a URL, adicionar no Supabase:

```text
Authentication > URL Configuration
```

Exemplo para um repositorio chamado `sigop`:

```text
Site URL:
https://SEU_USUARIO.github.io/sigop/

Redirect URLs:
https://SEU_USUARIO.github.io/sigop/**
```
