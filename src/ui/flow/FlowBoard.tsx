import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { clone, uid } from '../../model/ids';
import type { FlowEdge, FlowNode, Project } from '../../model/types';
import { issuesByNode, validate } from '../../model/validate';
import {
  CATEGORIES, NODE_LIST, TYPE_COLOR, defaultConfig, inputsOf, nodeDef, outputsOf, type NodeDef, type PortDef,
} from '../../runtime/nodes';
import { compatible } from '../../runtime/values';
import { intersects, unionRect } from '../actions';
import { Canvas, type Rect } from '../Canvas';
import { isTyping } from '../common';
import { useEditor, useProject } from '../store';
import { FlowInspector } from './FlowInspector';
import { NodeView, nodeWidth, portPos, type WireDrag } from './NodeView';

interface Pending {
  /** Screen position of the popup inside the board. */
  sx: number;
  sy: number;
  /** Where the new node goes. */
  at: { x: number; y: number };
  from?: WireDrag;
}

function edgePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const c = Math.max(40, Math.abs(b.x - a.x) / 2);
  return `M ${a.x} ${a.y} C ${a.x + c} ${a.y}, ${b.x - c} ${b.y}, ${b.x} ${b.y}`;
}

/** Can `def` take the wire being dragged? Returns the port to hook up. */
function matchPort(def: NodeDef, p: Project, from: WireDrag): PortDef | undefined {
  const probe: FlowNode = { id: '_', type: def.type, x: 0, y: 0, config: defaultConfig(def) };
  const list = from.side === 'out' ? inputsOf(probe, p) : outputsOf(probe, p);
  return list.find((x) => x.kind === from.kind && (x.kind === 'exec' || (from.side === 'out'
    ? compatible(from.type as any, x.type)
    : compatible(x.type, from.type as any))));
}

let flowClipboard: { nodes: FlowNode[]; edges: FlowEdge[] } | null = null;

