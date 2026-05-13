-- Atualizacao do Banco de Projetos: fluxo Projeto / Obra e suporte a Paralisado
-- Execute no SQL Editor do Supabase se o banco ja existir.

ALTER TABLE public.design_projects
ADD COLUMN IF NOT EXISTS previous_status TEXT;

ALTER TABLE public.design_projects
ADD COLUMN IF NOT EXISTS pause_reason TEXT;

-- Valores de status usados pelo SIGOP:
-- demanded, in_progress, under_review, tendered, in_construction, paused, completed
-- O valor antigo delivered continua sendo tratado pela interface como completed.
