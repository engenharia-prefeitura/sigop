-- Função que cria automaticamente o perfil quando um novo usuário se registra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  full_name_value TEXT;
  first_name TEXT;
  last_name TEXT;
  name_parts TEXT[];
  avatar_url_value TEXT;
BEGIN
  -- Extrai o nome completo do metadata
  full_name_value := COALESCE(NEW.raw_user_meta_data->>'full_name', '');
  
  -- Gera o avatar_url automaticamente
  IF full_name_value != '' THEN
    name_parts := string_to_array(full_name_value, ' ');
    first_name := name_parts[1];
    last_name := CASE 
      WHEN array_length(name_parts, 1) > 1 
      THEN name_parts[array_length(name_parts, 1)]
      ELSE first_name
    END;
    avatar_url_value := 'https://ui-avatars.com/api/?name=' || 
                        first_name || '+' || last_name || 
                        '&background=0D8ABC&color=fff';
  ELSE
    avatar_url_value := 'https://ui-avatars.com/api/?name=User&background=0D8ABC&color=fff';
  END IF;

  -- Insere ou atualiza o perfil
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
  VALUES (
    NEW.id,
    NEW.email,
    full_name_value,
    avatar_url_value,
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    COALESCE(NEW.raw_user_meta_data->>'role_title', ''),
    COALESCE(NEW.raw_user_meta_data->>'crea', ''),
    COALESCE((NEW.raw_user_meta_data->>'is_admin')::BOOLEAN, false),
    true, -- is_active sempre inicia como true
    NULL, -- signature_url inicia como NULL
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    role = EXCLUDED.role,
    role_title = EXCLUDED.role_title,
    crea = EXCLUDED.crea,
    is_admin = EXCLUDED.is_admin,
    is_active = true,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- Remove o trigger antigo se existir
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Cria o trigger que executa a função sempre que um novo usuário é criado
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- Script para corrigir usuários existentes que estão com campos vazios
UPDATE public.profiles 
SET 
  avatar_url = CASE 
    WHEN avatar_url IS NULL OR avatar_url = '' THEN
      CASE 
        WHEN full_name IS NOT NULL AND full_name != '' THEN
          'https://ui-avatars.com/api/?name=' || 
          SPLIT_PART(full_name, ' ', 1) || '+' || 
          CASE 
            WHEN array_length(string_to_array(full_name, ' '), 1) > 1 
            THEN (string_to_array(full_name, ' '))[array_length(string_to_array(full_name, ' '), 1)]
            ELSE SPLIT_PART(full_name, ' ', 1)
          END ||
          '&background=0D8ABC&color=fff'
        ELSE 
          'https://ui-avatars.com/api/?name=' || REPLACE(email, ' ', '+') || '&background=0D8ABC&color=fff'
      END
    ELSE avatar_url
  END,
  role_title = COALESCE(role_title, ''),
  crea = COALESCE(crea, ''),
  is_active = COALESCE(is_active, true),
  updated_at = NOW()
WHERE avatar_url IS NULL 
   OR role_title IS NULL 
   OR crea IS NULL 
   OR is_active IS NULL;
