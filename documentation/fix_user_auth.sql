-- Script para verificar e corrigir usuários com problemas de autenticação

-- 1. Verifica quais usuários existem na auth mas estão sem email confirmado
SELECT 
    id,
    email,
    email_confirmed_at,
    created_at,
    raw_user_meta_data
FROM auth.users
WHERE email_confirmed_at IS NULL
ORDER BY created_at DESC;

-- 2. Confirma o email de TODOS os usuários que ainda não foram confirmados
-- (Execute isso para o usuário problema poder fazer login)
UPDATE auth.users
SET 
    email_confirmed_at = NOW(),
    confirmed_at = NOW(),
    updated_at = NOW()
WHERE email_confirmed_at IS NULL;

-- 3. Verifica se o perfil está correto
SELECT 
    p.id,
    p.email,
    p.full_name,
    p.avatar_url,
    p.is_active,
    p.role,
    a.email as auth_email,
    a.email_confirmed_at
FROM public.profiles p
LEFT JOIN auth.users a ON a.id = p.id
WHERE p.email LIKE '%susany%' OR a.email LIKE '%susany%';

-- 4. Se o usuário existir na auth mas não existir no profiles, cria o perfil
INSERT INTO public.profiles (
    id,
    email,
    full_name,
    avatar_url,
    role,
    role_title,
    crea,
    is_admin,
    is_active,
    signature_url,
    created_at,
    updated_at
)
SELECT 
    u.id,
    u.email,
    COALESCE(u.raw_user_meta_data->>'full_name', ''),
    'https://ui-avatars.com/api/?name=' || 
    COALESCE(
        SPLIT_PART(u.raw_user_meta_data->>'full_name', ' ', 1),
        'User'
    ) || '+' || 
    COALESCE(
        CASE 
            WHEN array_length(string_to_array(u.raw_user_meta_data->>'full_name', ' '), 1) > 1 
            THEN (string_to_array(u.raw_user_meta_data->>'full_name', ' '))[array_length(string_to_array(u.raw_user_meta_data->>'full_name', ' '), 1)]
            ELSE SPLIT_PART(u.raw_user_meta_data->>'full_name', ' ', 1)
        END,
        'User'
    ) || '&background=0D8ABC&color=fff',
    COALESCE(u.raw_user_meta_data->>'role', 'user'),
    COALESCE(u.raw_user_meta_data->>'role_title', ''),
    COALESCE(u.raw_user_meta_data->>'crea', ''),
    COALESCE((u.raw_user_meta_data->>'is_admin')::BOOLEAN, false),
    true,
    NULL,
    u.created_at,
    NOW()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;
