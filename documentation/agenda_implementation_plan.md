# Planejamento: Agenda do Usuário e Notificações

## 1. Visão Geral
Implementar um sistema de **Agenda Pessoal** integrado perfeitamente ao cabeçalho da aplicação. Ao clicar no perfil do usuário, um painel lateral (estilo "Drawer") se abrirá, contendo o calendário mensal e a lista de compromissos do dia.

O sistema também contará com **Notificações Ativas**, alertando o usuário sobre compromissos próximos mesmo que ele esteja em outra tela do sistema.

## 2. Banco de Dados (Supabase)
Criaremos uma nova tabela `user_agenda_events`:

```sql
CREATE TABLE user_agenda_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  title text NOT NULL,
  description text,
  start_time timestamp with time zone NOT NULL,
  end_time timestamp with time zone,
  is_all_day boolean DEFAULT false,
  category text DEFAULT 'meeting', -- 'meeting', 'deadline', 'personal', 'site_visit'
  created_at timestamp with time zone DEFAULT now(),
  reminder_sent boolean DEFAULT false
);

-- Índices para performance
CREATE INDEX idx_agenda_user_time ON user_agenda_events(user_id, start_time);
```

## 3. Interface do Usuário (UI)

### A. Ponto de Acesso (Header)
O componente `Header.tsx` será atualizado. A área do perfil do usuário se tornará um botão interativo.
- **Visual:** Adicionar um indicador sutil (badge) caso haja compromissos no dia.
- **Ação:** Clique no avatar/nome abre o `AgendaDrawer`.

### B. Painel da Agenda (AgendaDrawer)
Um painel deslizante da direita para a esquerda (off-canvas).
- **Cabeçalho:** "Minha Agenda", data atual, saudação "Bom dia, [Nome]".
- **Esquerda (Desktop):** Calendário mensal para navegação rápida entre dias.
- **Direita (Desktop) / Centro (Mobile):** Timeline vertical dos compromissos do dia selecionado.
- **Criação:** Botão flutuante (+) ou formulário inline no topo da lista para adicionar eventos rapidamente ("Reunião às 14h").

### C. Visualização de Eventos
Cada card de evento terá:
- Faixa de cor baseada na categoria (Reunião: Roxo, Visita: Laranja, Prazo: Vermelho).
- Horário de início e fim.
- Título e descrição encurtada.
- Checkbox para marcar como "Concluído" (opcional) ou botão de excluir.

## 4. Sistema de Notificações
Um componente global `AgendaNotifier` será inserido no `App.tsx`.
- **Lógica:** A cada minuto, verifica se existem eventos não notificados (`reminder_sent = false`) ocorrendo nos próximos 15 minutos.
- **Alerta:** Exibe um "Toast" (notificação flutuante) no canto da tela: *"🔔 Reunião com Prefeito em 10 min"*.
- **Som:** Tocar um efeito sonoro sutil (opcional, configurável).

## 5. Fluxo de Desenvolvimento Sugerido
1.  **Backend:** Criar taba `user_agenda_events` e políticas RLS (Row Level Security) para que cada usuário só veja sua própria agenda.
2.  **Componentes UI:** Criar `AgendaDrawer.tsx` e integrar ao `Header.tsx`.
3.  **Lógica Local:** Implementar a adição e listagem de eventos no front-end.
4.  **Notifier:** Implementar o `AgendaNotifier` para rodar em *background* na aplicação.

---
**Status:** Planejamento Aprovado? [Aguardando Validação do Usuário]
