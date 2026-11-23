import { executeTool } from './tools';
import type { DocState, Proposal, ToolContext, ToolResult } from './types';

interface Entry {
  proposal: Proposal;
  snapshot?: DocState;
  result?: ToolResult;
  appliedSeq?: number;
}

export type ProposalListener = (proposals: Proposal[]) => void;

/** Gerencia o historico de propostas de uma conversa (aplicar, rejeitar, desfazer). */
export class ProposalManager {
  private entries = new Map<string, Entry>();
  private order: string[] = [];
  private listeners = new Set<ProposalListener>();
  private busy = new Set<string>();
  private seq = 0;

  add(proposal: Proposal): Proposal {
    if (this.entries.has(proposal.id)) throw new Error(`Proposta ${proposal.id} ja existe.`);
    this.entries.set(proposal.id, { proposal: { ...proposal } });
    this.order.push(proposal.id);
    this.emit();
    return { ...proposal };
  }

  list(): Proposal[] {
    return this.order.map(id => ({ ...this.entries.get(id)!.proposal }));
  }

  get(id: string): Proposal | undefined {
    const e = this.entries.get(id);
    return e ? { ...e.proposal } : undefined;
  }

  getResult(id: string): ToolResult | undefined {
    return this.entries.get(id)?.result;
  }

  subscribe(listener: ProposalListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Aplica uma proposta pendente. Nunca lanca: erros voltam em ToolResult e status 'failed'. */
  async apply(id: string, ctx: ToolContext): Promise<ToolResult> {
    const e = this.entries.get(id);
    if (!e) return { ok: false, output: JSON.stringify({ erro: `Proposta ${id} nao encontrada.` }) };
    if (e.proposal.status !== 'pending' || this.busy.has(id)) {
      return { ok: false, output: JSON.stringify({ erro: `Proposta nao pode ser aplicada (status: ${e.proposal.status}).` }) };
    }
    this.busy.add(id);
    try {
      const snapshot = ctx.bridge.getState();
      const result = await executeTool(e.proposal, ctx);
      e.result = result;
      if (result.ok) {
        e.snapshot = snapshot;
        e.appliedSeq = ++this.seq;
        e.proposal = { ...e.proposal, status: 'applied', error: undefined };
      } else {
        let error = result.output;
        try { error = JSON.parse(result.output).erro ?? error; } catch { /* mantem texto */ }
        e.proposal = { ...e.proposal, status: 'failed', error };
      }
      return result;
    } finally {
      this.busy.delete(id);
      this.emit();
    }
  }

  reject(id: string): boolean {
    const e = this.entries.get(id);
    if (!e || e.proposal.status !== 'pending' || this.busy.has(id)) return false;
    e.proposal = { ...e.proposal, status: 'rejected' };
    this.emit();
    return true;
  }

  /** Aplica todas as pendentes em ordem. */
  async applyAll(ctx: ToolContext): Promise<{ id: string; result: ToolResult }[]> {
    const out: { id: string; result: ToolResult }[] = [];
    for (const id of [...this.order]) {
      if (this.entries.get(id)!.proposal.status === 'pending') out.push({ id, result: await this.apply(id, ctx) });
    }
    return out;
  }

  /**
   * Desfaz uma proposta aplicada restaurando o snapshot de antes dela.
   * Alteracoes aplicadas depois dela tambem sao desfeitas (marcadas 'undone').
   * Retorna os ids desfeitos (vazio se nada foi feito).
   */
  undo(id: string, ctx: ToolContext): string[] {
    const e = this.entries.get(id);
    if (!e || e.proposal.status !== 'applied' || !e.snapshot || !ctx.bridge.isEditable()) return [];
    const snapshot = e.snapshot;
    const seq = e.appliedSeq!;
    ctx.bridge.update(() => snapshot);
    const undone: string[] = [];
    for (const oid of this.order) {
      const o = this.entries.get(oid)!;
      if (o.proposal.status === 'applied' && o.appliedSeq! >= seq) {
        o.proposal = { ...o.proposal, status: 'undone' };
        o.snapshot = undefined;
        undone.push(oid);
      }
    }
    this.emit();
    return undone;
  }

  /** Desfaz a ultima proposta aplicada. */
  undoLast(ctx: ToolContext): string[] {
    let last: Entry | undefined;
    for (const id of this.order) {
      const e = this.entries.get(id)!;
      if (e.proposal.status === 'applied' && (!last || e.appliedSeq! > last.appliedSeq!)) last = e;
    }
    return last ? this.undo(last.proposal.id, ctx) : [];
  }

  private emit() {
    const snap = this.list();
    this.listeners.forEach(l => {
      try { l(snap); } catch { /* ignora erro de listener */ }
    });
  }
}

export const createProposalManager = () => new ProposalManager();
