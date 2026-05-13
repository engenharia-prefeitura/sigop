-- Execute este comando no Editor SQL do Supabase para corrigir o erro de permissão

-- 1. Remove políticas antigas que possam estar bloqueando
DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."app_settings";
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON "public"."app_settings";
DROP POLICY IF EXISTS "Enable update for users based on email" ON "public"."app_settings";
DROP POLICY IF EXISTS "Allow all for authenticated" ON "public"."app_settings";

-- 2. Habilita RLS (Row Level Security)
ALTER TABLE "public"."app_settings" ENABLE ROW LEVEL SECURITY;

-- 3. Cria uma política permissiva para LEITURA (Qualquer um pode ler as configurações)
CREATE POLICY "Public Read Access" 
ON "public"."app_settings" 
FOR SELECT 
USING (true);

-- 4. Cria uma política para ATUALIZAÇÃO e INSERÇÃO
-- Permite que qualquer usuário autenticado (logado) altere as configurações.
-- Se preferir restringir apenas para admins, altere 'auth.role() = 'authenticated'' para a checagem de admin.
CREATE POLICY "Authenticated Update Access" 
ON "public"."app_settings" 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Dica: Se ainda der erro, verifique se seu usuário está realmente autenticado no frontend.
