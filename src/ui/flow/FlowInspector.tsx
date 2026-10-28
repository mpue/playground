import { Copy, Eye, Trash2, Variable } from 'lucide-react';
import { useMemo } from 'react';
import { uid } from '../../model/ids';
import { nodeTitle, validate } from '../../model/validate';
import type { FlowNode } from '../../model/types';
import { CATEGORIES, TYPE_COLOR, inputsOf, nodeDef, outputsOf, type CategoryId } from '../../runtime/nodes';
import { TYPE_LABEL } from '../../runtime/values';
import { Field } from '../common';
import { useEditor, useProject } from '../store';
import { VariablesEditor } from '../VariablesEditor';
import { ConfigEditor } from './ConfigEditor';

export function FlowInspector() {
  const p = useProject();
  const sel = useEditor((s) => s.flowSel);
  const edgeSel = useEditor((s) => s.edgeSel);
  const node = sel.length === 1 ? p.nodes.find((n) => n.id === sel[0]) : undefined;
  let body;
  if (node) body = <NodePanel node={node} />;
  else if (edgeSel) body = <EdgePanel id={edgeSel} />;
  else if (sel.length > 1) body = <MultiPanel ids={sel} />;
  else body = <OverviewPanel />;
  return <aside className="inspector">{body}</aside>;
}

function NodePanel({ node }: { node: FlowNode }) {
  const p = useProject();
  const def = nodeDef(node.type);
  const { update, setFlowSel, revealElement } = useEditor.getState();
  const issues = useMemo(() => validate(p).filter((i) => i.nodeId === node.id), [p, node.id]);
  if (!def) return null;
  const cat = CATEGORIES.find((c) => c.id === def.category as CategoryId);
  const fields = (def.config ?? []).filter((f) => !f.showIf || f.showIf(node.config));
  const ins = inputsOf(node, p).filter((x) => x.kind === 'data');
  const outs = outputsOf(node, p).filter((x) => x.kind === 'data');
  const el = node.config.element && p.elements.find((e) => e.id === node.config.element);
  return (
    <>
      <div className="insp-head" style={{ borderColor: cat?.color }}>
        <span className="cat-dot" style={{ background: cat?.color ?? '#ca8a04' }} />
        <span>{def.label}</span>
        <small>{cat?.label ?? 'Notiz'}</small>
      </div>
      <section className="insp-sec">
        <p className="help-text">{def.help}</p>
        {fields.map((f) => (
          <Field key={f.key} label={f.label}>
            <ConfigEditor node={node} f={f} p={p} />
          </Field>
        ))}
        {el && (
          <button className="btn small block" onClick={() => revealElement(el.id)}>
            <Eye size={14} /> »{el.name}« auf der Oberfläche zeigen
          </button>
        )}
      </section>
      {(ins.length > 0 || outs.length > 0) && (
        <section className="insp-sec">
          <h4>Anschlüsse</h4>
          {ins.map((x) => (
            <div key={x.id} className="port-row">
              <span className="port-dot" style={{ background: TYPE_COLOR[x.type ?? 'any'] }} />
              <span>{x.label}</span>
              <small>Eingang · {TYPE_LABEL[x.type ?? 'any']}</small>
            </div>
          ))}
          {outs.map((x) => (
            <div key={x.id} className="port-row">
              <span className="port-dot" style={{ background: TYPE_COLOR[x.type ?? 'any'] }} />
              <span>{x.label}</span>
              <small>Ausgang · {TYPE_LABEL[x.type ?? 'any']}</small>
            </div>
          ))}
          <p className="field-hint">Nicht verbundene Eingänge kannst du direkt im Baustein ausfüllen.</p>
        </section>
      )}
      {issues.length > 0 && (
        <section className="insp-sec">
          {issues.map((i, k) => <div key={k} className={`issue ${i.level}`}>{i.text}</div>)}
        </section>
      )}
      <div className="insp-foot">
        <button className="btn small" onClick={() => {
          const id = uid('nd');
          update((d) => {
            d.nodes.push({ ...JSON.parse(JSON.stringify(node)), id, x: node.x + 40, y: node.y + 40 });
          });
          setFlowSel([id]);
        }}><Copy size={14} /> Duplizieren</button>
        <button className="btn small danger" onClick={() => {
          update((d) => {
            d.nodes = d.nodes.filter((n) => n.id !== node.id);
            d.edges = d.edges.filter((e) => e.from.node !== node.id && e.to.node !== node.id);
          });
          setFlowSel([]);
        }}><Trash2 size={14} /> Löschen</button>
      </div>
    </>
  );
}

