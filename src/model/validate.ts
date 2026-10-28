import { ELEMENT_DEFS } from './elements';
import type { FlowNode, Project } from './types';
import { inputsOf, literalKey, nodeDef, outputsOf } from '../runtime/nodes';

export interface Issue {
  level: 'error' | 'warning' | 'info';
  text: string;
  nodeId?: string;
  elementId?: string;
}

/** Things that would make the app misbehave, found before anyone presses play. */
export function validate(p: Project): Issue[] {
  const issues: Issue[] = [];
  const nodeIds = new Set(p.nodes.map((n) => n.id));
  const customNames = new Set(p.nodes.filter((n) => n.type === 'event.custom').map((n) => n.config.name ?? ''));

  // Which exec nodes can ever run: everything reachable from an event over exec wires.
  const reach = new Set<string>();
  const stack = p.nodes.filter((n) => nodeDef(n.type)?.event).map((n) => n.id);
  while (stack.length) {
    const id = stack.pop()!;
    if (reach.has(id)) continue;
    reach.add(id);
    for (const e of p.edges) if (e.from.node === id && nodeIds.has(e.to.node)) {
      const src = p.nodes.find((n) => n.id === id)!;
      if (outputsOf(src, p).find((o) => o.id === e.from.port)?.kind === 'exec') stack.push(e.to.node);
    }
  }

  for (const n of p.nodes) {
    const def = nodeDef(n.type);
    if (!def) {
      issues.push({ level: 'error', text: `Unbekannter Baustein »${n.type}«`, nodeId: n.id });
      continue;
    }
    if (def.category === 'note') continue;
    for (const f of def.config ?? []) {
      if (f.showIf && !f.showIf(n.config)) continue;
      const v = n.config[f.key];
      const missing = (what: string) => issues.push({ level: 'error', text: `${def.label}: ${what}`, nodeId: n.id });
      if (f.kind === 'element') {
        if (!v) missing('kein Element gewählt');
        else if (!p.elements.some((e) => e.id === v)) missing('das Element gibt es nicht mehr');
      } else if (f.kind === 'screen' && !f.placeholder) {
        if (!v) missing('kein Screen gewählt');
        else if (!p.screens.some((s) => s.id === v)) missing('den Screen gibt es nicht mehr');
      } else if (f.kind === 'table') {
        if (!v) missing('keine Tabelle gewählt');
        else if (!p.tables.some((t) => t.id === v)) missing('die Tabelle gibt es nicht mehr');
      } else if (f.kind === 'variable') {
        if (!v) missing('keine Variable gewählt');
        else if (!p.variables.some((x) => x.id === v)) missing('die Variable gibt es nicht mehr');
      } else if (f.kind === 'custom') {
        if (!v) missing('kein Ablauf gewählt');
        else if (!customNames.has(v)) missing(`den Ablauf »${v}« gibt es nicht`);
      }
    }
    const ins = inputsOf(n, p);
    const hasExecIn = ins.some((i) => i.kind === 'exec');
    if (def.event && !p.edges.some((e) => e.from.node === n.id)) {
      issues.push({ level: 'info', text: `${def.label}: noch keine Schritte angehängt`, nodeId: n.id });
    }
    if (hasExecIn && !reach.has(n.id)) {
      issues.push({ level: 'warning', text: `${def.label}: wird nie ausgeführt – mit keinem Ereignis verbunden`, nodeId: n.id });
    }
    for (const i of ins) {
      if (i.kind !== 'data' || (i.type !== 'list' && i.type !== 'record')) continue;
      if (n.config[literalKey(i.id)] !== undefined) continue;
      if (!p.edges.some((e) => e.to.node === n.id && e.to.port === i.id)) {
        issues.push({ level: 'warning', text: `${def.label}: Eingang »${i.label}« ist nicht verbunden`, nodeId: n.id });
      }
    }
  }

  const clicked = new Set(p.nodes.filter((n) => n.type === 'event.click').map((n) => n.config.element));
  for (const el of p.elements) {
    if (el.type === 'button' && !clicked.has(el.id)) {
      issues.push({ level: 'info', text: `Button »${el.name}« löst noch nichts aus`, elementId: el.id });
    }
    if ((el.type === 'list' || el.type === 'table') && el.props.source && !p.tables.some((t) => t.id === el.props.source)) {
      issues.push({ level: 'error', text: `${ELEMENT_DEFS[el.type].label} »${el.name}«: die Tabelle gibt es nicht mehr`, elementId: el.id });
    }
  }
  return issues;
}

export function issuesByNode(issues: Issue[]): Map<string, Issue[]> {
  const m = new Map<string, Issue[]>();
  for (const i of issues) if (i.nodeId) m.set(i.nodeId, [...(m.get(i.nodeId) ?? []), i]);
  return m;
}

export function nodeTitle(n: FlowNode, p: Project): string {
  const def = nodeDef(n.type);
  const sub = def?.subtitle?.(n, p);
  return `${def?.label ?? n.type}${sub ? ` (${sub})` : ''}`;
}
