# Funcionalidade: Gerenciamento de Pessoas

## Resumo
Nova funcionalidade adicionada em Configurações para gerenciar uma base de pessoas/contatos que pode ser usada para notificações futuras.

## Implementação

### 1. Tabela no Supabase
Execute o script SQL: `documentation/create_pessoas_table.sql`

**Tabela:** `pessoas`
**Campos:**
- `id` (UUID, PK)
- `codigo` (TEXT) - Código da pessoa no sistema original
- `nome` (TEXT, NOT NULL) - Nome civil ou razão social
- `tipo_pessoa` (TEXT) - "Física" ou "Jurídica"
- `cpf_cnpj` (TEXT) - CPF ou CNPJ
- `situacao` (TEXT) - "Ativo" ou "Inativo"
- `cadastro_incompleto` (BOOLEAN) - Flag de cadastro incompleto
- `created_at`, `updated_at` (TIMESTAMP)

**Índices criados:**
- Por código
- Por CPF/CNPJ
- Por nome

**Políticas RLS:**
- Leitura: Todos usuários autenticados
- Escrita/Update/Delete: Apenas admins (verificação via `profiles.is_admin`)

### 2. Nova Aba em Configurações
**Localização:** Settings → Aba "Pessoas" (visível apenas para admins)

**Funcionalidades:**
- ✅ Importar arquivo JSON (formato do Relatorio.json)
- ✅ Visualizar todas as pessoas em tabela paginada
- ✅ Buscar por nome, CPF/CNPJ ou código
- ✅ Excluir pessoas individualmente
- ✅ Limpar toda a tabela (com confirmação dupla)
- ✅ Atualizar lista

### 3. Formato de Importação JSON
O sistema aceita JSON com a seguinte estrutura:

```json
[
  {
    "Código": "12345",
    "Nome (Civil/Razão/Social)": "FULANO DE TAL",
    "Tipo Pessoa": "Física",
    "CPF/CNPJ": "123.456.789-00",
    "Situação": "Ativo",
    "Cadastro Incompleto": "Não"
  },
  ...
]
```

**Mapeamento automático:**
- Aceita nomes de colunas em português (Relatorio.json)
- Também aceita nomes snake_case (cpf_cnpj, tipo_pessoa, etc)
- "Cadastro Incompleto": "Sim" → `true`, "Não" → `false`

**Importação em lotes:**
- Processa 100 registros por vez
- Usa `upsert` com conflito por CPF/CNPJ
- Atualiza duplicados automaticamente

### 4. Como Usar

#### Passo 1: Executar SQL
1. Acesse o painel do Supabase
2. Vá em SQL Editor
3. Cole o conteúdo de `documentation/create_pessoas_table.sql`
4. Execute

#### Passo 2: Importar Pessoas
1. Acesse Configurações → Pessoas (como admin)
2. Clique em "Importar JSON"
3. Selecione `arquivo para investigar/Relatorio.json`
4. Aguarde a importação

#### Passo 3: Verificar
- A tabela mostrará todas as pessoas importadas
- Use a busca para filtrar
- Limitado a 100 resultados visíveis (use busca para mais)

### 5. Próximos Passos (Futuro)
- [ ] Criar módulo de Notificações
- [ ] Selecionar pessoas para notificar
- [ ] Enviar notificações por email/SMS
- [ ] Histórico de notificações enviadas

## Arquivos Modificados
- `pages/Settings.tsx` - Adicionada aba Pessoas
- `documentation/create_pessoas_table.sql` - Script de criação da tabela

## Segurança
- ✅ RLS habilitado
- ✅ Apenas admins podem importar/editar/deletar
- ✅ Todos autenticados podem visualizar
- ✅ Validação de permissões no backend