function EdgePanel({ id }: { id: string }) {
  const p = useProject();
  const { update, setEdgeSel } = useEditor.getState();
  const e = p.edges.find((x) => x.id === id);
  if (!e) return null;
  const a = p.nodes.find((n) => n.id === e.from.node);
  const b = p.nodes.find((n) => n.id === e.to.node);
  return (
    <>
      <div className="insp-head"><span>Verbindung</span></div>
      <section className="insp-sec">
        <p className="help-text">Von <b>{a ? nodeTitle(a, p) : '?'}</b> nach <b>{b ? nodeTitle(b, p) : '?'}</b>.</p>
        <button className="btn small danger" onClick={() => {
          update((d) => { d.edges = d.edges.filter((x) => x.id !== id); });
          setEdgeSel(null);
        }}><Trash2 size={14} /> Verbindung lösen</button>
      </section>
    </>
  );
}

function MultiPanel({ ids }: { ids: string[] }) {
  const { update, setFlowSel } = useEditor.getState();
  return (
    <>
      <div className="insp-head"><span>{ids.length} Bausteine</span></div>
      <section className="insp-sec">
        <p className="help-text">Mit Strg+D duplizieren, Strg+C / Strg+V kopieren – auch in ein anderes Projekt.</p>
      </section>
      <div className="insp-foot">
        <button className="btn small danger" onClick={() => {
          update((d) => {
            d.nodes = d.nodes.filter((n) => !ids.includes(n.id));
            d.edges = d.edges.filter((e) => !ids.includes(e.from.node) && !ids.includes(e.to.node));
          });
          setFlowSel([]);
        }}><Trash2 size={14} /> Alle löschen</button>
      </div>
    </>
  );
}

function OverviewPanel() {
  const p = useProject();
  const { revealNode, revealElement } = useEditor.getState();
  const issues = useMemo(() => validate(p), [p]);
  const order = { error: 0, warning: 1, info: 2 };
  return (
    <>
      <div className="insp-head"><span>Workflow</span></div>
      <section className="insp-sec">
        <h4>Prüfung</h4>
        {issues.length === 0 && <p className="ok-text">Alles verdrahtet – keine Probleme gefunden.</p>}
        {[...issues].sort((a, b) => order[a.level] - order[b.level]).slice(0, 40).map((i, k) => (
          <button
            key={k}
            className={`issue ${i.level}`}
            onClick={() => (i.nodeId ? revealNode(i.nodeId) : i.elementId && revealElement(i.elementId))}
          >
            {i.text}
          </button>
        ))}
      </section>
      <section className="insp-sec">
        <h4><Variable size={14} /> Variablen</h4>
        <VariablesEditor />
      </section>
      <section className="insp-sec help">
        <h4>Legende</h4>
        <div className="legend">
          <span><i className="lg exec" /> Ablauf (Reihenfolge)</span>
          {(['text', 'number', 'bool', 'list', 'record', 'any'] as const).map((t) => (
            <span key={t}><i className="lg" style={{ background: TYPE_COLOR[t] }} /> {TYPE_LABEL[t]}</span>
          ))}
        </div>
        <p className="help-text">Ein Ablauf beginnt immer mit einem roten <b>Ereignis</b>. Die dunklen Pfeile bestimmen die Reihenfolge, farbige Linien liefern Werte.</p>
      </section>
    </>
  );
}
