# Planejamento: Arquivo Tecnico Inteligente

## Objetivo

Criar uma area de organizacao central para o setor de engenharia, capaz de reunir documentos, notificacoes, obras, pessoas, anexos, medicoes e historicos em um fluxo unico.

A ideia principal e:

```text
Tudo que o setor faz entra em um dossie.
Tudo que entra em um dossie aparece tambem em pastas automaticas.
Nada fica solto ou aleatorio.
```

## Nome Sugerido

```text
Arquivo Tecnico
```

Ou, para uma comunicacao mais completa:

```text
Arquivo Tecnico Inteligente
```

## Pilares Do Recurso

1. Dossie da Obra
2. Dossie da Pessoa
3. Pastas Inteligentes
4. Busca Geral
5. Linha do Tempo
6. Dossie Exportavel em PDF

## Dossie Da Obra

Cada obra deve ter uma tela de historico completo, reunindo automaticamente tudo que estiver vinculado a ela.

Exemplo de abas:

```text
Resumo
Historico
Documentos
Medicoes
Fiscalizacao
Anexos
```

Itens que devem aparecer:

- documentos tecnicos;
- vistorias;
- relatorios fotograficos;
- notificacoes;
- pareceres;
- oficios;
- projetos;
- medicoes;
- aditivos;
- fotos;
- anexos;
- eventos de agenda.

## Dossie Da Pessoa

Cada pessoa cadastrada deve ter uma visao de historico.

Exemplo:

```text
Pessoa: Joao da Silva
CPF/CNPJ: xxx

Historico:
- notificacoes recebidas;
- vistorias relacionadas;
- documentos emitidos;
- obras vinculadas;
- locais associados.
```

Objetivo: facilitar fiscalizacao e atendimento quando uma pessoa retorna ao setor.

## Pastas Inteligentes

As pastas nao devem ser manuais no primeiro momento. Elas devem ser geradas automaticamente com base nos dados do sistema.

Exemplo global:

```text
Arquivo Tecnico
  2026
    Obras
      Em andamento
      Finalizadas
      Paralisadas
    Documentos Tecnicos
      Vistorias
      Laudos
      Pareceres
      Oficios
      Relatorios
    Fiscalizacao
      Notificacoes
      Interdicoes
      Intimacoes
    Pessoas
      Notificados
      Proprietarios
    Pendencias
      Aguardando assinatura
      Aguardando ciencia
      Prazos vencidos
```

Exemplo dentro de uma obra:

```text
Obra: Pavimentacao Rua X
  Documentos
    Vistorias
    Relatorios
    Pareceres
    Oficios
  Fiscalizacao
    Notificacoes
    Autos de Interdicao
  Financeiro
    Medicoes
    Aditivos
  Arquivos
    Projetos
    Fotos
    PDFs
```

## Regras De Organizacao Automatica

Cada item pode aparecer em varias pastas inteligentes sem duplicar o dado.

Exemplo: uma notificacao vinculada a obra e pessoa deve aparecer em:

```text
Arquivo Tecnico > 2026 > Fiscalizacao > Notificacoes
Dossie da Obra > Fiscalizacao > Notificacoes
Dossie da Pessoa > Notificacoes
Pendencias > Aguardando ciencia
```

Critérios de classificacao:

- ano;
- tipo de documento;
- obra vinculada;
- pessoa vinculada;
- status;
- responsavel;
- prazo;
- origem.

## Busca Geral

Criar busca unificada por:

- numero;
- pessoa;
- CPF/CNPJ;
- obra;
- local;
- tipo;
- responsavel;
- status;
- palavra no texto/conteudo.

Resultado esperado:

```text
Notificacao 004/2026 - Joao da Silva
Vistoria 012/2026 - Rua X
Relatorio Fotografico - Pavimentacao Rua X
Medicao 03 - Contrato 014/2026
```

## Linha Do Tempo

### Linha Do Tempo Da Obra

```text
12/05/2026
Notificacao NOT-004/2026 emitida

08/05/2026
Vistoria VIS-012/2026 realizada

02/05/2026
Relatorio fotografico anexado

30/04/2026
Medicao adicionada
```

### Linha Do Tempo Da Pessoa

```text
12/05/2026
Recebeu Notificacao NOT-004/2026

20/03/2026
Consta em vistoria tecnica

05/02/2026
Cadastrada no sistema
```

## Modelo De Dados Sugerido

### Vinculos importantes

Adicionar ou confirmar:

```text
documents.project_id
documents.pessoa_id
notificacoes.project_id
notificacoes.pessoa_id
project_documents.project_id
project_measurements.project_id
project_additives.project_id
```

### Tabela de linha do tempo opcional

Uma tabela central pode facilitar consultas e historico:

```text
project_timeline_events
```

Campos sugeridos:

```text
id
project_id
person_id
event_type
title
description
related_table
related_id
event_date
created_by
created_at
```

Essa tabela pode ser preenchida automaticamente quando documentos, notificacoes, medicoes, aditivos e anexos forem criados.

## Fases De Implementacao

### Fase 1: Vinculos

- adicionar `project_id` em `notificacoes`;
- adicionar `pessoa_id` opcional em `documents`, se fizer sentido;
- ajustar formularios para permitir vincular notificacao/documento a obra;
- garantir que documentos tecnicos possam ser filtrados por obra.

### Fase 2: Historico Da Obra

- criar aba `Historico` dentro da obra;
- listar documentos vinculados;
- listar notificacoes vinculadas;
- listar medicoes;
- listar aditivos;
- listar anexos;
- ordenar por data.

### Fase 3: Arquivo Tecnico

- criar nova aba global `Arquivo Tecnico`;
- incluir busca geral;
- incluir filtros por ano, tipo, status, obra, pessoa e responsavel;
- criar visao de pastas inteligentes;
- criar lista unificada.

### Fase 4: Dossie Exportavel

- botao `Gerar Dossie PDF`;
- incluir dados da obra;
- incluir linha do tempo;
- incluir documentos;
- incluir notificacoes;
- incluir medicoes;
- incluir aditivos;
- incluir anexos principais.

## Beneficios Esperados

- reduzir documentos soltos;
- facilitar encontrar historico por obra;
- facilitar encontrar historico por pessoa;
- melhorar atendimento ao cidadao;
- melhorar fiscalizacao;
- melhorar prestacao de contas;
- permitir consulta por ano e tipo;
- reduzir dependencia de memoria individual dos servidores;
- transformar o sistema em acervo tecnico oficial do setor.

## Observacao De Produto

Evitar, no primeiro momento, sistema de pastas manuais com arrastar e soltar. Isso pode gerar retrabalho e bagunca.

Priorizar pastas inteligentes automaticas, baseadas nos dados ja existentes.

