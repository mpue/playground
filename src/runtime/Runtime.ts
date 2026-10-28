import { selectOptions } from '../model/elements';
import { clone } from '../model/ids';
import type { FlowNode, Project, UIElement } from '../model/types';
import type { Database } from './database';
import {
  type ElState, type EventKind, type ExecCtx, type NodeCtx, type RuntimeApi,
  inputsOf, literalKey, nodeDef,
} from './nodes';
import { convert, isNumeric, toNumber } from './values';

export interface LogEntry {
  id: number;
  t: number;
  kind: 'event' | 'log' | 'error' | 'info';
  text: string;
  nodeId?: string;
}

export interface Toast {
  id: number;
  text: string;
  style: string;
}

export interface Dialog {
  kind: 'confirm' | 'prompt';
  text: string;
  def?: string;
  answer(v: any): void;
}

/** An error that knows which node it came from, so the editor can point at it. */
export class NodeError extends Error {
  constructor(message: string, public nodeId: string) {
    super(message);
  }
}

class Stopped extends Error {}

interface Scope {
  outputs: Map<string, Record<string, any>>;
}

const MAX_STEPS = 250_000;
const INPUT_TYPES = new Set(['input', 'textarea', 'checkbox', 'select']);

/**
 * Runs a project: holds the state of every element and variable, reacts to user input and
 * walks the workflow. Exec wires are followed in order; data inputs are pulled on demand
 * from pure nodes (computed fresh each time) or from outputs exec nodes have produced.
 */
export class Runtime implements RuntimeApi {
  screenId: string | null = null;
  vars: Record<string, any> = {};
  els: Record<string, ElState> = {};
  logs: LogEntry[] = [];
  toasts: Toast[] = [];
  dialog: Dialog | null = null;
  running = false;
  version = 0;
  onNode?: (nodeId: string, state: 'run' | 'error') => void;

  private listeners = new Set<() => void>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private steps = 0;
  private seq = 0;
  private lastOutputs = new Map<string, Record<string, any>>();
  private unsubDb?: () => void;

  constructor(public project: Project, public db: Database) {}

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = () => this.version;

  private emit() {
    this.version++;
    this.listeners.forEach((l) => l());
  }

  /** Edits made while the app runs apply right away. */
  setProject(p: Project) {
    this.project = p;
    this.emit();
  }

  // ----- lifecycle ----------------------------------------------------------------------------

  async start() {
    this.running = true;
    this.vars = {};
    for (const v of this.project.variables) this.vars[v.id] = clone(v.initial ?? null);
    this.screenId = this.project.startScreenId ?? this.project.screens[0]?.id ?? null;
    this.unsubDb = this.db.subscribe(() => this.emit());
    for (const n of this.project.nodes) {
      if (n.type !== 'event.timer') continue;
      let count = 0;
      const ms = Math.max(0.1, toNumber(n.config.seconds ?? 1)) * 1000;
      this.timers.push(setInterval(() => void this.runEvent(n, { count: ++count }), ms));
    }
    this.info('App gestartet');
    this.emit();
    await this.fireEvent('start', () => true);
    if (this.screenId) {
      const sid = this.screenId;
      await this.fireEvent('screen', (n) => n.config.screen === sid);
    }
  }

  stop() {
    this.running = false;
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.unsubDb?.();
    if (this.dialog) this.dialog.answer(this.dialog.kind === 'confirm' ? false : null);
    this.emit();
  }

  // ----- user actions coming from the rendered app ----------------------------------------------

  async userClick(elementId: string) {
    await this.fireEvent('click', (n) => n.config.element === elementId);
  }

  async userInput(elementId: string, value: any) {
    this.els[elementId] = { ...this.els[elementId], value };
    this.emit();
    await this.fireEvent('change', (n) => n.config.element === elementId, { value: this.readElement(elementId) });
  }

  async userSelect(elementId: string, item: any, index: number) {
    await this.fireEvent('select', (n) => n.config.element === elementId, { item, index: index + 1 });
  }

  // ----- RuntimeApi -----------------------------------------------------------------------------

  element(id: string): UIElement {
    const el = this.project.elements.find((e) => e.id === id);
    if (!el) throw new Error(id ? 'Das gewählte Element gibt es nicht mehr' : 'Kein Element gewählt');
    return el;
  }

