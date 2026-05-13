-- SIGOP - Setup inicial para novo projeto Supabase
-- Base preparado para nova instalacao do municipio de Bocaina do Sul

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- PERFIS E CONFIGURACOES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE,
    full_name TEXT DEFAULT '',
    avatar_url TEXT,
    role TEXT DEFAULT 'user',
    role_title TEXT DEFAULT '',
    crea TEXT DEFAULT '',
    is_admin BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    signature_url TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT DEFAULT '',
    header_text TEXT DEFAULT '',
    company_logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.document_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- PESSOAS
CREATE TABLE IF NOT EXISTS public.pessoas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo TEXT,
    nome TEXT NOT NULL,
    tipo_pessoa TEXT CHECK (tipo_pessoa IN ('Fisica', 'Juridica')),
    cpf_cnpj TEXT,
    endereco TEXT,
    situacao TEXT CHECK (situacao IN ('Ativo', 'Inativo')),
    cadastro_incompleto BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pessoas_codigo ON public.pessoas(codigo);
CREATE INDEX IF NOT EXISTS idx_pessoas_cpf_cnpj ON public.pessoas(cpf_cnpj);
CREATE INDEX IF NOT EXISTS idx_pessoas_nome ON public.pessoas(nome);

-- DOCUMENTOS TECNICOS
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    document_type_id UUID REFERENCES public.document_types(id) ON DELETE SET NULL,
    type TEXT DEFAULT 'Geral',
    content JSONB DEFAULT '{"sections":[]}'::jsonb,
    status TEXT DEFAULT 'draft',
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    co_author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    author_signed_at TIMESTAMPTZ,
    co_author_signed_at TIMESTAMPTZ,
    event_date DATE,
    photos_per_page INTEGER DEFAULT 4,
    document_number INTEGER,
    formatted_number TEXT,
    project_id UUID,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_project_id ON public.documents(project_id);

-- FISCALIZACAO
CREATE TABLE IF NOT EXISTS public.config_infracoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descricao TEXT,
    fundamentacao TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.config_tipos_notificacao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL UNIQUE,
    texto_padrao TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.notificacoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    numero_sequencial BIGSERIAL,
    numero_sequencial_ano INTEGER,
    label_formatada TEXT,
    pessoa_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL,
    tipo_id UUID REFERENCES public.config_tipos_notificacao(id) ON DELETE SET NULL,
    texto_padrao_customizado TEXT,
    loc_infracao TEXT,
    observacoes TEXT,
    prazo_dias INTEGER DEFAULT 15,
    infracoes_json JSONB DEFAULT '[]'::jsonb,
    fotos_json JSONB DEFAULT '[]'::jsonb,
    multa_valor NUMERIC(10, 2) DEFAULT 0.00,
    status TEXT DEFAULT 'draft',
    usuario_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
    co_author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    author_signed_at TIMESTAMPTZ,
    co_author_signed_at TIMESTAMPTZ,
    data_ciencia DATE,
    entrega_obs TEXT,
    entrega_foto TEXT,
    is_cancelled BOOLEAN DEFAULT false,
    data_emissao TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notificacoes_data_emissao ON public.notificacoes(data_emissao DESC);

-- AGENDA
CREATE TABLE IF NOT EXISTS public.user_agenda_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    is_all_day BOOLEAN DEFAULT false,
    category TEXT DEFAULT 'meeting',
    reminder_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agenda_user_time ON public.user_agenda_events(user_id, start_time);

-- OBRAS
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    budget NUMERIC(14, 2) DEFAULT 0,
    location TEXT,
    latitude NUMERIC,
    longitude NUMERIC,
    custom_data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.documents
    ADD CONSTRAINT documents_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.project_field_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    label TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'text',
    required BOOLEAN DEFAULT false,
    mask TEXT,
    validation_rules JSONB DEFAULT '{}'::jsonb,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT,
    url TEXT,
    file_content TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_additives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    description TEXT,
    value NUMERIC(14, 2) NOT NULL DEFAULT 0,
    pdf_url TEXT,
    file_content TEXT,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.project_measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    additive_id UUID REFERENCES public.project_additives(id) ON DELETE SET NULL,
    reference_month DATE,
    value NUMERIC(14, 2) NOT NULL DEFAULT 0,
    pdf_url TEXT,
    file_content TEXT,
    observation TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- DEMANDAS DE PROJETO
