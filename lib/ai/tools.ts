import type {
  DocPhotoItem,
  DocSection,
  DocState,
  Proposal,
  ToolCall,
  ToolContext,
  ToolName,
  ToolResult,
} from './types';

class ToolError extends Error {}

export const READ_ONLY: ToolName[] = ['listar_secoes', 'ler_secao', 'ver_foto'];
const MUTATING: ToolName[] = [
  'criar_secao', 'editar_secao', 'renomear_secao', 'mover_secao', 'apagar_secao',
  'editar_metadados', 'anexar_fotos_na_secao', 'editar_legenda', 'remover_foto',
];

export const isReadOnlyTool = (name: string): boolean => READ_ONLY.includes(name as ToolName);
export const isMutatingTool = (name: string): boolean => MUTATING.includes(name as ToolName);

// ------------------------------------------------------------------ ids
let lastId = 0;
function nextId(): number {
  lastId = Math.max(Date.now(), lastId + 1);
  return lastId;
}
let proposalCounter = 0;

// ------------------------------------------------------------------ HTML
const ALLOWED = new Set(['b', 'i', 'u', 'br', 'p', 'ul', 'ol', 'li', 'strong', 'em']);
const BLOCK = /<\s*\/?\s*(p|ul|ol|li)\b/i;

/** Sanitiza HTML vindo do modelo: so tags permitidas, sem atributos/scripts. */
export function sanitizeHtml(input: unknown): string {
  let s = String(input ?? '').replace(/\r\n?/g, '\n');
  s = s.replace(/<!--[\s\S]*?-->/g, '');
  s = s.replace(/<\s*(script|style|iframe|object|embed)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  s = s.replace(/<\s*(script|style|iframe|object|embed)\b[^>]*>/gi, '');
  s = s.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g, (_m, close, tag) => {
    const t = String(tag).toLowerCase();
    if (!ALLOWED.has(t)) return '';
    if (t === 'br') return '<br/>';
    return close ? `</${t}>` : `<${t}>`;
  });
  if (!BLOCK.test(s)) s = s.replace(/\n/g, '<br/>');
  return s.trim();
}

/** Texto plano aproximado (para resumos e comparacao). */
function plain(html: string): string {
  return html.replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|li)>/gi, ' ').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

// ------------------------------------------------------------------ helpers
function str(v: any, nome: string, opts: { allowEmpty?: boolean } = {}): string {
  if (typeof v !== 'string') throw new ToolError(`Argumento '${nome}' e obrigatorio e deve ser texto.`);
  if (!opts.allowEmpty && !v.trim()) throw new ToolError(`Argumento '${nome}' nao pode ser vazio.`);
  return v;
}

function numId(v: any, nome: string): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new ToolError(`Argumento '${nome}' deve ser um ID numerico.`);
  return n;
}

function getSection(state: DocState, v: any, nome = 'id'): { section: DocSection; index: number } {
  const id = numId(v, nome);
  const index = state.sections.findIndex(s => s.id === id);
  if (index < 0) throw new ToolError(`Secao com id ${id} nao encontrada. Use listar_secoes para ver os IDs validos.`);
  return { section: state.sections[index], index };
}

function getPhoto(section: DocSection, v: any, nome = 'foto_id'): DocPhotoItem {
  const id = numId(v, nome);
  const item = (section.items ?? []).find(p => p.id === id);
  if (!item) throw new ToolError(`Foto com id ${id} nao encontrada na secao ${section.id}. Use ler_secao para ver as fotos.`);
  return item;
}

/** Converte posicao (1-based | 'inicio' | 'fim') para indice de insercao 0-based em lista de tamanho `len`. */
function parsePos(v: any, len: number): number {
  if (v === undefined || v === null || v === 'fim') return len;
  if (v === 'inicio') return 0;
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
    throw new ToolError("Argumento 'posicao' deve ser um inteiro >= 1, 'inicio' ou 'fim'.");
  }
  return Math.min(n - 1, len);
}

