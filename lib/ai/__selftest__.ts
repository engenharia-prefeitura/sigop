import assert from 'node:assert/strict';
import { executeReadOnly, executeTool, planTool, sanitizeHtml } from './tools';
import { ProposalManager } from './proposals';
import { getToolsForMode, TOOL_DEFINITIONS } from './toolDefinitions';
import type { DocState, ToolContext, ToolCall } from './types';

let state: DocState = { title: 'T', description: 'D', eventDate: '2026-01-01', typeName: 'X', sections: [] };
let editable = true;
const IMG = 'data:image/jpeg;base64,AAAA';
const ctx: ToolContext = {
  bridge: {
    getState: () => state,
    update: m => { state = m(state); },
    isEditable: () => editable,
  },
  getAttachment: id => (id === 'foto_1' || id === 'foto_2'
    ? ({ id, name: id, original: new Blob(['x']), width: 1, height: 1, aiData: '', aiMediaType: 'image/jpeg', thumbUrl: '' } as any)
    : undefined),
  compressForDocument: async () => IMG,
};
let n = 0;
const call = (name: string, args: any): ToolCall => ({ id: 'c' + ++n, name, arguments: args });
const mgr = new ProposalManager();
let notified = 0;
mgr.subscribe(() => notified++);

async function run(name: string, args: any) {
  const p = mgr.add(planTool(call(name, args), ctx));
  assert.notEqual(p.status, 'failed', `${name}: ${p.error}`);
  const r = await mgr.apply(p.id, ctx);
  assert.ok(r.ok, r.output);
  return { p, out: JSON.parse(r.output) };
}

(async () => {
  // sanitize
  assert.equal(sanitizeHtml('a\nb<script>x</script><b onclick="y">z</b>'), 'a<br/>b<b>z</b>');
  // defs
  assert.equal(TOOL_DEFINITIONS.length, 12);
  assert.deepEqual(getToolsForMode('chat_only').map(t => t.name), ['listar_secoes', 'ler_secao', 'ver_foto']);
  assert.equal(getToolsForMode('propose').length, 12);

  // criar
  const a = (await run('criar_secao', { titulo: 'Intro', tipo: 'text', conteudo: 'Ola\nmundo' })).out.secao_id;
  const b = (await run('criar_secao', { titulo: 'Fotos', tipo: 'photos' })).out.secao_id;
  const c = (await run('criar_secao', { titulo: 'Meio', tipo: 'text', apos_secao_id: a })).out.secao_id;
  assert.deepEqual(state.sections.map(s => s.id), [a, c, b]);
  assert.equal(state.sections[0].content, 'Ola<br/>mundo');
  assert.equal(new Set([a, b, c]).size, 3);

  // editar 3 modos
  await run('editar_secao', { id: a, modo: 'acrescentar', conteudo: 'fim' });
  assert.equal(state.sections[0].content, 'Ola<br/>mundo<br/>fim');
  await run('editar_secao', { id: a, modo: 'trocar_trecho', trecho_antigo: 'mundo', trecho_novo: 'Brasil' });
  assert.ok(state.sections[0].content.includes('Brasil'));
  const sub = await run('editar_secao', { id: a, modo: 'substituir', conteudo: '<p>novo</p>' });
  assert.equal(sub.p.destructive, false);
  assert.ok(sub.p.before && sub.p.after);
  assert.equal(state.sections[0].content, '<p>novo</p>');
  assert.equal(planTool(call('editar_secao', { id: a, modo: 'trocar_trecho', trecho_antigo: 'zzz', trecho_novo: '' }), ctx).status, 'failed');

  // renomear, metadados
  await run('renomear_secao', { id: a, titulo: 'Abertura' });
  await run('editar_metadados', { titulo: 'Novo' });
  assert.equal(state.title, 'Novo');

  // mover
  await run('mover_secao', { id: b, posicao: 1 });
  assert.equal(state.sections[0].id, b);
  await run('mover_secao', { id: b, posicao: 'fim' });
  assert.equal(state.sections[2].id, b);

  // fotos
  const bad = planTool(call('anexar_fotos_na_secao', { secao_id: a, fotos: [{ anexo_id: 'foto_1', legenda: 'x' }] }), ctx);
  assert.equal(bad.status, 'failed'); assert.match(bad.error!, /photos/);
  assert.equal(planTool(call('anexar_fotos_na_secao', { secao_id: b, fotos: [{ anexo_id: 'nope', legenda: 'x' }] }), ctx).status, 'failed');
  const an = await run('anexar_fotos_na_secao', { secao_id: b, fotos: [{ anexo_id: 'foto_1', legenda: 'L1' }, { anexo_id: 'foto_2', legenda: 'L2' }] });
  const [f1, f2] = an.out.fotos_criadas.map((f: any) => f.foto_id);
  assert.notEqual(f1, f2);
  await run('editar_legenda', { secao_id: b, foto_id: f1, legenda: 'Nova' });
  assert.equal(state.sections[2].items[0].caption, 'Nova');
  const rd = await executeReadOnly(call('ver_foto', { secao_id: b, foto_id: f1 }), ctx);
  assert.ok(rd.ok && rd.images![0].data === 'AAAA' && rd.images![0].mediaType === 'image/jpeg' && /800px/.test(rd.output));
  const rf = await run('remover_foto', { secao_id: b, foto_id: f2 });
  assert.equal(rf.p.destructive, true);
  assert.equal(state.sections[2].items.length, 1);

  // leitura
  const ls = JSON.parse((await executeReadOnly(call('listar_secoes', {}), ctx)).output);
  assert.equal(ls.secoes.length, 3);
  assert.equal(JSON.parse((await executeReadOnly(call('ler_secao', { id: b }), ctx)).output).fotos.length, 1);
  assert.equal((await executeReadOnly(call('ler_secao', { id: 1 }), ctx)).ok, false);

  // apagar + undo
  const ap = await run('apagar_secao', { id: c });
  assert.equal(ap.p.destructive, true);
  assert.equal(state.sections.length, 2);
  assert.equal(mgr.undo(ap.p.id, ctx).length, 1);
  assert.equal(state.sections.length, 3);
  assert.equal(mgr.get(ap.p.id)!.status, 'undone');
  assert.equal((await mgr.apply(ap.p.id, ctx)).ok, false); // nao reaplica

  // undoLast
  await run('renomear_secao', { id: a, titulo: 'Z' });
  mgr.undoLast(ctx);
  assert.equal(state.sections.find(s => s.id === a)!.title, 'Abertura');

  // reject + applyAll
  const p1 = mgr.add(planTool(call('renomear_secao', { id: a, titulo: 'R1' }), ctx));
  const p2 = mgr.add(planTool(call('renomear_secao', { id: a, titulo: 'R2' }), ctx));
  assert.ok(mgr.reject(p1.id));
  assert.equal((await mgr.apply(p1.id, ctx)).ok, false);
  const all = await mgr.applyAll(ctx);
  assert.equal(all.length, 1); assert.equal(mgr.get(p2.id)!.status, 'applied');

  // nao editavel
  editable = false;
  assert.equal(planTool(call('apagar_secao', { id: a }), ctx).status, 'failed');
  editable = true;

  assert.ok(notified > 0);
  console.log('OK - selftest passou');
})().catch(e => { console.error(e); process.exit(1); });