CREATE TABLE IF NOT EXISTS public.design_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    requester TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'demanded',
    priority TEXT DEFAULT 'normal',
    start_date DATE,
    deadline DATE,
    responsible_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    execution_order INTEGER DEFAULT 0,
    previous_status TEXT,
    pause_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.design_project_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_project_id UUID REFERENCES public.design_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    file_url TEXT,
    file_content TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.design_project_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_project_id UUID REFERENCES public.design_projects(id) ON DELETE CASCADE,
    delivered_to TEXT NOT NULL,
    delivered_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    observation TEXT,
    responsible_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- FILA ADMINISTRATIVA
CREATE TABLE IF NOT EXISTS public.admin_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_type TEXT NOT NULL,
    payload JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'pending',
    result TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_tasks_status ON public.admin_tasks(status, created_at);

-- TRIGGERS DE UPDATED_AT
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_app_settings_updated_at ON public.app_settings;
CREATE TRIGGER set_app_settings_updated_at BEFORE UPDATE ON public.app_settings
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_document_types_updated_at ON public.document_types;
CREATE TRIGGER set_document_types_updated_at BEFORE UPDATE ON public.document_types
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_pessoas_updated_at ON public.pessoas;
CREATE TRIGGER set_pessoas_updated_at BEFORE UPDATE ON public.pessoas
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_documents_updated_at ON public.documents;
CREATE TRIGGER set_documents_updated_at BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_config_infracoes_updated_at ON public.config_infracoes;
CREATE TRIGGER set_config_infracoes_updated_at BEFORE UPDATE ON public.config_infracoes
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_config_tipos_notificacao_updated_at ON public.config_tipos_notificacao;
CREATE TRIGGER set_config_tipos_notificacao_updated_at BEFORE UPDATE ON public.config_tipos_notificacao
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_notificacoes_updated_at ON public.notificacoes;
CREATE TRIGGER set_notificacoes_updated_at BEFORE UPDATE ON public.notificacoes
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_user_agenda_events_updated_at ON public.user_agenda_events;
CREATE TRIGGER set_user_agenda_events_updated_at BEFORE UPDATE ON public.user_agenda_events
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_projects_updated_at ON public.projects;
CREATE TRIGGER set_projects_updated_at BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_project_field_definitions_updated_at ON public.project_field_definitions;
CREATE TRIGGER set_project_field_definitions_updated_at BEFORE UPDATE ON public.project_field_definitions
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_project_documents_updated_at ON public.project_documents;
CREATE TRIGGER set_project_documents_updated_at BEFORE UPDATE ON public.project_documents
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_project_additives_updated_at ON public.project_additives;
CREATE TRIGGER set_project_additives_updated_at BEFORE UPDATE ON public.project_additives
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_project_measurements_updated_at ON public.project_measurements;
CREATE TRIGGER set_project_measurements_updated_at BEFORE UPDATE ON public.project_measurements
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_design_projects_updated_at ON public.design_projects;
CREATE TRIGGER set_design_projects_updated_at BEFORE UPDATE ON public.design_projects
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

DROP TRIGGER IF EXISTS set_admin_tasks_updated_at ON public.admin_tasks;
CREATE TRIGGER set_admin_tasks_updated_at BEFORE UPDATE ON public.admin_tasks
FOR EACH ROW EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- PERFIL AUTOMATICO AO CRIAR USUARIO
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
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
    full_name_value := COALESCE(NEW.raw_user_meta_data->>'full_name', '');

    IF full_name_value <> '' THEN
        name_parts := string_to_array(full_name_value, ' ');
        first_name := name_parts[1];
        last_name := CASE
            WHEN array_length(name_parts, 1) > 1 THEN name_parts[array_length(name_parts, 1)]
            ELSE first_name
        END;
        avatar_url_value := 'https://ui-avatars.com/api/?name=' ||
            first_name || '+' || last_name || '&background=0D8ABC&color=fff';
    ELSE
        avatar_url_value := 'https://ui-avatars.com/api/?name=User&background=0D8ABC&color=fff';
    END IF;

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
        true,
        NULL,
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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- NUMERACAO AUTOMATICA DE DOCUMENTOS
CREATE OR REPLACE FUNCTION public.assign_document_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    doc_year INTEGER;
    next_number INTEGER;
