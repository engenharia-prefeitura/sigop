-- Add project_id to documents to link them to projects
ALTER TABLE documents ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);

-- Add file_content columns to store base64 or file data
ALTER TABLE project_documents ADD COLUMN IF NOT EXISTS file_content TEXT;
ALTER TABLE project_additives ADD COLUMN IF NOT EXISTS file_content TEXT;
ALTER TABLE project_measurements ADD COLUMN IF NOT EXISTS file_content TEXT;

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id);
