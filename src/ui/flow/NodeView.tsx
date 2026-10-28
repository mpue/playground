import { CircleAlert } from 'lucide-react';
import { memo } from 'react';
import type { Issue } from '../../model/validate';
import type { FlowEdge, FlowNode, Project } from '../../model/types';
import {
  CATEGORY_COLOR, TYPE_COLOR, inputsOf, literalKey, nodeDef, outputsOf, type CategoryId, type PortDef,
} from '../../runtime/nodes';
import { compatible } from '../../runtime/values';
import { TextField } from '../common';
import { useEditor, useFlash } from '../store';
import { ConfigEditor } from './ConfigEditor';

export const HEADER = 30;
export const ROW = 26;
export const PAD = 6;

export function nodeWidth(n: FlowNode): number {
  return nodeDef(n.type)?.width ?? 230;
}

export function portY(i: number): number {
  return HEADER + PAD + i * ROW + ROW / 2;
}

/** Where a port sits on the board. Inputs on the left edge, outputs on the right. */
export function portPos(p: Project, n: FlowNode, port: string, side: 'in' | 'out'): { x: number; y: number } | null {
  const list = side === 'in' ? inputsOf(n, p) : outputsOf(n, p);
  const i = list.findIndex((x) => x.id === port);
  if (i < 0) return null;
  return { x: side === 'in' ? n.x : n.x + nodeWidth(n), y: n.y + portY(i) };
}

export interface WireDrag {
  node: string;
  port: string;
  side: 'in' | 'out';
  kind: 'exec' | 'data';
  type?: string;
}

interface Props {
  node: FlowNode;
  p: Project;
  edges: FlowEdge[];
  selected: boolean;
  issues?: Issue[];
  wire: WireDrag | null;
  onPick(e: React.PointerEvent, id: string): void;
  onPortDown(e: React.PointerEvent, node: FlowNode, port: PortDef, side: 'in' | 'out'): void;
}

function Literal({ node, port }: { node: FlowNode; port: PortDef }) {
  const key = literalKey(port.id);
  const v = node.config[key] !== undefined ? node.config[key] : port.default;
  const set = (x: any) => useEditor.getState().update((d) => {
    const n = d.nodes.find((y) => y.id === node.id);
    if (n) n.config[key] = x;
  }, { coalesce: `${node.id}.${key}` });
  if (port.type === 'bool') {
    return (
      <input
        className="lit"
        type="checkbox"
        checked={!!v}
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => set(e.target.checked)}
      />
    );
  }
  if (port.type === 'list' || port.type === 'record') return null;
  return (
    <span onPointerDown={(e) => e.stopPropagation()} className="lit-wrap">
      <TextField
        className="lit"
        value={v === undefined || v === null ? '' : String(v)}
        placeholder={port.type === 'number' ? '0' : '…'}
        onChange={(x) => set(port.type === 'number' && x.trim() !== '' && Number.isFinite(Number(x.replace(',', '.'))) ? Number(x.replace(',', '.')) : x)}
      />
    </span>
  );
}

function Port({ node, port, side, connected, wire, onPortDown }: {
  node: FlowNode; port: PortDef; side: 'in' | 'out'; connected: boolean; wire: WireDrag | null;
  onPortDown: Props['onPortDown'];
}) {
  let state = '';
  if (wire) {
    const ok = wire.node !== node.id && wire.side !== side && wire.kind === port.kind
      && (port.kind === 'exec' || (side === 'in'
        ? compatible(wire.type as any, port.type)
        : compatible(port.type, wire.type as any)));
    state = ok ? 'ok' : 'no';
  }
  const color = port.kind === 'exec' ? TYPE_COLOR.exec : TYPE_COLOR[port.type ?? 'any'];
  return (
    <span
      className={`port ${port.kind} ${side} ${connected ? 'on' : ''} ${state}`}
      style={{ ['--pc' as any]: color }}
      data-port={port.id}
      data-node={node.id}
      data-side={side}
      title={`${port.label || (port.kind === 'exec' ? 'Ablauf' : '')}${port.kind === 'data' ? ` (${port.type ?? 'any'})` : ''}`}
      onPointerDown={(e) => onPortDown(e, node, port, side)}
    />
  );
}

