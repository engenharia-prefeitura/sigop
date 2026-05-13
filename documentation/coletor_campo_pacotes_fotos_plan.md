# Planejamento: Coletor de Campo e Pacotes Temporarios de Fotos

## Objetivo

Criar um modulo simples para uso em celular durante vistorias, fiscalizacoes e atividades em area rural.

O objetivo nao e levar o SIGOP inteiro para modo offline. A primeira versao deve resolver a dor principal:

```text
coletar fotos no celular, em pacotes organizados, mesmo sem internet,
e depois transferir para o SIGOP online com facilidade.
```

## Conceito

O recurso funcionaria como um coletor de fotos em campo.

Fluxo resumido:

```text
1. Usuario faz login com internet.
2. App libera o Coletor de Campo no celular.
3. Usuario cria um ou varios pacotes de fotos.
4. Cada pacote recebe um nome.
5. Usuario tira fotos mesmo sem internet.
6. Fotos ficam salvas localmente no celular.
7. Ao voltar internet, usuario sincroniza os pacotes.
8. No SIGOP online, os pacotes aparecem para uso em documentos, notificacoes, vistorias ou obras.
9. Ao usar fotos em um documento, o sistema copia essas fotos para o destino definitivo.
10. Depois de um prazo, o pacote temporario expira e e removido para liberar armazenamento.
```

## Nome Do Recurso

Sugestoes:

```text
Coletor de Campo
Pacotes de Campo
Pacotes de Fotos
Fotos de Campo
```

Nome recomendado:

```text
Coletor de Campo
```

## Principio Mais Importante

Pacotes de campo sao temporarios.

Documentos oficiais nao devem depender deles.

Quando uma foto do pacote for usada em documento, vistoria, notificacao ou obra, essa foto deve ser copiada para o armazenamento definitivo do registro.

Assim:

```text
Se o pacote temporario for removido depois, o documento continua funcionando.
```

## Fluxo No Celular

### Primeiro Acesso

Com internet:

```text
1. Abrir SIGOP no celular.
2. Fazer login.
3. Acessar Coletor de Campo.
4. App salva permissao/local de trabalho no aparelho.
```

Depois disso, pode trabalhar sem internet.

### Criar Pacote

O usuario informa:

```text
Nome do pacote
Observacao opcional
Obra opcional, se disponivel offline
Pessoa opcional, se disponivel offline
Local opcional
```

Exemplos:

```text
Vistoria Ponte Rio Canoas
Fiscalizacao Rua Sao Jose
Habite-se Joao Silva
Obra Escola Municipal - Medicao 03
```

### Tirar Fotos

Dentro do pacote:

```text
[Tirar foto]
[Adicionar da galeria]
```

Cada foto pode ter:

```text
legenda opcional
data/hora automatica
ordem
GPS opcional
status local/enviada
```

### Multiplos Pacotes

O usuario pode ter varios pacotes no celular:

```text
Pacotes locais
- Vistoria Ponte Rio Canoas
  18 fotos
  Pendente de envio

- Escola Municipal
  23 fotos
  Pendente de envio

- Rua Sao Jose
  7 fotos
  Enviado
```

## Fluxo De Sincronizacao

Quando a internet voltar:

```text
1. Usuario abre Coletor de Campo.
2. Clica em Sincronizar.
3. Sistema envia pacote e fotos.
4. Fotos vao para storage temporario.
5. Pacote aparece no SIGOP online.
6. Celular marca pacote como enviado.
```

Status possiveis:

```text
local
pendente de envio
enviando
recebido
usado parcialmente
usado
expirado
erro
arquivado
```

## Fluxo No SIGOP Online

Criar uma tela:

```text
Pacotes de Campo
```

Ela deve mostrar:

```text
Recebidos
Pendentes de uso
Usados parcialmente
Usados
Expirando
Expirados
Arquivados
```

Exemplo:

```text
Pacote: Vistoria Ponte Rio Canoas
Fotos: 18
Criado por: Denny
Recebido em: 12/05/2026
Expira em: 12/06/2026
Status: Pendente de uso

[Abrir] [Usar em documento] [Vincular a obra] [Arquivar]
```

## Uso Das Fotos Em Documentos

Quando o usuario escolhe fotos do pacote para usar em um documento:

```text
1. Usuario seleciona as fotos.
2. Sistema copia as fotos para o local definitivo do documento.
3. Documento passa a apontar para as copias definitivas.
4. Pacote registra que aquelas fotos foram usadas.
```

Exemplo:

```text
field-photos-temp/pacote-123/foto-1.jpg
```

Ao usar em vistoria:

```text
document-images/documents/documento-456/foto-1.jpg
```

O documento deve usar a URL definitiva:

```text
document-images/documents/documento-456/foto-1.jpg
```

Nao deve usar a URL temporaria do pacote.

## Prazo De Validade Dos Pacotes

Regra sugerida:

```text
Pacotes ficam disponiveis por 30 dias apos sincronizados.
```

Campos:

```text
uploaded_at
expires_at
deleted_at
```

Ao sincronizar:

```text
expires_at = uploaded_at + 30 dias
```