export function FlowBoard() {
  const p = useProject();
  const sel = useEditor((s) => s.flowSel);
  const edgeSel = useEditor((s) => s.edgeSel);
  const view = useEditor((s) => s.views.flow);
  const reveal = useEditor((s) => s.reveal);
  const { update, setFlowSel, setEdgeSel, setView, beginGesture, endGesture } = useEditor.getState();
  const wrap = useRef<HTMLDivElement>(null);
  const [wire, setWire] = useState<(WireDrag & { x: number; y: number }) | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const z = view?.z ?? 1;

  const issues = useMemo(() => issuesByNode(validate(p)), [p]);
  const bounds = useMemo(() => unionRect(p.nodes.map((n) => ({ x: n.x, y: n.y, w: nodeWidth(n), h: 160 }))), [p.nodes]);

  const toWorld = (cx: number, cy: number) => {
    const r = wrap.current!.getBoundingClientRect();
    const v = useEditor.getState().views.flow ?? { x: 0, y: 0, z: 1 };
    return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z };
  };

  useEffect(() => {
    if (!reveal || !wrap.current) return;
    const n = p.nodes.find((x) => x.id === reveal.id);
    if (!n) return;
    const { clientWidth: w, clientHeight: h } = wrap.current;
    const zz = Math.max(0.6, Math.min(1, view?.z ?? 1));
    setView('flow', { z: zz, x: w / 2 - (n.x + nodeWidth(n) / 2) * zz, y: h / 3 - n.y * zz });
  }, [reveal?.t]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- nodes --------------------------------------------------------------------------------

  const addNode = (type: string, at: { x: number; y: number }, from?: WireDrag) => {
    const def = nodeDef(type)!;
    const id = uid('nd');
    update((d) => {
      const node: FlowNode = { id, type, x: Math.round(at.x), y: Math.round(at.y), config: defaultConfig(def) };
      d.nodes.push(node);
      if (from) {
        const port = matchPort(def, d, from);
        if (port) {
          const list = from.side === 'out' ? inputsOf(node, d) : outputsOf(node, d);
          const i = list.indexOf(port);
          node.y = Math.round(at.y - (36 + i * 26 + 13));
          if (from.side === 'in') node.x = Math.round(at.x - nodeWidth(node));
          connectIn(d, from.side === 'out'
            ? { node: from.node, port: from.port, to: id, toPort: port.id }
            : { node: id, port: port.id, to: from.node, toPort: from.port });
        }
      }
    });
    setFlowSel([id]);
  };

  const viewCenter = () => {
    const r = wrap.current!.getBoundingClientRect();
    return toWorld(r.left + r.width / 2 - 115, r.top + r.height / 2 - 60);
  };

  const pick = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest('input,select,textarea,.port')) return;
    e.stopPropagation();
    let ids = sel;
    if (e.shiftKey) {
      ids = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      setFlowSel(ids);
      return;
    }
    if (!sel.includes(id)) {
      ids = [id];
      setFlowSel(ids);
    }
    const start = toWorld(e.clientX, e.clientY);
    const p0 = useEditor.getState().project!;
    const orig = new Map(p0.nodes.filter((n) => ids.includes(n.id)).map((n) => [n.id, { x: n.x, y: n.y }]));
    let began = false;
    const move = (ev: PointerEvent) => {
      const w = toWorld(ev.clientX, ev.clientY);
      const dx = w.x - start.x;
      const dy = w.y - start.y;
      if (!began) {
        if (Math.hypot(dx, dy) * z < 3) return;
        began = true;
        beginGesture();
      }
      update((d) => {
        for (const n of d.nodes) {
          const o = orig.get(n.id);
          if (!o) continue;
          n.x = ev.altKey ? o.x + dx : Math.round((o.x + dx) / 10) * 10;
          n.y = ev.altKey ? o.y + dy : Math.round((o.y + dy) / 10) * 10;
        }
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (began) endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ----- wires --------------------------------------------------------------------------------

  const onPortDown = (e: React.PointerEvent, node: FlowNode, port: PortDef, side: 'in' | 'out') => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    let from: WireDrag = { node: node.id, port: port.id, side, kind: port.kind, type: port.type };
    // Grabbing a connected data input picks its wire up again.
    if (side === 'in' && port.kind === 'data') {
      const existing = p.edges.find((x) => x.to.node === node.id && x.to.port === port.id);
      const src = existing && p.nodes.find((n) => n.id === existing.from.node);
      if (existing && src) {
        const sp = outputsOf(src, p).find((o) => o.id === existing.from.port);
        update((d) => {
          d.edges = d.edges.filter((x) => x.id !== existing.id);
        });
        from = { node: src.id, port: existing.from.port, side: 'out', kind: 'data', type: sp?.type };
      }
    }
    const w = toWorld(e.clientX, e.clientY);
    setWire({ ...from, x: w.x, y: w.y });
    const move = (ev: PointerEvent) => {
      const q = toWorld(ev.clientX, ev.clientY);
      setWire((cur) => (cur ? { ...cur, x: q.x, y: q.y } : cur));
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setWire(null);
      const hit = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('[data-port]') as HTMLElement | null;
      if (hit) {
        const tn = hit.dataset.node!;
        const tp = hit.dataset.port!;
        const ts = hit.dataset.side as 'in' | 'out';
        if (ts === from.side || tn === from.node) return;
        update((d) => {
          connectIn(d, from.side === 'out'
            ? { node: from.node, port: from.port, to: tn, toPort: tp }
            : { node: tn, port: tp, to: from.node, toPort: from.port });
        });
        return;
      }
      const onBoard = (ev.target as HTMLElement | null)?.closest?.('.canvas');
      if (onBoard) {
        const r = wrap.current!.getBoundingClientRect();
        setPending({ sx: ev.clientX - r.left, sy: ev.clientY - r.top, at: toWorld(ev.clientX, ev.clientY), from });
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ----- keyboard -----------------------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping()) return;
      const mod = e.ctrlKey || e.metaKey;
      const { flowSel, edgeSel: es, project } = useEditor.getState();
      if (!project) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (es) {
          update((d) => { d.edges = d.edges.filter((x) => x.id !== es); });
          setEdgeSel(null);
        } else if (flowSel.length) {
          update((d) => {
            d.nodes = d.nodes.filter((n) => !flowSel.includes(n.id));
            d.edges = d.edges.filter((x) => !flowSel.includes(x.from.node) && !flowSel.includes(x.to.node));
          });
          setFlowSel([]);
        }
      } else if (mod && e.key.toLowerCase() === 'c' && flowSel.length) {
        copyNodes(project, flowSel);
      } else if (mod && (e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'd')) {
        e.preventDefault();
        if (e.key.toLowerCase() === 'd') copyNodes(project, flowSel);
        let ids: string[] = [];
        update((d) => { ids = pasteNodes(d); });
        if (ids.length) setFlowSel(ids);
      } else if (e.key === 'Escape') {
        setFlowSel([]);
        setPending(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onMarquee = (r: Rect) => {
    const hit = p.nodes.filter((n) => intersects(r, { x: n.x, y: n.y, w: nodeWidth(n), h: 80 })).map((n) => n.id);
    setFlowSel([...new Set([...sel, ...hit])]);
  };

  // ----- rendering ----------------------------------------------------------------------------

  const edgeEls = p.edges.map((e) => {
    const a = p.nodes.find((n) => n.id === e.from.node);
    const b = p.nodes.find((n) => n.id === e.to.node);
    if (!a || !b) return null;
    const pa = portPos(p, a, e.from.port, 'out');
    const pb = portPos(p, b, e.to.port, 'in');
    if (!pa || !pb) return null;
    const out = outputsOf(a, p).find((o) => o.id === e.from.port);
    const exec = out?.kind === 'exec';
    const color = exec ? TYPE_COLOR.exec : TYPE_COLOR[out?.type ?? 'any'];
    const d = edgePath(pa, pb);
    const isSel = edgeSel === e.id;
    return (
      <g key={e.id} className={`edge ${exec ? 'exec' : 'data'} ${isSel ? 'sel' : ''}`}>
        <path d={d} className="edge-hit" onPointerDown={(ev) => {
          ev.stopPropagation();
          setEdgeSel(e.id);
        }} />
        <path d={d} className="edge-line" style={{ stroke: isSel ? '#0ea5e9' : color }} />
      </g>
    );
  });

  let wireEl = null;
  if (wire) {
    const n = p.nodes.find((x) => x.id === wire.node);
    const at = n && portPos(p, n, wire.port, wire.side);
    if (at) {
      const d = wire.side === 'out' ? edgePath(at, wire) : edgePath(wire, at);
      wireEl = <path d={d} className="edge-line dragging" style={{ stroke: wire.kind === 'exec' ? TYPE_COLOR.exec : TYPE_COLOR[(wire.type as keyof typeof TYPE_COLOR) ?? 'any'] }} />;
    }
  }

  return (
    <div className="board-layout">
      <NodePalette onAdd={(type) => addNode(type, viewCenter())} />
      <div className={`board-main ${wire ? `wiring wiring-${wire.kind}` : ''}`} ref={wrap}>
        <Canvas
          view={view}
          onView={(v) => setView('flow', v)}
          bounds={bounds}
          className="flow-canvas"
          onBackgroundClick={() => {
            setFlowSel([]);
            setPending(null);
          }}
          onMarquee={onMarquee}
          onDrop={(e, at) => {
            const t = e.dataTransfer.getData('aquist/node');
            if (t && nodeDef(t)) addNode(t, { x: at.x - 20, y: at.y - 15 });
          }}
          onDoubleClick={(e, at) => {
            const r = wrap.current!.getBoundingClientRect();
            setPending({ sx: e.clientX - r.left, sy: e.clientY - r.top, at });
          }}
          onContextMenu={(e, at) => {
            const r = wrap.current!.getBoundingClientRect();
            setPending({ sx: e.clientX - r.left, sy: e.clientY - r.top, at });
          }}
          overlay={pending && (
            <QuickAdd
              p={p}
              pending={pending}
              onClose={() => setPending(null)}
              onPick={(type) => {
                addNode(type, pending.at, pending.from);
                setPending(null);
              }}
            />
          )}
        >
          <svg className="edges" width="1" height="1">
            {edgeEls}
            {wireEl}
          </svg>
          {p.nodes.map((n) => (
            <NodeView
              key={n.id}
              node={n}
              p={p}
              edges={p.edges}
              selected={sel.includes(n.id)}
              issues={issues.get(n.id)}
              wire={wire}
              onPick={pick}
              onPortDown={onPortDown}
            />
          ))}
        </Canvas>
        {p.nodes.length === 0 && (
          <div className="empty-hint">
            <b>Noch kein Workflow.</b>
            <span>Ziehe links ein <i>Ereignis</i> herein – oder wähle im Tab »Oberfläche« einen Button und klicke rechts auf »Ablauf beim Klicken«. Doppelklick auf das Board öffnet die Suche.</span>
          </div>
        )}
      </div>
      <FlowInspector />
    </div>
  );
}

/** Adds an edge from an output to an input, replacing what was in a data input before. */
function connectIn(d: Project, c: { node: string; port: string; to: string; toPort: string }) {
  const a = d.nodes.find((n) => n.id === c.node);
  const b = d.nodes.find((n) => n.id === c.to);
  if (!a || !b || a.id === b.id) return;
  const out = outputsOf(a, d).find((x) => x.id === c.port);
  const inp = inputsOf(b, d).find((x) => x.id === c.toPort);
  if (!out || !inp || out.kind !== inp.kind) return;
  if (out.kind === 'data' && !compatible(out.type, inp.type)) return;
  if (inp.kind === 'data') d.edges = d.edges.filter((e) => !(e.to.node === b.id && e.to.port === inp.id));
  if (d.edges.some((e) => e.from.node === a.id && e.from.port === out.id && e.to.node === b.id && e.to.port === inp.id)) return;
  d.edges.push({ id: uid('ed'), from: { node: a.id, port: out.id }, to: { node: b.id, port: inp.id } });
}

function copyNodes(p: Project, ids: string[]) {
  const nodes = p.nodes.filter((n) => ids.includes(n.id));
  if (!nodes.length) return;
  const edges = p.edges.filter((e) => ids.includes(e.from.node) && ids.includes(e.to.node));
  flowClipboard = clone({ nodes, edges });
}

function pasteNodes(d: Project): string[] {
  if (!flowClipboard) return [];
  const map = new Map<string, string>();
  for (const n of flowClipboard.nodes) {
    const id = uid('nd');
    map.set(n.id, id);
    d.nodes.push({ ...clone(n), id, x: n.x + 40, y: n.y + 40 });
  }
  for (const e of flowClipboard.edges) {
    d.edges.push({ id: uid('ed'), from: { node: map.get(e.from.node)!, port: e.from.port }, to: { node: map.get(e.to.node)!, port: e.to.port } });
  }
  return [...map.values()];
}

function NodePalette({ onAdd }: { onAdd(type: string): void }) {
  const [q, setQ] = useState('');
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const needle = q.trim().toLowerCase();
  return (
    <aside className="palette nodes">
      <div className="search">
        <Search size={14} />
        <input placeholder="Baustein suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {[...CATEGORIES, { id: 'note', label: 'Notizen', color: '#ca8a04' }].map((c) => {
        const items = NODE_LIST.filter((d) => d.category === c.id && (!needle
          || d.label.toLowerCase().includes(needle) || d.help.toLowerCase().includes(needle)));
        if (!items.length) return null;
        const isClosed = closed[c.id] && !needle;
        return (
          <div key={c.id} className="node-cat">
            <button className="node-cat-head" onClick={() => setClosed({ ...closed, [c.id]: !closed[c.id] })}>
              {isClosed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <span className="cat-dot" style={{ background: c.color }} />
              {c.label}
            </button>
            {!isClosed && items.map((d) => (
              <button
                key={d.type}
                className="node-item"
                draggable
                title={d.help}
                onDragStart={(e) => e.dataTransfer.setData('aquist/node', d.type)}
                onClick={() => onAdd(d.type)}
              >
                {d.label}
              </button>
            ))}
          </div>
        );
      })}
      <div className="palette-help">Ziehen oder klicken. Doppelklick aufs Board = Schnellsuche. Von einem Anschluss ins Leere ziehen = passenden Baustein wählen.</div>
    </aside>
  );
}

function QuickAdd({ p, pending, onPick, onClose }: { p: Project; pending: Pending; onPick(t: string): void; onClose(): void }) {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const needle = q.trim().toLowerCase();
  const items = NODE_LIST.filter((d) => d.category !== 'note'
    && (!pending.from || matchPort(d, p, pending.from))
    && (!needle || d.label.toLowerCase().includes(needle) || d.help.toLowerCase().includes(needle)));
  const cat = (d: NodeDef) => CATEGORIES.find((c) => c.id === d.category);
  return (
    <div
      className="quickadd"
      style={{ left: pending.sx, top: pending.sy }}
      onPointerDown={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        placeholder={pending.from ? 'Passender Baustein …' : 'Baustein suchen …'}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setIdx(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') setIdx((i) => Math.min(items.length - 1, i + 1));
          else if (e.key === 'ArrowUp') setIdx((i) => Math.max(0, i - 1));
          else if (e.key === 'Enter' && items[idx]) onPick(items[idx].type);
          else if (e.key === 'Escape') onClose();
        }}
      />
      <div className="quickadd-list">
        {items.map((d, i) => (
          <button
            key={d.type}
            className={i === idx ? 'on' : ''}
            onMouseEnter={() => setIdx(i)}
            onClick={() => onPick(d.type)}
            title={d.help}
          >
            <span className="cat-dot" style={{ background: cat(d)?.color }} />
            <span>{d.label}</span>
            <small>{cat(d)?.label}</small>
          </button>
        ))}
        {!items.length && <div className="field-hint">Nichts Passendes gefunden.</div>}
      </div>
    </div>
  );
}