function requireEditable(ctx: ToolContext) {
  if (!ctx.bridge.isEditable()) {
    throw new ToolError('O documento nao esta editavel (nao esta em rascunho). Nenhuma alteracao pode ser feita.');
  }
}

const q = (s: string) => `'${s}'`;
const cut = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function applyEdit(section: DocSection, args: Record<string, any>): { content: string; modo: string } {
  const modo = args.modo;
  if (modo === 'substituir') {
    return { modo, content: sanitizeHtml(str(args.conteudo, 'conteudo', { allowEmpty: true })) };
  }
  if (modo === 'acrescentar') {
    const add = sanitizeHtml(str(args.conteudo, 'conteudo'));
    const cur = section.content ?? '';
    const sep = cur && !/<\/(p|ul|ol|li)>\s*$/i.test(cur) && !/^\s*<(p|ul|ol)\b/i.test(add) ? '<br/>' : '';
    return { modo, content: cur + sep + add };
  }
  if (modo === 'trocar_trecho') {
    const antigo = str(args.trecho_antigo, 'trecho_antigo');
    const novo = sanitizeHtml(str(args.trecho_novo, 'trecho_novo', { allowEmpty: true }));
    const cur = section.content ?? '';
    const candidatos = [antigo, sanitizeHtml(antigo), antigo.replace(/\n/g, '<br/>')];
    const achado = candidatos.find(c => c && cur.includes(c));
    if (!achado) throw new ToolError('trecho_antigo nao foi encontrado no conteudo da secao. Use ler_secao e copie o trecho exatamente.');
    if (cur.indexOf(achado) !== cur.lastIndexOf(achado)) {
      throw new ToolError('trecho_antigo aparece mais de uma vez; informe um trecho maior e unico.');
    }
    return { modo, content: cur.replace(achado, () => novo) };
  }
  throw new ToolError("Argumento 'modo' deve ser 'substituir', 'acrescentar' ou 'trocar_trecho'.");
}

interface Plan {
  summary: string;
  destructive: boolean;
  before?: string;
  after?: string;
}

