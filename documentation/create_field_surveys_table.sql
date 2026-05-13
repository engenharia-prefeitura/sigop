-- Levantamentos de campo sincronizados pelo PWA/offline
-- Rode este script no Supabase SQL Editor antes de usar a sincronizacao remota.

CREATE TABLE IF NOT EXISTS public.field_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    local_id TEXT NOT NULL UNIQUE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
    user_email TEXT,
    title TEXT NOT NULL,
    status TEXT DEFAULT 'synced',
    document_type_id UUID REFERENCES public.document_types(id) ON DELETE SET NULL,
    document_type_name TEXT DEFAULT 'Levantamento de Campo',
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_name TEXT,
    event_date DATE,
    location TEXT,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    generated_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    generated_notification_id UUID REFERENCES public.notificacoes(id) ON DELETE SET NULL,
    archived_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_field_surveys_user_created ON public.field_surveys(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_surveys_project ON public.field_surveys(project_id);
CREATE INDEX IF NOT EXISTS idx_field_surveys_status ON public.field_surveys(status);

ALTER TABLE public.field_surveys ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.field_surveys ADD COLUMN IF NOT EXISTS generated_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL;
ALTER TABLE public.field_surveys ADD COLUMN IF NOT EXISTS generated_notification_id UUID REFERENCES public.notificacoes(id) ON DELETE SET NULL;

ALTER TABLE public.field_surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "field_surveys_select_own" ON public.field_surveys;
CREATE POLICY "field_surveys_select_own"
ON public.field_surveys FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "field_surveys_insert_own" ON public.field_surveys;
CREATE POLICY "field_surveys_insert_own"
ON public.field_surveys FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "field_surveys_update_own" ON public.field_surveys;
CREATE POLICY "field_surveys_update_own"
ON public.field_surveys FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "field_surveys_delete_own" ON public.field_surveys;
CREATE POLICY "field_surveys_delete_own"
ON public.field_surveys FOR DELETE
TO authenticated
USING (user_id = auth.uid());
