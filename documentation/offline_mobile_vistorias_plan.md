# Planejamento: Modo Offline e Uso em Celular Para Vistorias

## Objetivo

Permitir que o SIGOP funcione em campo, principalmente em areas rurais ou locais sem internet, usando celular, tablet ou notebook.

O sistema deve permitir:

- abrir o app no celular;
- iniciar uma vistoria sem internet;
- preencher formulario;
- anexar fotos;
- registrar data, hora e local;
- salvar tudo localmente;
- sincronizar automaticamente quando a internet voltar;
- evitar perda de dados.

## Conceito Principal

Transformar o sistema em um PWA:

```text
Progressive Web App
```

Na pratica, isso permite que o usuario instale o sistema no celular como se fosse um aplicativo, sem precisar publicar inicialmente na Play Store.

## Experiencia Esperada Para O Usuario

1. Usuario acessa o site do SIGOP no celular.
2. Instala o app na tela inicial.
3. Antes de sair para campo, faz login com internet.
4. O app baixa dados essenciais.
5. Em area sem internet, o usuario cria vistoria normalmente.
6. Fotos e formularios ficam salvos no aparelho.
7. Ao voltar a ter internet, o app sincroniza.
8. O sistema mostra quais itens foram enviados e quais ainda estao pendentes.

## O Que Deve Funcionar Offline

### Prioridade 1

- criar vistoria;
- preencher texto;
- selecionar tipo de documento;
- vincular a obra, se ja estiver baixada;
- vincular pessoa, se ja estiver baixada;
- anexar fotos;
- salvar rascunho local;
- editar rascunho local;
- ver fila de sincronizacao.

### Prioridade 2

- criar notificacao offline;
- selecionar infracoes previamente baixadas;
- selecionar pessoa previamente baixada;
- registrar local da infracao;
- anexar fotos;
- salvar para sincronizar depois.

### Prioridade 3

- criar pessoa offline;
- criar obra offline;
- registrar coordenada GPS;
- gerar PDF offline, se tecnicamente viavel.

## O Que Nao Deve Funcionar Offline No Inicio

Para evitar complexidade excessiva:

- assinatura digital com validacao de senha;
- criacao de usuarios;
- exclusao definitiva;
- sincronizacao de arquivos muito grandes sem controle;
- edicao simultanea complexa do mesmo documento em varios dispositivos.

## Arquitetura Recomendada

### 1. PWA

Adicionar:

```text
manifest.json
service worker
cache de assets
icone do app
tela instalavel
detector de online/offline
```

### 2. Banco Local

Usar IndexedDB no navegador/celular.

Opcoes:

```text
Dexie.js
localForage
IndexedDB direto
```

Recomendacao:

```text
Dexie.js
```

Motivo: facilita salvar objetos grandes, fotos, filas e consultas locais.

### 3. Fila De Sincronizacao

Criar uma fila local:

```text
sync_queue
```

Campos sugeridos:

```text
id
entity_type
operation
local_id
remote_id
payload
attachments
status
attempts
last_error
created_at
updated_at
synced_at
```

Exemplo:

```text
entity_type: document
operation: create
status: pending
```

### 4. IDs Locais

Quando offline, criar IDs temporarios:

```text
local_abc123
```

Ao sincronizar, o Supabase retorna o UUID real.

O app precisa mapear:

```text
local_id -> remote_id
```

### 5. Fotos Offline

Fotos devem ser salvas localmente em IndexedDB como:

```text
Blob
base64 temporario
metadata
```

Ao sincronizar:

1. enviar imagem para Supabase Storage;
2. receber URL publica ou path;
3. atualizar documento/notificacao com o link final;
4. marcar item como sincronizado.

## Fluxo De Sincronizacao

### Criar Vistoria Offline

```text
Usuario preenche vistoria
App salva em IndexedDB
App salva fotos em IndexedDB
App adiciona item na sync_queue
Tela mostra "Pendente de envio"
```

### Quando Internet Voltar

```text
App detecta online
App processa sync_queue
Envia fotos para Storage
Cria registro no Supabase
Atualiza IDs locais
Marca como sincronizado
Mostra confirmacao
```

### Se Der Erro

```text
Status: erro
Guardar mensagem
Permitir tentar novamente
Permitir editar antes de reenviar
```

## Tela Necessaria: Central De Sincronizacao

Criar uma tela ou painel:

```text
Sincronizacao
```

Ela deve mostrar:

```text
Online / Offline
Pendentes
Enviando
Sincronizados
Com erro
```

Exemplo:

```text
3 vistorias pendentes
12 fotos pendentes
1 notificacao com erro
Ultima sincronizacao: 12/05/2026 14:32
```

## Cuidados Com Dados