BEGIN
    IF NEW.document_number IS NOT NULL AND NEW.formatted_number IS NOT NULL THEN
        RETURN NEW;
    END IF;

    doc_year := EXTRACT(YEAR FROM COALESCE(NEW.event_date, CURRENT_DATE));

    SELECT COALESCE(MAX(document_number), 0) + 1
    INTO next_number
    FROM public.documents
    WHERE EXTRACT(YEAR FROM COALESCE(event_date, created_at::date)) = doc_year;

    NEW.document_number := COALESCE(NEW.document_number, next_number);
    NEW.formatted_number := COALESCE(NEW.formatted_number, LPAD(NEW.document_number::TEXT, 3, '0') || '/' || doc_year::TEXT);

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_assign_number ON public.documents;
CREATE TRIGGER documents_assign_number
BEFORE INSERT ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.assign_document_number();

-- BUSCA DE DOCUMENTOS
CREATE OR REPLACE FUNCTION public.search_documents(search_query TEXT)
RETURNS SETOF public.documents
LANGUAGE sql
STABLE
AS $$
    SELECT *
    FROM public.documents
    WHERE
        title ILIKE '%' || search_query || '%'
        OR COALESCE(description, '') ILIKE '%' || search_query || '%'
        OR COALESCE(type, '') ILIKE '%' || search_query || '%'
        OR COALESCE(formatted_number, '') ILIKE '%' || search_query || '%'
    ORDER BY updated_at DESC NULLS LAST, created_at DESC;
$$;

-- RPC PARA CRIAR USUARIO DIRETAMENTE PELO APP
CREATE OR REPLACE FUNCTION public.create_new_user(
    p_email TEXT,
    p_password TEXT,
    p_full_name TEXT,
    p_role_title TEXT DEFAULT '',
    p_crea TEXT DEFAULT '',
    p_is_admin BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_user_id UUID := gen_random_uuid();
BEGIN
    INSERT INTO auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at
    )
    VALUES (
        '00000000-0000-0000-0000-000000000000',
        new_user_id,
        'authenticated',
        'authenticated',
        p_email,
        crypt(p_password, gen_salt('bf')),
        NOW(),
        NOW(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object(
            'full_name', p_full_name,
            'role', 'user',
            'role_title', COALESCE(p_role_title, ''),
            'crea', COALESCE(p_crea, ''),
            'is_admin', COALESCE(p_is_admin, false)
        ),
        NOW(),
        NOW()
    );

    RETURN new_user_id;
END;
$$;

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_infracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_tipos_notificacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_agenda_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_additives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_project_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_tasks ENABLE ROW LEVEL SECURITY;

-- POLICIES: PROFILES
DROP POLICY IF EXISTS "profiles_select_authenticated" ON public.profiles;
CREATE POLICY "profiles_select_authenticated" ON public.profiles
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "profiles_update_self_or_admin" ON public.profiles;
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles
FOR UPDATE TO authenticated
USING (
    auth.uid() = id OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_admin = true
    )
)
WITH CHECK (
    auth.uid() = id OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_admin = true
    )
);

DROP POLICY IF EXISTS "profiles_insert_admin_only" ON public.profiles;
CREATE POLICY "profiles_insert_admin_only" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_admin = true
    )
);

