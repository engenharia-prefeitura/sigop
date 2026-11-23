-- =====================================================================
-- SIGOP - Assistente IA (v2): schema, RLS e criptografia de API keys
-- Idempotente: so cria objetos novos (IF NOT EXISTS). Rodar no SQL Editor.
-- Depois: supabase secrets set AI_KEY_SECRET=<string aleatoria longa>
--   (NUNCA troque o secret depois de salvar keys, ou elas ficam ilegiveis)
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- Tabelas
create table if not exists public.user_ai_keys (
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider      text not null,
  key_encrypted bytea not null,
  key_hint      text,
  base_url      text,
  updated_at    timestamptz not null default now(),
  primary key (user_id, provider)
);

create table if not exists public.user_ai_settings (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  models           jsonb not null default '{}'::jsonb,
  default_mode     text not null default 'propose',
  privacy_accepted boolean not null default false,
  updated_at       timestamptz not null default now()
);

create table if not exists public.ai_conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  document_id uuid,
  title       text not null default '',
  messages    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists ai_conversations_user_idx
  on public.ai_conversations (user_id, updated_at desc);
create index if not exists ai_conversations_doc_idx
  on public.ai_conversations (user_id, document_id);

-- ---------------------------------------------------------------- RLS
alter table public.user_ai_keys      enable row level security;
alter table public.user_ai_settings  enable row level security;
alter table public.ai_conversations  enable row level security;

-- user_ai_keys: SEM policies para anon/authenticated => so service_role (bypassa RLS).
revoke all on public.user_ai_keys from anon, authenticated, public;
grant all on public.user_ai_keys to service_role;

revoke all on public.user_ai_settings from anon, public;
revoke all on public.ai_conversations from anon, public;
grant select, insert, update, delete on public.user_ai_settings to authenticated;
grant select, insert, update, delete on public.ai_conversations to authenticated;
grant all on public.user_ai_settings, public.ai_conversations to service_role;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_ai_settings' and policyname='user_ai_settings_own') then
    create policy user_ai_settings_own on public.user_ai_settings
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ai_conversations' and policyname='ai_conversations_own') then
    create policy ai_conversations_own on public.ai_conversations
      for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()));
  end if;
end $$;

-- ---------------------------------------------------------------- Funcoes de criptografia
create or replace function public.ai_save_key(
  p_user uuid, p_provider text, p_key text, p_hint text, p_base_url text, p_secret text
) returns void
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if p_secret is null or length(p_secret) < 16 then
    raise exception 'invalid secret';
  end if;
  insert into public.user_ai_keys (user_id, provider, key_encrypted, key_hint, base_url, updated_at)
  values (p_user, p_provider, pgp_sym_encrypt(p_key, p_secret), p_hint, p_base_url, now())
  on conflict (user_id, provider) do update
    set key_encrypted = excluded.key_encrypted,
        key_hint      = excluded.key_hint,
        base_url      = excluded.base_url,
        updated_at    = now();
end;
$$;

create or replace function public.ai_get_key(
  p_user uuid, p_provider text, p_secret text
) returns text
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_enc bytea;
begin
  select key_encrypted into v_enc
    from public.user_ai_keys
   where user_id = p_user and provider = p_provider;
  if v_enc is null then
    return null;
  end if;
  return pgp_sym_decrypt(v_enc, p_secret);
end;
$$;

revoke all on function public.ai_save_key(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.ai_get_key(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ai_save_key(uuid, text, text, text, text, text) to service_role;
grant execute on function public.ai_get_key(uuid, text, text) to service_role;