/** Valida e descreve a mudanca sem tocar no documento. */
function plan(tool: ToolName, a: Record<string, any>, state: DocState, ctx: ToolContext): Plan {
  switch (tool) {
    case 'criar_secao': {
      const titulo = str(a.titulo, 'titulo');
      if (a.tipo !== 'text' && a.tipo !== 'photos') throw new ToolError("Argumento 'tipo' deve ser 'text' ou 'photos'.");
      if (a.apos_secao_id !== undefined && a.apos_secao_id !== null) getSection(state, a.apos_secao_id, 'apos_secao_id');
      else parsePos(a.posicao, state.sections.length);
      const conteudo = a.conteudo != null ? sanitizeHtml(a.conteudo) : '';
      return { summary: `Criar secao ${q(titulo)} (${a.tipo === 'photos' ? 'fotos' : 'texto'})`, destructive: false, after: conteudo || undefined };
    }
    case 'editar_secao': {
      const { section } = getSection(state, a.id);
      const r = applyEdit(section, a);
      const verbo = r.modo === 'substituir' ? 'Substituir conteudo' : r.modo === 'acrescentar' ? 'Acrescentar texto' : 'Trocar trecho';
      return { summary: `${verbo} da secao ${q(section.title)}`, destructive: false, before: section.content ?? '', after: r.content };
    }
    case 'renomear_secao': {
      const { section } = getSection(state, a.id);
      const t = str(a.titulo, 'titulo');
      return { summary: `Renomear secao ${q(section.title)} para ${q(t)}`, destructive: false, before: section.title, after: t };
    }
    case 'mover_secao': {
      const { section, index } = getSection(state, a.id);
      const dest = parsePos(a.posicao, state.sections.length - 1);
      return { summary: `Mover secao ${q(section.title)} da posicao ${index + 1} para ${dest + 1}`, destructive: false };
    }
    case 'apagar_secao': {
      const { section } = getSection(state, a.id);
      const n = (section.items ?? []).length;
      return {
        summary: `Apagar secao ${q(section.title)}${n ? ` (com ${n} foto(s))` : ''}`,
        destructive: true,
        before: section.content ?? '',
      };
    }
    case 'editar_metadados': {
      const parts: string[] = [];
      const before: string[] = [];
      const after: string[] = [];
      const campos: [string, string, keyof DocState][] = [
        ['titulo', 'titulo', 'title'], ['descricao', 'descricao', 'description'], ['data_evento', 'data do evento', 'eventDate'],
      ];
      for (const [arg, label, key] of campos) {
        if (a[arg] === undefined || a[arg] === null) continue;
        const v = str(a[arg], arg, { allowEmpty: true });
        parts.push(label);
        before.push(`${label}: ${state[key] as string}`);
        after.push(`${label}: ${v}`);
      }
      if (!parts.length) throw new ToolError('Informe ao menos um de: titulo, descricao, data_evento.');
      return { summary: `Alterar ${parts.join(', ')} do documento`, destructive: false, before: before.join('\n'), after: after.join('\n') };
    }
    case 'anexar_fotos_na_secao': {
      const { section } = getSection(state, a.secao_id, 'secao_id');
      checkPhotosSection(section);
      const fotos = checkFotos(a.fotos, ctx);
      return {
        summary: `Anexar ${fotos.length} foto(s) na secao ${q(section.title)}`,
        destructive: false,
        before: (section.items ?? []).map(i => i.caption).join('\n'),
        after: [...(section.items ?? []).map(i => i.caption), ...fotos.map(f => f.legenda)].join('\n'),
      };
    }
    case 'editar_legenda': {
      const { section } = getSection(state, a.secao_id, 'secao_id');
      const foto = getPhoto(section, a.foto_id);
      const l = str(a.legenda, 'legenda', { allowEmpty: true });
      return { summary: `Editar legenda de foto na secao ${q(section.title)}`, destructive: false, before: foto.caption, after: l };
    }
    case 'remover_foto': {
      const { section } = getSection(state, a.secao_id, 'secao_id');
      const foto = getPhoto(section, a.foto_id);
      return { summary: `Remover foto ${q(cut(foto.caption || String(foto.id), 40))} da secao ${q(section.title)}`, destructive: true, before: foto.caption };
    }
    default:
      throw new ToolError(`Ferramenta '${tool}' nao e uma ferramenta de edicao.`);
  }
}

function checkPhotosSection(section: DocSection) {
  if (section.type !== 'photos') {
    throw new ToolError(
      `A secao ${section.id} (${q(section.title)}) e do tipo 'text' e nao aceita fotos. Crie uma secao do tipo 'photos' com criar_secao e anexe as fotos nela.`,
    );
  }
}

