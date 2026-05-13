# Bocaina do Sul - Passo a passo

1. No Supabase novo, abra o SQL Editor.
2. Execute o arquivo [setup_new_supabase.sql](C:\Users\Eng\Desktop\SIGOP COMPLETO\SIGOP DESENVOLVIMENTO\documentation\setup_new_supabase.sql).
3. Depois rode `node scripts/seed.js` dentro de `SIGOP DESENVOLVIMENTO` para criar o primeiro usuario admin e alguns documentos de exemplo.
4. Inicie o worker administrativo com `node scripts/admin_worker.js` se quiser manter atualizacao de email/senha via fila `admin_tasks`.
5. A configuracao local ja foi preparada para o novo projeto em `.env.local`.

## O que este setup ja cobre

- `profiles`, `app_settings`, `document_types`
- `documents` com numeracao automatica
- `pessoas`
- `config_infracoes`, `config_tipos_notificacao`, `notificacoes`
- `user_agenda_events`
- `projects`, `project_field_definitions`, `project_documents`, `project_additives`, `project_measurements`
- `design_projects`, `design_project_files`, `design_project_deliveries`
- `admin_tasks`
- trigger de criacao automatica de perfil
- RPC `create_new_user`
- RPC `search_documents`
- policies com `profiles.is_admin`

## Observacoes

- O setup foi preparado para um banco novo, vazio.
- Nenhuma alteracao foi feita no Supabase do outro municipio.
- Como a `service_role key` foi usada localmente, vale rotaciona-la no fim da implantacao.