-- POLICIES: APP SETTINGS
DROP POLICY IF EXISTS "app_settings_public_read" ON public.app_settings;
CREATE POLICY "app_settings_public_read" ON public.app_settings
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "app_settings_authenticated_manage" ON public.app_settings;
CREATE POLICY "app_settings_authenticated_manage" ON public.app_settings
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- POLICIES: DOCUMENT TYPES
DROP POLICY IF EXISTS "document_types_authenticated_manage" ON public.document_types;
CREATE POLICY "document_types_authenticated_manage" ON public.document_types
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- POLICIES: PESSOAS
DROP POLICY IF EXISTS "pessoas_select_authenticated" ON public.pessoas;
CREATE POLICY "pessoas_select_authenticated" ON public.pessoas
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "pessoas_admin_manage" ON public.pessoas;
CREATE POLICY "pessoas_admin_manage" ON public.pessoas
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_admin = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_admin = true
    )
);

-- POLICIES: DOCUMENTS
DROP POLICY IF EXISTS "documents_authenticated_manage" ON public.documents;
CREATE POLICY "documents_authenticated_manage" ON public.documents
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- POLICIES: CONFIGS FISCALIZACAO
DROP POLICY IF EXISTS "config_infracoes_select_authenticated" ON public.config_infracoes;
CREATE POLICY "config_infracoes_select_authenticated" ON public.config_infracoes
FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "config_infracoes_admin_manage" ON public.config_infracoes;
CREATE POLICY "config_infracoes_admin_manage" ON public.config_infracoes
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_admin = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_admin = true
    )
);

DROP POLICY IF EXISTS "config_tipos_notificacao_authenticated_manage" ON public.config_tipos_notificacao;
CREATE POLICY "config_tipos_notificacao_authenticated_manage" ON public.config_tipos_notificacao
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- POLICIES: NOTIFICACOES
DROP POLICY IF EXISTS "notificacoes_authenticated_manage" ON public.notificacoes;
CREATE POLICY "notificacoes_authenticated_manage" ON public.notificacoes
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- POLICIES: AGENDA
DROP POLICY IF EXISTS "agenda_own_events" ON public.user_agenda_events;
CREATE POLICY "agenda_own_events" ON public.user_agenda_events
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- POLICIES: OBRAS E RELACIONADAS
DROP POLICY IF EXISTS "projects_authenticated_manage" ON public.projects;
CREATE POLICY "projects_authenticated_manage" ON public.projects
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "project_field_definitions_authenticated_manage" ON public.project_field_definitions;
CREATE POLICY "project_field_definitions_authenticated_manage" ON public.project_field_definitions
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "project_documents_authenticated_manage" ON public.project_documents;
CREATE POLICY "project_documents_authenticated_manage" ON public.project_documents
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "project_additives_authenticated_manage" ON public.project_additives;
CREATE POLICY "project_additives_authenticated_manage" ON public.project_additives
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "project_measurements_authenticated_manage" ON public.project_measurements;
CREATE POLICY "project_measurements_authenticated_manage" ON public.project_measurements
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- POLICIES: DEMANDAS DE PROJETO
DROP POLICY IF EXISTS "design_projects_authenticated_manage" ON public.design_projects;
CREATE POLICY "design_projects_authenticated_manage" ON public.design_projects
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "design_project_files_authenticated_manage" ON public.design_project_files;
CREATE POLICY "design_project_files_authenticated_manage" ON public.design_project_files
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "design_project_deliveries_authenticated_manage" ON public.design_project_deliveries;
CREATE POLICY "design_project_deliveries_authenticated_manage" ON public.design_project_deliveries
FOR ALL TO authenticated
USING (true)
WITH CHECK (true);

-- POLICIES: FILA ADMIN
DROP POLICY IF EXISTS "admin_tasks_admin_manage" ON public.admin_tasks;
CREATE POLICY "admin_tasks_admin_manage" ON public.admin_tasks
FOR ALL TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_admin = true
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.is_admin = true
    )
);

GRANT ALL ON public.document_types TO authenticated;
GRANT ALL ON public.document_types TO service_role;
GRANT ALL ON public.app_settings TO authenticated;
GRANT ALL ON public.admin_tasks TO authenticated;

INSERT INTO public.app_settings (company_name, header_text)
SELECT 'Prefeitura Municipal de Bocaina do Sul', 'Secretaria Municipal de Administracao e Financas'
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings);

NOTIFY pgrst, 'reload schema';