function checkFotos(fotos: any, ctx: ToolContext): { anexo_id: string; legenda: string }[] {
  if (!Array.isArray(fotos) || !fotos.length) throw new ToolError("Argumento 'fotos' deve ser uma lista nao vazia.");
  return fotos.map((f, i) => {
    const anexo_id = str(f?.anexo_id, `fotos[${i}].anexo_id`);
    if (!ctx.getAttachment(anexo_id)) {
      throw new ToolError(`Anexo '${anexo_id}' nao existe no chat. Use apenas ids de anexos enviados pelo usuario (ex.: foto_1).`);
    }
    return { anexo_id, legenda: typeof f.legenda === 'string' ? f.legenda : '' };
  });
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ------------------------------------------------------------------ API
/** Valida argumentos e descreve a mudanca, SEM alterar o documento. */
export function planTool(call: ToolCall, ctx: ToolContext): Proposal {
  const base: Proposal = {
    id: `prop_${Date.now().toString(36)}_${++proposalCounter}`,
    callId: call.id,
    tool: call.name as ToolName,
    args: call.arguments ?? {},
    summary: '',
    destructive: false,
    status: 'pending',
  };
  try {
    if (!isMutatingTool(call.name)) {
      throw new ToolError(
        isReadOnlyTool(call.name) ? `'${call.name}' e de leitura; use executeReadOnly.` : `Ferramenta desconhecida: '${call.name}'.`,
      );
    }
    requireEditable(ctx);
    const p = plan(call.name as ToolName, base.args, ctx.bridge.getState(), ctx);
    return { ...base, ...p };
  } catch (e) {
    return { ...base, summary: `Falha ao preparar ${call.name}`, status: 'failed', error: errMsg(e) };
  }
}

const ok = (obj: unknown): ToolResult => ({ ok: true, output: JSON.stringify(obj) });
const fail = (msg: string): ToolResult => ({ ok: false, output: JSON.stringify({ erro: msg }) });

/** Aplica a proposta no documento via bridge.update (imutavel). */
export async function executeTool(proposal: Proposal, ctx: ToolContext): Promise<ToolResult> {
  try {
    if (!isMutatingTool(proposal.tool)) throw new ToolError(`'${proposal.tool}' nao e uma ferramenta de edicao.`);
    requireEditable(ctx);
    const a = proposal.args;
    const state = ctx.bridge.getState();
    plan(proposal.tool, a, state, ctx); // revalida contra o estado atual

    switch (proposal.tool) {
      case 'criar_secao': {
        const novo: DocSection = {
          id: nextId(), title: str(a.titulo, 'titulo').trim(), type: a.tipo,
          content: a.conteudo != null ? sanitizeHtml(a.conteudo) : '', items: [],
        };
        ctx.bridge.update(s => {
          let at: number;
          if (a.apos_secao_id !== undefined && a.apos_secao_id !== null) {
            at = s.sections.findIndex(x => x.id === numId(a.apos_secao_id, 'apos_secao_id')) + 1;
          } else at = parsePos(a.posicao, s.sections.length);
          const sections = [...s.sections.slice(0, at), novo, ...s.sections.slice(at)];
          return { ...s, sections };
        });
        const pos = ctx.bridge.getState().sections.findIndex(x => x.id === novo.id) + 1;
        return ok({ sucesso: true, secao_id: novo.id, posicao: pos, titulo: novo.title, tipo: novo.type });
      }
      case 'editar_secao': {
        const { section } = getSection(state, a.id);
        const r = applyEdit(section, a);
        ctx.bridge.update(s => ({ ...s, sections: s.sections.map(x => (x.id === section.id ? { ...x, content: r.content } : x)) }));
        return ok({ sucesso: true, secao_id: section.id, modo: r.modo, tamanho_conteudo: r.content.length });
      }
      case 'renomear_secao': {
        const { section } = getSection(state, a.id);
        const t = str(a.titulo, 'titulo').trim();
        ctx.bridge.update(s => ({ ...s, sections: s.sections.map(x => (x.id === section.id ? { ...x, title: t } : x)) }));
        return ok({ sucesso: true, secao_id: section.id, titulo: t });
      }
      case 'mover_secao': {
        const { section } = getSection(state, a.id);
        ctx.bridge.update(s => {
          const rest = s.sections.filter(x => x.id !== section.id);
          const at = parsePos(a.posicao, rest.length);
          return { ...s, sections: [...rest.slice(0, at), section, ...rest.slice(at)] };
        });
        const pos = ctx.bridge.getState().sections.findIndex(x => x.id === section.id) + 1;
        return ok({ sucesso: true, secao_id: section.id, posicao: pos });
      }
      case 'apagar_secao': {
        const { section } = getSection(state, a.id);
        ctx.bridge.update(s => ({ ...s, sections: s.sections.filter(x => x.id !== section.id) }));
        return ok({ sucesso: true, secao_apagada: section.id });
      }
      case 'editar_metadados': {
        ctx.bridge.update(s => ({
          ...s,
          ...(a.titulo != null ? { title: String(a.titulo) } : {}),
          ...(a.descricao != null ? { description: String(a.descricao) } : {}),
          ...(a.data_evento != null ? { eventDate: String(a.data_evento) } : {}),
        }));
        return ok({ sucesso: true });
      }
      case 'anexar_fotos_na_secao': {
        const { section } = getSection(state, a.secao_id, 'secao_id');
        checkPhotosSection(section);
        const fotos = checkFotos(a.fotos, ctx);
        const novos: DocPhotoItem[] = [];
        for (const f of fotos) {
          const att = ctx.getAttachment(f.anexo_id)!;
          const url = await ctx.compressForDocument(att.original);
          novos.push({ id: nextId(), url, caption: f.legenda });
        }
        ctx.bridge.update(s => ({
          ...s,
          sections: s.sections.map(x => (x.id === section.id ? { ...x, items: [...(x.items ?? []), ...novos] } : x)),
        }));
        return ok({
          sucesso: true,
          secao_id: section.id,
          fotos_criadas: novos.map((n, i) => ({ foto_id: n.id, anexo_id: fotos[i].anexo_id, legenda: n.caption })),
        });
      }
      case 'editar_legenda': {
        const { section } = getSection(state, a.secao_id, 'secao_id');
        const foto = getPhoto(section, a.foto_id);
        const l = str(a.legenda, 'legenda', { allowEmpty: true });
        ctx.bridge.update(s => ({
          ...s,
          sections: s.sections.map(x =>
            x.id === section.id ? { ...x, items: (x.items ?? []).map(p => (p.id === foto.id ? { ...p, caption: l } : p)) } : x),
        }));
        return ok({ sucesso: true, secao_id: section.id, foto_id: foto.id, legenda: l });
      }
      case 'remover_foto': {
        const { section } = getSection(state, a.secao_id, 'secao_id');
        const foto = getPhoto(section, a.foto_id);
        ctx.bridge.update(s => ({
          ...s,
          sections: s.sections.map(x => (x.id === section.id ? { ...x, items: (x.items ?? []).filter(p => p.id !== foto.id) } : x)),
        }));
        return ok({ sucesso: true, secao_id: section.id, foto_removida: foto.id });
      }
      default:
        throw new ToolError(`Ferramenta desconhecida: '${proposal.tool}'.`);
    }
  } catch (e) {
    return fail(errMsg(e));
  }
}

/** Ferramentas de leitura: rodam direto, sem proposta. */
export async function executeReadOnly(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  try {
    const a = call.arguments ?? {};
    const state = ctx.bridge.getState();
    switch (call.name) {
      case 'listar_secoes':
        return ok({
          titulo: state.title,
          descricao: state.description,
          data_evento: state.eventDate,
          tipo_documento: state.typeName,
          editavel: ctx.bridge.isEditable(),
          secoes: state.sections.map((s, i) => ({
            posicao: i + 1,
            id: s.id,
            titulo: s.title,
            tipo: s.type,
            resumo: cut(plain(s.content ?? ''), 120),
            num_fotos: (s.items ?? []).length,
          })),
        });
      case 'ler_secao': {
        const { section } = getSection(state, a.id);
        return ok({
          id: section.id,
          titulo: section.title,
          tipo: section.type,
          conteudo: section.content ?? '',
          fotos: (section.items ?? []).map(p => ({ foto_id: p.id, legenda: p.caption })),
        });
      }
      case 'ver_foto': {
        const { section } = getSection(state, a.secao_id, 'secao_id');
        const foto = getPhoto(section, a.foto_id);
        const m = /^data:([^;,]+);base64,(.*)$/s.exec(foto.url ?? '');
        if (!m) throw new ToolError('A foto nao esta em formato data URL e nao pode ser enviada ao modelo.');
        return {
          ok: true,
          output: JSON.stringify({
            secao_id: section.id,
            foto_id: foto.id,
            legenda: foto.caption,
            aviso:
              'A imagem do documento esta comprimida (800px), entao detalhes finos podem estar perdidos. O original so esta disponivel se tiver sido anexado no chat.',
          }),
          images: [{ type: 'image', attachmentId: `doc_${section.id}_${foto.id}`, mediaType: m[1], data: m[2] }],
        };
      }
      default:
        return fail(`'${call.name}' nao e uma ferramenta de leitura conhecida.`);
    }
  } catch (e) {
    return fail(errMsg(e));
  }
}