### Evitar Perda

- nunca apagar rascunho local antes de confirmar sucesso remoto;
- manter copia local por alguns dias apos sincronizar;
- mostrar alerta se houver pendencias antes de sair/logoff;
- permitir exportar pacote local de emergencia no futuro.

### Conflitos

No inicio, regra simples:

```text
Documento criado offline pertence ao usuario que criou.
Se ainda nao sincronizou, so existe localmente.
Depois de sincronizar, vira documento normal.
```

Para edicoes de documentos ja existentes:

```text
Bloquear edicao offline de documento remoto no inicio
ou permitir somente se o usuario baixar e "reservar" antes
```

## Dados Que Devem Ser Baixados Antes Da Vistoria

Modo "Preparar para Campo":

```text
Baixar:
- tipos de documentos;
- configuracoes;
- usuarios/responsaveis;
- obras ativas;
- pessoas recentes ou selecionadas;
- modelos de notificacao;
- infracoes configuradas;
```

O usuario poderia selecionar:

```text
Preparar obra X para campo
```

E o app baixa:

- dados da obra;
- documentos recentes;
- pessoas relacionadas;
- anexos principais;
- modelos necessarios.

## Uso No Celular

### Ajustes De Interface

Criar telas responsivas para:

- formulario de vistoria;
- upload/captura de fotos;
- lista de pendencias;
- busca de pessoa/obra;
- assinatura/confirmacao quando online;
- status de sincronizacao.

### Captura De Fotos

Usar input:

```html
<input type="file" accept="image/*" capture="environment">
```

Isso abre a camera traseira no celular.

### Geolocalizacao

Opcional, mas muito util:

```text
registrar latitude/longitude da vistoria
registrar data/hora da captura
```

## Supabase

Continuar usando Supabase como backend online.

Precisara garantir:

- policies permitem criar registros autenticados;
- Storage aceita upload das fotos;
- tabelas tem campos para status/sincronizacao, se necessario;
- colunas para coordenadas em vistorias/notificacoes, se forem usadas.

## Tabelas Locais Sugeridas

No IndexedDB:

```text
local_documents
local_notifications
local_photos
local_people_cache
local_projects_cache
sync_queue
settings_cache
```

## Tabelas Remotas Possiveis

No Supabase, talvez adicionar:

```text
offline_created
offline_device_id
synced_at
local_reference_id
latitude
longitude
```

Mas evitar excesso no inicio.

## Fases De Implementacao

### Fase 1: Preparar PWA

- adicionar manifest;
- adicionar service worker;
- cachear assets do app;
- mostrar status online/offline;
- permitir instalar no celular.

### Fase 2: Rascunho Offline De Vistoria

- salvar rascunho local em IndexedDB;
- salvar fotos localmente;
- permitir reabrir rascunho;
- nao sincronizar ainda automaticamente.

### Fase 3: Fila De Sincronizacao

- criar sync_queue;
- criar processo de envio;
- enviar fotos para Storage;
- criar documento no Supabase;
- marcar como sincronizado.

### Fase 4: Preparar Para Campo

- baixar obras selecionadas;
- baixar pessoas selecionadas/recentes;
- baixar configuracoes e modelos;
- permitir trabalhar sem internet com esses dados.

### Fase 5: Notificacoes Offline

- permitir criar notificacao offline;
- vincular pessoa/obra baixada;
- salvar fotos;
- sincronizar depois.

### Fase 6: Melhorias

- geolocalizacao;
- fila com retry automatico;
- painel de conflitos;
- exportacao de emergencia;
- assinatura online apos sincronizacao.

## Riscos

- armazenamento do celular pode lotar com muitas fotos;
- usuario pode trocar de celular antes de sincronizar;
- base64 aumenta o tamanho das imagens;
- conflitos podem surgir se varios usuarios editarem o mesmo item;
- app pode ser fechado antes da sincronizacao terminar.

## Mitigacoes

- comprimir imagens antes de salvar;
- limitar quantidade/tamanho de fotos por vistoria;
- mostrar pendencias claramente;
- manter copia local ate confirmar sincronizacao;
- permitir tentar novamente;
- orientar usuario a sincronizar ao voltar para internet.

## Recomendacao De Produto

Comecar pequeno:

```text
PWA + rascunho offline de vistoria + fotos + sincronizacao manual
```

Depois evoluir para:

```text
notificacoes offline
preparar obra para campo
geolocalizacao
fila automatica
```

## Resultado Esperado

O SIGOP deixa de ser um sistema apenas de escritorio e passa a funcionar como ferramenta de campo.

O usuario pode ir a area rural, registrar vistoria, tirar fotos, voltar para internet e sincronizar tudo sem perder informacao.