  state(id: string): ElState {
    return this.els[id] ?? {};
  }

  itemsOf(el: UIElement): any[] {
    const st = this.els[el.id];
    if (st?.items) return st.items;
    return el.props.source ? this.db.all(el.props.source) : [];
  }

  readElement(id: string): any {
    const el = this.element(id);
    const st = this.state(id);
    switch (el.type) {
      case 'input': {
        const v = st.value ?? el.props.value ?? '';
        if (el.props.inputType === 'number') return isNumeric(v) ? toNumber(v) : '';
        return v;
      }
      case 'textarea':
        return st.value ?? el.props.value ?? '';
      case 'checkbox':
        return st.value ?? !!el.props.checked;
      case 'select':
        return st.value ?? (el.props.value || selectOptions(el)[0] || '');
      case 'list':
      case 'table':
        return this.itemsOf(el);
      case 'heading':
      case 'text':
      case 'button':
      case 'kpi':
        return st.text ?? el.props.text ?? '';
      default:
        return el.props.label ?? null;
    }
  }

  setElement(id: string, patch: Partial<ElState>) {
    this.element(id);
    this.els[id] = { ...this.els[id], ...patch };
    this.emit();
  }

  clearInputs(screenId: string | null) {
    for (const el of this.project.elements) {
      if (el.screenId === screenId && INPUT_TYPES.has(el.type) && this.els[el.id]) {
        const { value: _drop, ...rest } = this.els[el.id];
        this.els[el.id] = rest;
      }
    }
    this.emit();
  }

  async navigate(screenId: string) {
    if (!this.project.screens.some((s) => s.id === screenId)) throw new Error('Den Screen gibt es nicht mehr');
    this.screenId = screenId;
    this.emit();
    await this.fireEvent('screen', (n) => n.config.screen === screenId);
  }

  toast(text: string, style: string) {
    const t = { id: ++this.seq, text, style };
    this.toasts = [...this.toasts, t].slice(-4);
    this.emit();
    setTimeout(() => {
      this.toasts = this.toasts.filter((x) => x !== t);
      this.emit();
    }, 3200);
  }

  confirm(text: string): Promise<boolean> {
    return this.ask({ kind: 'confirm', text }) as Promise<boolean>;
  }

  prompt(text: string, def: string): Promise<string | null> {
    return this.ask({ kind: 'prompt', text, def }) as Promise<string | null>;
  }

  private ask(d: Omit<Dialog, 'answer'>): Promise<any> {
    return new Promise((resolve) => {
      this.dialog = {
        ...d,
        answer: (v) => {
          this.dialog = null;
          this.emit();
          resolve(v);
        },
      };
      this.emit();
    });
  }

  log(text: string) {
    this.pushLog('log', text);
  }

  info(text: string) {
    this.pushLog('info', text);
  }

  private pushLog(kind: LogEntry['kind'], text: string, nodeId?: string) {
    this.logs = [...this.logs, { id: ++this.seq, t: Date.now(), kind, text, nodeId }].slice(-400);
    this.emit();
  }

  clearLog() {
    this.logs = [];
    this.emit();
  }

  getVar(id: string): any {
    if (!(id in this.vars)) {
      const v = this.project.variables.find((x) => x.id === id);
      if (!v) throw new Error(id ? 'Die Variable gibt es nicht mehr' : 'Keine Variable gewählt');
      this.vars[id] = clone(v.initial ?? null);
    }
    return this.vars[id];
  }

  setVar(id: string, value: any) {
    const v = this.project.variables.find((x) => x.id === id);
    if (!v) throw new Error(id ? 'Die Variable gibt es nicht mehr' : 'Keine Variable gewählt');
    this.vars[id] = convert(value, v.type);
    this.emit();
  }

  async callCustom(name: string, value: any) {
    const targets = this.project.nodes.filter((n) => n.type === 'event.custom' && (n.config.name ?? '') === name);
    if (!targets.length) throw new Error(`Den Ablauf »${name}« gibt es nicht`);
    for (const n of targets) await this.runEvent(n, { value }, true);
  }

  sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  tick() {}

  // ----- the interpreter ------------------------------------------------------------------------

  private node(id: string): FlowNode | undefined {
    return this.project.nodes.find((n) => n.id === id);
  }

