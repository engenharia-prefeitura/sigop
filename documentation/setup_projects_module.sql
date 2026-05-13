-- Add Coordinates to Projects if they don't exist
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS longitude NUMERIC;

-- Table for Project Documents
CREATE TABLE IF NOT EXISTS public.project_documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT, -- 'Projeto', 'Edital', 'Contrato', 'Planilha', 'Outros'
    url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table for Additives (Aditivos)
CREATE TABLE IF NOT EXISTS public.project_additives (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    description TEXT,
    value NUMERIC NOT NULL DEFAULT 0,
    pdf_url TEXT,
    date DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Table for Measurements (Medições)
CREATE TABLE IF NOT EXISTS public.project_measurements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    additive_id UUID REFERENCES public.project_additives(id) ON DELETE SET NULL, -- Null implies base contract measurement
    reference_month DATE, -- 'Data da medição'
    value NUMERIC NOT NULL DEFAULT 0,
    pdf_url TEXT,
    observation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for new tables
ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_additives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_measurements ENABLE ROW LEVEL SECURITY;

-- Safely Create Policies (Drop if exists then create, or use DO block)
DO $$
BEGIN
    -- Documents Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_documents' AND policyname = 'Allow all access documents') THEN
        CREATE POLICY "Allow all access documents" ON public.project_documents FOR ALL TO authenticated USING (true);
    END IF;

    -- Additives Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_additives' AND policyname = 'Allow all access additives') THEN
        CREATE POLICY "Allow all access additives" ON public.project_additives FOR ALL TO authenticated USING (true);
    END IF;

    -- Measurements Policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_measurements' AND policyname = 'Allow all access measurements') THEN
        CREATE POLICY "Allow all access measurements" ON public.project_measurements FOR ALL TO authenticated USING (true);
    END IF;
END
$$;
