-- Create Design Projects (Demandas de Projeto)
CREATE TABLE IF NOT EXISTS design_projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    requester TEXT NOT NULL, -- "Prefeito", "Secretaria X"
    status TEXT NOT NULL DEFAULT 'demanded', -- demanded, in_progress, completed, delivered
    priority TEXT DEFAULT 'normal', -- low, normal, high, urgent
    start_date DATE,
    deadline DATE,
    execution_order INTEGER DEFAULT 0,
    previous_status TEXT,
    pause_reason TEXT,
    responsible_id UUID REFERENCES auth.users(id), -- Quem está cuidando
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Store Files for Design Projects (PDFs)
CREATE TABLE IF NOT EXISTS design_project_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    design_project_id UUID REFERENCES design_projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    file_url TEXT,
    file_content TEXT, -- Base64 fallback if storage not used
    uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Delivery Protocols (Comprovante de Entrega)
CREATE TABLE IF NOT EXISTS design_project_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    design_project_id UUID REFERENCES design_projects(id) ON DELETE CASCADE,
    delivered_to TEXT NOT NULL, -- "Secretário Fulano"
    delivered_at TIMESTAMPTZ DEFAULT NOW(),
    observation TEXT,
    responsible_id UUID REFERENCES auth.users(id) -- Quem entregou
);

-- Enable RLS (simplified for now, allow authenticated)
ALTER TABLE design_projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated access" ON design_projects FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE design_project_files ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated access" ON design_project_files FOR ALL USING (auth.role() = 'authenticated');

ALTER TABLE design_project_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated access" ON design_project_deliveries FOR ALL USING (auth.role() = 'authenticated');
