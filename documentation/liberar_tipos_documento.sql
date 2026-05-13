-- Script para permitir que usuários comuns gerenciem tipos de documentos

-- 1. Remover políticas antigas se existirem (para evitar conflitos)
DROP POLICY IF EXISTS "Allow select for all authenticated" ON public.document_types;
DROP POLICY IF EXISTS "Allow insert for all authenticated" ON public.document_types;
DROP POLICY IF EXISTS "Allow update for all authenticated" ON public.document_types;
DROP POLICY IF EXISTS "Allow delete for all authenticated" ON public.document_types;
DROP POLICY IF EXISTS "Enable all access for admins only" ON public.document_types;
DROP POLICY IF EXISTS "Users can view document types" ON public.document_types;
DROP POLICY IF EXISTS "Admins can manage document types" ON public.document_types;


-- 2. Criar novas políticas que permitem acesso a qualquer usuário autenticado
-- (Isso libera para usuários comuns além de administradores)

-- Permitir leitura para todos os logados
CREATE POLICY "Users can view document types" 
ON public.document_types FOR SELECT 
TO authenticated 
USING (true);

-- Permitir inserção para todos os logados
CREATE POLICY "Users can create document types" 
ON public.document_types FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Permitir atualização para todos os logados
CREATE POLICY "Users can update document types" 
ON public.document_types FOR UPDATE 
TO authenticated 
USING (true);

-- Permitir exclusão para todos os logados
CREATE POLICY "Users can delete document types" 
ON public.document_types FOR DELETE 
TO authenticated 
USING (true);

-- 3. Garantir que as permissões de tabela (GRANT) estão corretas
GRANT ALL ON public.document_types TO authenticated;
GRANT ALL ON public.document_types TO service_role;
