-- SIGOP - Controle global do Assistente IA
-- Execute este script uma vez no SQL Editor do Supabase.

ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS ai_assistant_enabled BOOLEAN DEFAULT true NOT NULL;

UPDATE public.app_settings
SET ai_assistant_enabled = true
WHERE ai_assistant_enabled IS NULL;

COMMENT ON COLUMN public.app_settings.ai_assistant_enabled IS
'Controla se o Assistente IA fica visivel para os usuarios do SIGOP.';
