-- 1. Tabela de Tipos de Notificação (Notificação, Embargo, Interdição)
CREATE TABLE IF NOT EXISTS config_tipos_notificacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,                     -- Ex: Notificação, Embargo, Interdição
    texto_padrao TEXT NOT NULL,             -- O texto longo que descreve a ação
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Atualizar a Tabela de Notificações com Status de Assinatura e Tipo
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS tipo_id UUID REFERENCES config_tipos_notificacao(id);
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS texto_padrao_customizado TEXT;
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'; -- draft, awaiting_signature, finished
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS author_signed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE notificacoes ADD COLUMN IF NOT EXISTS co_author_signed_at TIMESTAMP WITH TIME ZONE;

-- 3. Habilitar RLS e Políticas (Limpando as antigas)
ALTER TABLE config_tipos_notificacao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos autenticados gerenciam tipos" ON config_tipos_notificacao;
CREATE POLICY "Todos autenticados gerenciam tipos" ON config_tipos_notificacao FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Todos autenticados gerenciam infrações" ON config_infracoes;
CREATE POLICY "Todos autenticados gerenciam infrações" ON config_infracoes FOR ALL USING (auth.role() = 'authenticated');

-- 4. Notificar PostgREST
NOTIFY pgrst, 'reload schema';