  async fireEvent(kind: EventKind, match: (n: FlowNode) => boolean, payload: Record<string, any> = {}) {
    if (!this.running) return;
    const nodes = this.project.nodes.filter((n) => nodeDef(n.type)?.event === kind && match(n));
    for (const n of nodes) await this.runEvent(n, payload);
  }

  private async runEvent(node: FlowNode, payload: Record<string, any>, nested = false) {
    if (!this.running) return;
    const scope: Scope = { outputs: new Map([[node.id, { ...payload }]]) };
    this.lastOutputs.set(node.id, { ...payload });
    if (!nested) {
      this.steps = 0;
      const def = nodeDef(node.type);
      const sub = def?.subtitle?.(node, this.project);
      this.pushLog('event', `${def?.label ?? node.type}${sub ? `: ${sub}` : ''}`, node.id);
    }
    this.onNode?.(node.id, 'run');
    try {
      await this.fire(node, 'out', scope);
    } catch (e) {
      if (nested) throw e;
      if (e instanceof Stopped) return;
      const nodeId = e instanceof NodeError ? e.nodeId : node.id;
      this.pushLog('error', (e as Error).message, nodeId);
      this.onNode?.(nodeId, 'error');
    }
  }

  private async fire(node: FlowNode, port: string, scope: Scope) {
    const targets = this.project.edges
      .filter((e) => e.from.node === node.id && e.from.port === port)
      .map((e) => this.node(e.to.node))
      .filter((n): n is FlowNode => !!n)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    for (const t of targets) await this.exec(t, scope);
  }

  private async exec(node: FlowNode, scope: Scope) {
    if (!this.running) throw new Stopped();
    if (++this.steps > MAX_STEPS) throw new NodeError('Abgebrochen: zu viele Schritte – vermutlich eine Endlosschleife', node.id);
    if (this.steps % 2000 === 0) await new Promise((r) => setTimeout(r, 0));
    const def = nodeDef(node.type);
    if (!def?.run) return;
    this.onNode?.(node.id, 'run');
    const ctx: ExecCtx = {
      node,
      cfg: node.config,
      p: this.project,
      rt: this,
      input: (port) => this.input(node, port, scope, 0),
      fire: (port) => this.fire(node, port, scope),
      set: (port, value) => {
        const o = scope.outputs.get(node.id) ?? {};
        o[port] = value;
        scope.outputs.set(node.id, o);
        this.lastOutputs.set(node.id, { ...(this.lastOutputs.get(node.id) ?? {}), [port]: value });
      },
    };
    let next: string | void;
    try {
      next = await def.run(ctx);
    } catch (e) {
      if (e instanceof NodeError || e instanceof Stopped) throw e;
      throw new NodeError((e as Error).message, node.id);
    }
    if (next) await this.fire(node, next, scope);
  }

  private input(node: FlowNode, port: string, scope: Scope, depth: number): any {
    const pd = inputsOf(node, this.project).find((p) => p.id === port);
    const edge = this.project.edges.find((e) => e.to.node === node.id && e.to.port === port);
    let v: any;
    if (edge) {
      const src = this.node(edge.from.node);
      const sdef = src && nodeDef(src.type);
      if (src && sdef?.eval) {
        if (depth > 100) throw new NodeError('Die Werte-Verbindungen drehen sich im Kreis', node.id);
        v = this.evalPure(src, scope, depth + 1)[edge.from.port];
      } else if (src) {
        const o = scope.outputs.get(src.id) ?? this.lastOutputs.get(src.id);
        v = o?.[edge.from.port];
      }
    } else {
      const lit = node.config[literalKey(port)];
      v = lit !== undefined ? lit : pd?.default;
    }
    return pd?.type ? convert(v, pd.type) : v;
  }

  private evalPure(node: FlowNode, scope: Scope, depth: number): Record<string, any> {
    const def = nodeDef(node.type)!;
    const ctx: NodeCtx = {
      node,
      cfg: node.config,
      p: this.project,
      rt: this,
      input: (port) => this.input(node, port, scope, depth),
    };
    try {
      return def.eval!(ctx);
    } catch (e) {
      if (e instanceof NodeError) throw e;
      throw new NodeError((e as Error).message, node.id);
    }
  }
}