## Avisos De Expiracao

Na tela de pacotes:

```text
Expira em 10 dias
Expira em 3 dias
Expira hoje
Expirado
```

Possiveis alertas:

```text
Pacotes expirando nesta semana
Pacotes com fotos ainda nao utilizadas
```

## Limpeza Automatica

Depois do prazo:

```text
1. Pacote deixa de aparecer para uso normal.
2. Fotos temporarias sao apagadas do storage temporario.
3. Registro do pacote pode ficar como historico leve, sem arquivos.
4. Armazenamento e liberado.
```

Importante:

```text
Fotos ja copiadas para documentos nao devem ser apagadas.
```

## Politica De Exclusao

Ao expirar:

```text
field_photo_package_items.photo_url temporaria pode ser apagada.
field_photo_package_items pode manter metadados.
field_photo_packages.status = expirado.
field_photo_packages.deleted_at = data da limpeza.
```

Opcional:

```text
Apagar completamente metadados apos 6 meses.
```

## Storage

Criar bucket temporario:

```text
field-photos-temp
```

Criar ou reutilizar bucket definitivo:

```text
document-images
```

Regra:

```text
field-photos-temp = armazenamento temporario dos pacotes
document-images = armazenamento definitivo de documentos, notificacoes e vistorias
```

## Modelo De Dados Sugerido

### field_photo_packages

```text
id uuid
title text not null
description text
created_by uuid references auth.users(id)
project_id uuid null
pessoa_id uuid null
local_text text
status text
photo_count integer default 0
used_photo_count integer default 0
created_at timestamptz
uploaded_at timestamptz
expires_at timestamptz
deleted_at timestamptz
device_id text
```

### field_photo_package_items

```text
id uuid
package_id uuid references field_photo_packages(id)
temp_photo_path text
temp_photo_url text
caption text
taken_at timestamptz
latitude numeric
longitude numeric
order_index integer
used_at timestamptz
used_in_table text
used_in_id uuid
copied_photo_path text
created_at timestamptz
deleted_at timestamptz
```

## Banco Local No Celular

Usar IndexedDB.

Recomendacao:

```text
Dexie.js
```

Tabelas locais:

```text
local_photo_packages
local_photo_items
sync_queue
auth_cache
```

## Captura De Fotos No Celular

Usar:

```html
<input type="file" accept="image/*" capture="environment">
```

Tambem permitir:

```text
Adicionar da galeria
```

## Compressao

Antes de salvar/enviar:

```text
comprimir imagem
limitar tamanho maximo
manter qualidade suficiente para relatorio
```

Sugestao:

```text
largura maxima: 1600px ou 1920px
qualidade: 0.75 a 0.85
```

## Geolocalizacao Opcional

Se permitido pelo usuario:

```text
latitude
longitude
data/hora
```

Isso ajuda a comprovar local da vistoria.

## Permissoes

Somente usuarios autenticados devem:

- criar pacotes;
- sincronizar fotos;
- ver seus pacotes;
- usar pacotes em documentos.

Admins podem ver todos.

## Regras De Uso

1. Pacote e temporario.
2. Documento nunca depende do pacote.
3. Usar foto = copiar para destino definitivo.
4. Expiracao remove apenas arquivos temporarios.
5. Pacote deve avisar antes de expirar.
6. Usuario deve conseguir baixar/usar antes do prazo.

## Fases De Implementacao

### Fase 1: Online Simples

Criar tela online de Pacotes de Campo:

- criar pacote;
- subir varias fotos;
- listar pacotes;
- usar fotos em documento;
- copiar fotos para destino definitivo.

### Fase 2: Celular Com Cache Local

- instalar como PWA;
- criar pacote no celular;
- tirar fotos;
- salvar localmente;
- listar pacotes locais;
- sincronizar manualmente.

### Fase 3: Expiracao E Limpeza

- campo `expires_at`;
- avisos de expiracao;
- job/rotina para apagar fotos temporarias;
- status `expirado`;
- garantir que documentos continuam com fotos copiadas.

### Fase 4: Vinculos

- vincular pacote a obra;
- vincular pacote a pessoa;
- vincular pacote a notificacao;
- criar documento a partir de pacote.

### Fase 5: Melhorias De Campo

- GPS;
- legenda por foto;
- reordenar fotos;
- marcar foto como principal;
- sincronizacao automatica quando voltar internet;
- retry em caso de falha.

## MVP Recomendado

Primeira entrega recomendada:

```text
Pacotes de Campo online + upload em lote + usar em documento com copia definitiva
```

Segunda entrega:

```text
Modo celular offline para criar pacote e sincronizar depois
```

Motivo:

```text
Primeiro validar o fluxo de pacotes e copia definitiva.
Depois adicionar offline local.
```

## Beneficios Esperados

- fotos de campo deixam de ficar perdidas na galeria do celular;
- usuario organiza por pacote antes de voltar ao escritorio;
- escritorio recebe fotos ja separadas por vistoria/local;
- documentos nao quebram quando pacotes expirarem;
- armazenamento temporario e liberado automaticamente;
- sistema fica muito mais util em area rural sem exigir offline completo.

