import { DEVICES, ELEMENT_DEFS, selectOptions } from './elements';
import type { FlowNode, Project, UIElement } from './types';
import { validate } from './validate';
import { type DescCtx, inputsOf, literalKey, nodeDef, outputsOf } from '../runtime/nodes';
import { TYPE_LABEL, toText } from '../runtime/values';

const FIELD_TYPE: Record<string, string> = { text: 'Text', number: 'Zahl', bool: 'Ja/Nein', date: 'Datum', choice: 'Auswahl' };

function literal(v: any): string {
  if (v === undefined || v === null || v === '') return '„“ (leer)';
  if (typeof v === 'boolean') return v ? 'ja' : 'nein';
  if (typeof v === 'number') return String(v);
  return `„${toText(v)}“`;
}

export function descCtx(p: Project, node: FlowNode, depth = 0): DescCtx {
  const name = (list: { id: string; name: string }[], id?: string) => {
    const x = list.find((i) => i.id === id);
    return x ? `»${x.name}«` : '»?«';
  };
  const d: DescCtx = {
    node,
    cfg: node.config,
    p,
    in(port) {
      const edge = p.edges.find((e) => e.to.node === node.id && e.to.port === port);
      if (edge) {
        const src = p.nodes.find((n) => n.id === edge.from.node);
        const sdef = src && nodeDef(src.type);
        if (!src || !sdef) return '(fehlt)';
        if (depth > 12) return '…';
        const sd = descCtx(p, src, depth + 1);
        return sdef.outPhrase ? sdef.outPhrase(edge.from.port, sd) : sdef.describe(sd);
      }
      const pd = inputsOf(node, p).find((i) => i.id === port);
      const v = node.config[literalKey(port)];
      return literal(v !== undefined ? v : pd?.default);
    },
    el: (id) => name(p.elements, id),
    screen: (id) => name(p.screens, id),
    table: (id) => name(p.tables, id),
    variable: (id) => name(p.variables, id),
  };
  return d;
}

function byPosition<T extends { x: number; y: number }>(a: T, b: T) {
  return a.y - b.y || a.x - b.x;
}

/** Steps hanging off one exec output, as nested Markdown list lines (3 spaces per level). */
function stepLines(p: Project, nodeId: string, port: string, level: number, seen: Set<string>): string[] {
  const targets = p.edges
    .filter((e) => e.from.node === nodeId && e.from.port === port)
    .map((e) => p.nodes.find((n) => n.id === e.to.node))
    .filter((n): n is FlowNode => !!n)
    .sort(byPosition);
  const out: string[] = [];
  for (const t of targets) out.push(...stepFrom(p, t, level, seen));
  return out;
}

function stepFrom(p: Project, node: FlowNode, level: number, seen: Set<string>): string[] {
  const pad = '   '.repeat(level);
  const def = nodeDef(node.type);
  if (!def) return [`${pad}1. (unbekannter Schritt)`];
  const sentence = def.describe(descCtx(p, node));
  if (seen.has(node.id)) return [`${pad}1. weiter wie oben: ${sentence}`];
  seen.add(node.id);
  const execOuts = outputsOf(node, p).filter((o) => o.kind === 'exec');
  const cont = execOuts.find((o) => o.id === 'done') ?? (execOuts.length === 1 ? execOuts[0] : undefined);
  const branches = execOuts.filter((o) => o !== cont);
  const lines: string[] = [];
  if (!branches.length) {
    lines.push(`${pad}1. ${sentence}`);
  } else if (cont && branches.length === 1) {
    // A loop: its body nests right under it, what comes after continues at this level.
    lines.push(`${pad}1. ${sentence.replace(/[.:]$/, '')}:`);
    const body = stepLines(p, node.id, branches[0].id, level + 1, seen);
    lines.push(...(body.length ? body : [`${'   '.repeat(level + 1)}1. (nichts)`]));
  } else {
    lines.push(`${pad}1. ${sentence.replace(/[.:]$/, '')}:`);
    const filled = branches.map((b) => ({ b, steps: stepLines(p, node.id, b.id, level + 2, seen) }));
    for (const { b, steps } of filled) {
      if (!steps.length && filled.some((f) => f.steps.length)) continue;
      const label = b.label || b.id;
      lines.push(`${'   '.repeat(level + 1)}- **${label}:**${steps.length ? '' : ' nichts weiter'}`);
      lines.push(...steps);
    }
  }
  if (cont) lines.push(...stepLines(p, node.id, cont.id, level, seen));
  return lines;
}