function NodeViewInner({ node, p, edges, selected, issues, wire, onPick, onPortDown }: Props) {
  const def = nodeDef(node.type);
  const flash = useFlash((s) => s.map[node.id]);
  const running = useEditor((s) => !!s.runtime);
  if (!def) {
    return (
      <div className="fnode unknown" style={{ left: node.x, top: node.y }} onPointerDown={(e) => onPick(e, node.id)}>
        Unbekannt: {node.type}
      </div>
    );
  }
  const w = nodeWidth(node);

  if (def.category === 'note') {
    return (
      <div
        className={`fnode note ${selected ? 'sel' : ''}`}
        style={{ left: node.x, top: node.y, width: w }}
        onPointerDown={(e) => onPick(e, node.id)}
      >
        <TextField
          multiline
          rows={5}
          value={String(node.config.text ?? '')}
          onChange={(v) => useEditor.getState().update((d) => {
            const n = d.nodes.find((x) => x.id === node.id);
            if (n) n.config.text = v;
          }, { coalesce: `${node.id}.text` })}
        />
      </div>
    );
  }

  const ins = inputsOf(node, p);
  const outs = outputsOf(node, p);
  const rows = Math.max(ins.length, outs.length);
  const conIn = new Set(edges.filter((e) => e.to.node === node.id).map((e) => e.to.port));
  const conOut = new Set(edges.filter((e) => e.from.node === node.id).map((e) => e.from.port));
  const color = CATEGORY_COLOR[def.category as CategoryId];
  const err = issues?.some((i) => i.level === 'error');
  const fields = (def.config ?? []).filter((f) => !f.showIf || f.showIf(node.config));

  return (
    <div
      className={`fnode ${selected ? 'sel' : ''} ${def.event ? 'event' : ''} ${running && flash?.state === 'error' ? 'run-error' : ''}`}
      style={{ left: node.x, top: node.y, width: w, ['--cat' as any]: color }}
      onPointerDown={(e) => onPick(e, node.id)}
    >
      {running && flash?.state === 'run' && <div key={flash.t} className="fnode-flash" />}
      <div className="fnode-head" style={{ height: HEADER }}>
        <span className="fnode-title">{def.label}</span>
        {issues && issues.length > 0 && (
          <span className={`fnode-issue ${err ? 'error' : ''}`} title={issues.map((i) => i.text).join('\n')}>
            <CircleAlert size={14} />
          </span>
        )}
      </div>
      <div className="fnode-rows" style={{ paddingTop: PAD }}>
        {Array.from({ length: rows }, (_, i) => {
          const a = ins[i];
          const b = outs[i];
          return (
            <div className="fnode-row" key={i} style={{ height: ROW }}>
              <div className="pin-in">
                {a && (
                  <>
                    <Port node={node} port={a} side="in" connected={conIn.has(a.id)} wire={wire} onPortDown={onPortDown} />
                    {a.label && <span className="pin-label">{a.label}</span>}
                    {a.kind === 'data' && !conIn.has(a.id) && <Literal node={node} port={a} />}
                  </>
                )}
              </div>
              <div className="pin-out">
                {b && (
                  <>
                    {b.label && <span className="pin-label">{b.label}</span>}
                    <Port node={node} port={b} side="out" connected={conOut.has(b.id)} wire={wire} onPortDown={onPortDown} />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {fields.length > 0 && (
        <div className="fnode-cfg" onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('select,input,textarea,label')) e.stopPropagation();
        }}>
          {fields.map((f) => (
            <label key={f.key} className="cfg">
              <span>{f.label}</span>
              <ConfigEditor node={node} f={f} p={p} />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export const NodeView = memo(NodeViewInner);
