# Corrigindo Usuário que Não Consegue Fazer Login

## Problema

Usuário `eng.susanybonin@gmail.com` não consegue fazer login:
- Erro: "Credenciais inválidas"
- Status 400 no endpoint de autenticação

## Causa

O usuário foi criado **antes** das correções de autenticação, e pode estar com:
- Email não confirmado
- Senha não salva corretamente
- Perfil incompleto

## Solução Rápida (Recomendada)

### Opção 1: Script Node.js

Execute o script que corrige automaticamente:

```bash
cd "e:\SIGOP COMPLETO\SIGOP DESENVOLVIMENTO"
node scripts/fix_user.js
```

**O que o script faz:**
1. ✅ Busca o usuário pelo email
2. ✅ Confirma o email automaticamente
3. ✅ Reseta a senha para `123456`
4. ✅ Mostra as credenciais atualizadas

Depois de executar, peça para o usuário fazer login com:
- **Email:** `eng.susanybonin@gmail.com`
- **Senha:** `123456`

⚠️ **IMPORTANTE:** Peça para o usuário trocar a senha após o primeiro login!

---

### Opção 2: SQL Manual no Supabase

Se preferir fazer manualmente via SQL:

1. Abra o Supabase Dashboard → SQL Editor

2. Execute este comando para confirmar o email:

```sql
UPDATE auth.users
SET 
    email_confirmed_at = NOW(),
    confirmed_at = NOW(),
    updated_at = NOW()
WHERE email = 'eng.susanybonin@gmail.com';
```

3. No Supabase Dashboard:
   - Vá em **Authentication** → **Users**
   - Encontre o usuário `eng.susanybonin@gmail.com`
   - Clique nos 3 pontinhos → **Reset Password**
   - Defina uma nova senha temporária

4. Teste o login com a nova senha

---

## Prevenindo o Problema

Para que novos usuários não tenham esse problema:

1. ✅ Execute `documentation/fix_user_profiles.sql` no Supabase (já feito)
2. ✅ Certifique-se que o `scripts/admin_worker.js` está atualizado (já feito)
3. ✅ Reinicie o admin worker se estiver rodando

## Verificando se Está Tudo OK

Execute este SQL para verificar todos os usuários:

```sql
SELECT 
    u.id,
    u.email,
    u.email_confirmed_at,
    p.is_active,
    p.full_name,
    p.avatar_url
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ORDER BY u.created_at DESC;
```

Todos devem ter:
- ✅ `email_confirmed_at` preenchido
- ✅ `is_active` = true
- ✅ `avatar_url` preenchido