function elementSummary(p: Project, el: UIElement): string {
  const def = ELEMENT_DEFS[el.type];
  const pr = el.props;
  const bits: string[] = [];
  switch (el.type) {
    case 'heading':
    case 'text':
    case 'button':
      bits.push(`„${pr.text}“`);
      break;
    case 'kpi':
      bits.push(`„${pr.label}“, Startwert ${pr.text}`);
      break;
    case 'input':
    case 'textarea':
      bits.push(`„${pr.label}“${pr.placeholder ? `, Platzhalter „${pr.placeholder}“` : ''}`);
      if (pr.inputType && pr.inputType !== 'text') bits.push(`Art: ${pr.inputType}`);
      break;
    case 'checkbox':
      bits.push(`„${pr.label}“${pr.checked ? ', vorab angehakt' : ''}`);
      break;
    case 'select':
      bits.push(`„${pr.label}“, Optionen: ${selectOptions(el).join(' / ')}`);
      break;
    case 'list':
    case 'table': {
      const t = p.tables.find((x) => x.id === pr.source);
      bits.push(t ? `zeigt Tabelle »${t.name}«` : 'wird vom Workflow befüllt');
      if (pr.itemTemplate) bits.push(`Zeile: „${pr.itemTemplate}“`);
      if (pr.columns) bits.push(`Spalten: ${pr.columns}`);
      break;
    }
    case 'image':
      bits.push(`„${pr.label}“`);
      break;
  }
  return `**${def.label}** »${el.name}«${bits.length ? ` – ${bits.join(', ')}` : ''}`;
}

/** A readable specification of the whole app, in Markdown. */
export function describeProject(p: Project): string {
  const L: string[] = [];
  L.push(`# ${p.name}`, '');
  if (p.description) L.push(p.description, '');
  const events = p.nodes.filter((n) => nodeDef(n.type)?.event).sort(byPosition);
  L.push(`*Erstellt mit Aquist Playground · Stand ${new Date(p.updatedAt).toLocaleString('de-DE')} · ` +
    `${p.screens.length} Screen(s), ${p.tables.length} Tabelle(n), ${events.length} Ablauf/Abläufe*`, '');

  L.push('## Screens', '');
  const screens = [...p.screens].sort((a, b) => (a.id === p.startScreenId ? -1 : b.id === p.startScreenId ? 1 : a.x - b.x || a.y - b.y));
  for (const s of screens) {
    L.push(`### ${s.name}${s.id === p.startScreenId ? ' (Startscreen)' : ''}`, '');
    L.push(`${DEVICES[s.device]?.label ?? s.device}, ${s.w} × ${s.h} px`, '');
    const els = p.elements.filter((e) => e.screenId === s.id && !ELEMENT_DEFS[e.type]?.boardOnly).sort(byPosition);
    if (!els.length) L.push('- (noch leer)');
    for (const el of els) L.push(`- ${elementSummary(p, el)}`);
    L.push('');
  }

  if (p.tables.length || p.variables.length) {
    L.push('## Daten', '');
    for (const t of p.tables) {
      L.push(`### Tabelle »${t.name}«`, '', '| Feld | Typ |', '| --- | --- |');
      for (const f of t.fields) L.push(`| ${f.name} | ${FIELD_TYPE[f.type] ?? f.type}${f.type === 'choice' && f.options?.length ? ` (${f.options.join(', ')})` : ''} |`);
      L.push('');
    }
    if (p.variables.length) {
      L.push('### Variablen', '', '| Variable | Typ | Startwert |', '| --- | --- | --- |');
      for (const v of p.variables) L.push(`| ${v.name} | ${TYPE_LABEL[v.type]} | ${literal(v.initial)} |`);
      L.push('');
    }
    L.push('*Die Daten liegen im Browser der jeweiligen Person und werden nur auf ausdrücklichen Wunsch mitgeteilt.*', '');
  }

  L.push('## Abläufe', '');
  if (!events.length) L.push('Noch keine Abläufe verdrahtet.', '');
  for (const ev of events) {
    const def = nodeDef(ev.type)!;
    L.push(`### ${def.describe(descCtx(p, ev))}`, '');
    const steps = stepLines(p, ev.id, 'out', 0, new Set([ev.id]));
    L.push(...(steps.length ? steps : ['Noch keine Schritte.']), '');
  }

  const notes = [
    ...p.elements.filter((e) => e.type === 'note').map((e) => toText(e.props.text)),
    ...p.nodes.filter((n) => n.type === 'note').map((n) => toText(n.config.text)),
  ].filter((t) => t.trim());
  if (notes.length) {
    L.push('## Notizen', '');
    for (const t of notes) L.push(`> ${t.replace(/\n/g, '  \n> ')}`, '');
  }

  const issues = validate(p).filter((i) => i.level !== 'info');
  if (issues.length) {
    L.push('## Offene Punkte', '');
    for (const i of issues) L.push(`- ${i.level === 'error' ? '❗' : '⚠️'} ${i.text}`);
    L.push('');
  }
  return L.join('\n');
}
