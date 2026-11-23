import React from 'react';
import type { Proposal } from '../../lib/ai/types';

function toPlain(html?: string): string {
  if (!html) return '';
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();
}

const clip = (s: string, n = 600) => (s.length > n ? s.slice(0, n) + '…' : s);

const STATUS_LABEL: Record<Proposal['status'], string> = {
  pending: 'Aguardando aprovação',
  applied: 'Aplicada',
  rejected: 'Rejeitada',
  undone: 'Desfeita',
  failed: 'Falhou',
};

const STATUS_COLOR: Record<Proposal['status'], string> = {
  pending: 'bg-amber-100 text-amber-800',
  applied: 'bg-green-100 text-green-800',
  rejected: 'bg-slate-200 text-slate-600',
  undone: 'bg-slate-200 text-slate-600',
  failed: 'bg-red-100 text-red-800',
};

interface Props {
  proposal: Proposal;
  busy?: boolean;
  disabled?: boolean;
  onApply: (p: Proposal) => void;
  onReject: (p: Proposal) => void;
  onUndo: (p: Proposal) => void;
}

export default function ProposalCard({ proposal: p, busy, disabled, onApply, onReject, onUndo }: Props) {
  const before = toPlain(p.before);
  const after = toPlain(p.after);
  const showDiff = before || after;
  const border = p.destructive ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white';
  return (
    <div className={`rounded-lg border ${border} p-3 text-sm shadow-sm`}>
      <div className="flex items-start gap-2">
        <span className={`material-symbols-outlined text-lg ${p.destructive ? 'text-red-600' : 'text-primary'}`}>
          {p.destructive ? 'warning' : 'edit_note'}
        </span>
        <div className="flex-1 min-w-0">
          <p className={`font-semibold break-words ${p.destructive ? 'text-red-700' : 'text-slate-800'}`}>
            {p.destructive && <span className="uppercase text-[10px] mr-1 px-1 py-0.5 rounded bg-red-600 text-white">Destrutiva</span>}
            {p.summary}
          </p>
          <span className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full ${STATUS_COLOR[p.status]}`}>
            {STATUS_LABEL[p.status]}
          </span>
        </div>
      </div>

      {showDiff && (
        <div className="mt-2 space-y-1 text-xs">
          {before && (
            <div className="rounded bg-red-50 border border-red-200 text-red-800 p-2 whitespace-pre-wrap break-words">
              <span className="font-bold mr-1">−</span>
              {clip(before)}
            </div>
          )}
          {after && (
            <div className="rounded bg-green-50 border border-green-200 text-green-800 p-2 whitespace-pre-wrap break-words">
              <span className="font-bold mr-1">+</span>
              {clip(after)}
            </div>
          )}
        </div>
      )}

      {p.status === 'failed' && p.error && <p className="mt-2 text-xs text-red-700 break-words">{p.error}</p>}

      <div className="mt-2 flex gap-2 justify-end">
        {p.status === 'pending' && (
          <>
            <button
              disabled={busy}
              onClick={() => onReject(p)}
              className="px-3 py-1 rounded border border-slate-300 text-slate-600 hover:bg-slate-100 text-xs disabled:opacity-50"
            >
              Rejeitar
            </button>
            <button
              disabled={busy || disabled}
              onClick={() => onApply(p)}
              className={`px-3 py-1 rounded text-white text-xs disabled:opacity-50 ${p.destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:opacity-90'}`}
            >
              Aplicar
            </button>
          </>
        )}
        {p.status === 'applied' && (
          <button
            disabled={busy || disabled}
            onClick={() => onUndo(p)}
            className="px-3 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs disabled:opacity-50 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-sm">undo</span>Desfazer
          </button>
        )}
      </div>
    </div>
  );
}
