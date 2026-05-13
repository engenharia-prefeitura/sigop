# Correção do Cadastro de Usuários

## Problema Identificado

Quando novos usuários são criados, alguns campos da tabela `profiles` ficavam vazios ou NULL:
- `avatar_url` → NULL
- `role_title` → string vazia
- `crea` → string vazia  
- `is_active` → deveria ser sempre `true` por padrão

## Soluções Implementadas

### 1. Atualização do Admin Worker (`scripts/admin_worker.js`)

O código foi atualizado para garantir que, após criar um usuário na auth, o perfil seja criado/atualizado com TODOS os campos necessários:

- ✅ Gera automaticamente o `avatar_url` usando o nome do usuário
- ✅ Define `is_active = true` por padrão
- ✅ Preenche campos vazios com valores padrão apropriados
- ✅ Usa `upsert` para garantir que o perfil seja criado ou atualizado

### 2. Trigger Automático no Supabase (`fix_user_profiles.sql`)

Foi criado um trigger que executa automaticamente sempre que um novo usuário é criado no auth:

**Passo a passo para aplicar:**

1. Acesse o Supabase Dashboard
2. Vá em **SQL Editor**
3. Copie e cole o conteúdo do arquivo `documentation/fix_user_profiles.sql`
4. Execute o script

**O que o trigger faz:**

- ✅ Cria automaticamente o perfil completo quando um usuário se registra
- ✅ Gera o `avatar_url` baseado no nome do usuário
- ✅ Define `is_active = true` automaticamente
- ✅ Preenche todos os campos com valores padrão apropriados
- ✅ **BONUS:** Corrige todos os usuários existentes que estão com campos NULL

## Testando

Depois de aplicar as correções:

1. Crie um novo usuário pelo sistema
2. Verifique na tabela `profiles` se todos os campos estão preenchidos:
   - `avatar_url` deve ter uma URL válida
   - `role_title`, `crea` devem ter uma string (mesmo que vazia)
   - `is_active` deve ser `true`
3. Tente fazer login com o usuário recém-criado

## Usuário Problema

O usuário `eng.susanybonin@gmail.com` foi criado antes dessas correções. Após executar o SQL, ele será corrigido automaticamente e poderá fazer login normalmente.

## Importante

⚠️ **Execute o script SQL no Supabase** antes de criar novos usuários para garantir que o trigger esteja ativo.

🔄 **Reinicie o admin_worker** após a atualização do código para que as mudanças entrem em vigor.
