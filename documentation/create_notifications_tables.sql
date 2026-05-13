-- 1. Tabela de Modelos de Infracoes (Biblioteca)
CREATE TABLE IF NOT EXISTS config_infracoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    titulo TEXT NOT NULL,
    descricao TEXT,
    fundamentacao TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabela de Notificacoes
CREATE TABLE IF NOT EXISTS notificacoes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    numero_sequencial SERIAL,
    pessoa_id UUID REFERENCES pessoas(id),
    loc_infracao TEXT,
    observacoes TEXT,
    prazo_dias INTEGER DEFAULT 15,
    infracoes_json JSONB DEFAULT '[]'::jsonb,
    fotos_json JSONB DEFAULT '[]'::jsonb,
    numero_sequencial_ano INTEGER,
    label_formatada TEXT,
    usuario_id UUID REFERENCES profiles(id) DEFAULT auth.uid(),
    co_author_id UUID REFERENCES profiles(id),
    multa_valor DECIMAL(10,2) DEFAULT 0.00,
    data_emissao TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE config_infracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos autenticados leem infracoes" ON config_infracoes;
DROP POLICY IF EXISTS "Admin gerencia infracoes" ON config_infracoes;
DROP POLICY IF EXISTS "Todos autenticados criam notificacoes" ON notificacoes;
DROP POLICY IF EXISTS "Todos autenticados leem notificacoes" ON notificacoes;
DROP POLICY IF EXISTS "Usuario ou Admin deleta notificacao" ON notificacoes;

CREATE POLICY "Todos autenticados leem infracoes" ON config_infracoes
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Admin gerencia infracoes" ON config_infracoes
FOR ALL
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

CREATE POLICY "Todos autenticados criam notificacoes" ON notificacoes
FOR INSERT
TO authenticated
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Todos autenticados leem notificacoes" ON notificacoes
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Usuario ou Admin deleta notificacao" ON notificacoes
FOR DELETE
TO authenticated
USING (
    auth.uid() = usuario_id OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE profiles.id = auth.uid()
        AND profiles.is_admin = true
    )
);
