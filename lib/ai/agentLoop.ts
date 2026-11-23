import { streamChat } from './client';
import { executeReadOnly, isReadOnlyTool, planTool } from './tools';
import type {
  ChatMessage,
  ChatMode,
  ContentPart,
  ModelChoice,
  Proposal,
  ToolCall,
  ToolContext,
  ToolDefinition,
  ToolResult,
} from './types';

/** Interface minima do gerenciador de propostas. */
export interface AgentProposalSink {
  add(p: Proposal): void;
  apply(id: string, ctx: ToolContext): Promise<ToolResult>;
}

export type AgentEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_started'; call: ToolCall }
  | { type: 'proposal_created'; proposal: Proposal }
  | { type: 'tool_result'; call: ToolCall; result: ToolResult }
  | { type: 'message_added'; message: ChatMessage }
  | { type: 'done'; stopReason: string }
  | { type: 'error'; message: string };

export interface RunAgentParams {
  messages: ChatMessage[];
  choice: ModelChoice;
  mode: ChatMode;
  tools: ToolDefinition[];
  system: string;
  ctx: ToolContext;
  proposals: AgentProposalSink;
  maxSteps?: number;
  signal?: AbortSignal;
}

const isReadOnly = isReadOnlyTool;

const PENDING_MSG = 'Proposta registrada, aguardando aprovação do usuário.';

export async function* runAgent(params: RunAgentParams): AsyncGenerator<AgentEvent> {
  const { choice, mode, tools, system, ctx, proposals, signal } = params;
  const maxSteps = params.maxSteps ?? 8;
  const history: ChatMessage[] = [...params.messages];

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) {
      yield { type: 'done', stopReason: 'aborted' };
      return;
    }

    let text = '';
    const calls: ToolCall[] = [];
    let stopReason = 'end';

    const stream = streamChat(
      {
        action: 'chat',
        provider: choice.provider,
        model: choice.model,
        baseUrl: choice.baseUrl,
        messages: [{ role: 'system', content: [{ type: 'text', text: system }] }, ...history],
        tools: mode === 'chat_only' ? undefined : tools,
      },
      signal
    );

    for await (const ev of stream) {
      if (ev.type === 'text_delta') {
        text += ev.text;
        yield { type: 'text_delta', text: ev.text };
      } else if (ev.type === 'tool_call') {
        calls.push(ev.call);
      } else if (ev.type === 'error') {
        yield { type: 'error', message: ev.message };
        return;
      } else if (ev.type === 'done') {
        stopReason = ev.stopReason;
      }
    }

    if (signal?.aborted) {
      yield { type: 'done', stopReason: 'aborted' };
      return;
    }

    const content: ContentPart[] = text ? [{ type: 'text', text }] : [];
    const assistant: ChatMessage = { role: 'assistant', content, ...(calls.length ? { toolCalls: calls } : {}) };
    history.push(assistant);
    yield { type: 'message_added', message: assistant };

    if (calls.length === 0) {
      yield { type: 'done', stopReason };
      return;
    }

    for (const call of calls) {
      yield { type: 'tool_started', call };
      let result: ToolResult;
      try {
        if (isReadOnly(call.name)) {
          result = await executeReadOnly(call, ctx);
        } else if (mode === 'chat_only') {
          result = { ok: false, output: 'Modo somente conversa: alterações no documento não são permitidas.' };
        } else {
          const proposal = planTool(call, ctx);
          proposals.add(proposal);
          yield { type: 'proposal_created', proposal };
          result =
            mode === 'autonomous'
              ? await proposals.apply(proposal.id, ctx)
              : { ok: true, output: PENDING_MSG };
        }
      } catch (e: any) {
        result = { ok: false, output: `Erro ao executar ${call.name}: ${e?.message || e}` };
      }
      yield { type: 'tool_result', call, result };

      const parts: ContentPart[] = [{ type: 'text', text: result.output }];
      if (result.images?.length) parts.push(...result.images);
      const toolMsg: ChatMessage = {
        role: 'tool',
        content: parts,
        toolCallId: call.id,
        toolName: call.name,
      };
      history.push(toolMsg);
      yield { type: 'message_added', message: toolMsg };
    }
  }

  yield { type: 'error', message: `Limite de ${maxSteps} passos do agente atingido.` };
}
