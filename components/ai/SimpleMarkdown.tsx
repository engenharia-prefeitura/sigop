import React from 'react';

/** Markdown simples (negrito, italico, codigo, listas, titulos, quebras) renderizado como elementos React (sem HTML injetado). */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${keyPrefix}-${i++}`;
    if (t.startsWith('**') || t.startsWith('__')) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={k} className="px-1 rounded bg-slate-200 dark:bg-slate-700 text-[0.85em]">{t.slice(1, -1)}</code>);
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  let n = 0;

  const flushPara = () => {
    if (!para.length) return;
    const k = `p${n++}`;
    blocks.push(
      <p key={k} className="my-1">
        {para.map((l, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 && <br />}
            {inline(l, `${k}-${idx}`)}
          </React.Fragment>
        ))}
      </p>
    );
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const k = `l${n++}`;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={k} className={`my-1 pl-5 ${list.ordered ? 'list-decimal' : 'list-disc'}`}>
        {list.items.map((it, idx) => (
          <li key={idx}>{inline(it, `${k}-${idx}`)}</li>
        ))}
      </Tag>
    );
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const h = /^\s*#{1,4}\s+(.*)$/.exec(line);
    if (ul || ol) {
      flushPara();
      const ordered = !!ol;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((ul || ol)![1]);
    } else if (h) {
      flushPara();
      flushList();
      const k = `h${n++}`;
      blocks.push(<p key={k} className="my-1 font-bold">{inline(h[1], k)}</p>);
    } else if (line.trim() === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div className="text-sm leading-relaxed break-words">{blocks}</div>;
}
