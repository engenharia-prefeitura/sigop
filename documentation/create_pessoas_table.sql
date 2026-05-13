-- Execute este comando no Editor SQL do Supabase para criar a tabela de Pessoas

-- 1. Criar tabela de pessoas
CREATE TABLE IF NOT EXISTS public.pessoas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codigo TEXT,
    nome TEXT NOT NULL,
    tipo_pessoa TEXT CHECK (tipo_pessoa IN ('Física', 'Jurídica')),
    cpf_cnpj TEXT,
    situacao TEXT CHECK (situacao IN ('Ativo', 'Inativo')),
    cadastro_incompleto BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Criar índices para busca rápida
CREATE INDEX IF NOT EXISTS idx_pessoas_codigo ON public.pessoas(codigo);
CREATE INDEX IF NOT EXISTS idx_pessoas_cpf_cnpj ON public.pessoas(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_pessoas_nome ON public.pessoas(nome);

-- 3. Habilitar RLS (Row Level Security)
ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;

-- 4. Política de leitura - todos autenticados podem ler
CREATE POLICY "Enable read access for authenticated users" 
ON public.pessoas 
FOR SELECT 
TO authenticated 
USING (true);

-- 5. Política de escrita - apenas admins podem inserir/atualizar/deletar
CREATE POLICY "Enable insert for admins only" 
ON public.pessoas 
FOR INSERT 
TO authenticated 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.is_admin = true
    )
);

CREATE POLICY "Enable update for admins only" 
ON public.pessoas 
FOR UPDATE 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.is_admin = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.is_admin = true
    )
);

CREATE POLICY "Enable delete for admins only" 
ON public.pessoas 
FOR DELETE 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.is_admin = true
    )
);

-- 6. Criar função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 7. Criar trigger para atualizar updated_at
CREATE TRIGGER update_pessoas_updated_at 
    BEFORE UPDATE ON public.pessoas 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
