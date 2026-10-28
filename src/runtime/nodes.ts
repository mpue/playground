import type { ElementEvent } from '../model/elements';
import type { DataType, ElementType, FlowNode, Project, TableDef } from '../model/types';
import type { Database } from './database';
import {
  COMPARE_OPS, compare, fillTemplate, getField, opNeedsValue, templatePlaceholders,
  toBool, toList, toNumber, toText,
} from './values';

// ---------------------------------------------------------------------------------------------
// Ports, config and the contexts nodes run in
// ---------------------------------------------------------------------------------------------

export type PortKind = 'exec' | 'data';

export interface PortDef {
  id: string;
  label: string;
  kind: PortKind;
  type?: DataType;
  /** Used when the input is neither connected nor typed in. */
  default?: any;
}

export type ConfigKind =
  | 'text' | 'textarea' | 'number' | 'bool' | 'select'
  | 'element' | 'screen' | 'table' | 'field' | 'fields' | 'variable' | 'custom' | 'color';

export interface ConfigField {
  key: string;
  label: string;
  kind: ConfigKind;
  options?: { value: string; label: string }[];
  /** element: which element events/types may be picked */
  elementEvent?: ElementEvent;
  elementTypes?: ElementType[];
  /** field/fields: config key holding the table id; without it the field is free text */
  tableKey?: string;
  default?: any;
  placeholder?: string;
  showIf?: (cfg: Record<string, any>) => boolean;
}

export type EventKind = 'start' | 'screen' | 'click' | 'change' | 'select' | 'timer' | 'custom';

export interface ElState {
  text?: string;
  value?: any;
  hidden?: boolean;
  items?: any[] | null;
}

/** What the runtime offers to nodes. */
export interface RuntimeApi {
  db: Database;
  project: Project;
  screenId: string | null;
  getVar(id: string): any;
  setVar(id: string, v: any): void;
  readElement(id: string): any;
  setElement(id: string, patch: Partial<ElState>): void;
  clearInputs(screenId: string | null): void;
  navigate(screenId: string): Promise<void>;
  toast(text: string, style: string): void;
  confirm(text: string): Promise<boolean>;
  prompt(text: string, def: string): Promise<string | null>;
  log(text: string): void;
  callCustom(name: string, value: any): Promise<void>;
  sleep(ms: number): Promise<void>;
  tick(): void;
}

export interface NodeCtx {
  node: FlowNode;
  cfg: Record<string, any>;
  p: Project;
  rt: RuntimeApi;
  input(port: string): any;
}

export interface ExecCtx extends NodeCtx {
  /** Runs everything wired to an exec output and waits for it. */
  fire(port: string): Promise<void>;
  /** Makes a data output readable for nodes further down. */
  set(port: string, value: any): void;
}

export interface DescCtx {
  node: FlowNode;
  cfg: Record<string, any>;
  p: Project;
  in(port: string): string;
  el(id: string | undefined): string;
  screen(id: string | undefined): string;
  table(id: string | undefined): string;
  variable(id: string | undefined): string;
}

export type CategoryId = 'events' | 'ui' | 'data' | 'logic' | 'loop' | 'math' | 'list' | 'text' | 'vars' | 'flow';

export const CATEGORIES: { id: CategoryId; label: string; color: string }[] = [
  { id: 'events', label: 'Ereignisse', color: '#e11d48' },
  { id: 'ui', label: 'Oberfläche', color: '#2563eb' },
  { id: 'data', label: 'Datenbank', color: '#7c3aed' },
  { id: 'logic', label: 'Logik', color: '#d97706' },
  { id: 'loop', label: 'Schleifen', color: '#0891b2' },
  { id: 'list', label: 'Listen & Zählen', color: '#0d9488' },
  { id: 'math', label: 'Rechnen', color: '#16a34a' },
  { id: 'text', label: 'Text & Werte', color: '#db2777' },
  { id: 'vars', label: 'Variablen', color: '#4f46e5' },
  { id: 'flow', label: 'Ablauf', color: '#475569' },
];

export const CATEGORY_COLOR: Record<CategoryId, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c.color]),
) as Record<CategoryId, string>;

export const TYPE_COLOR: Record<DataType | 'exec', string> = {
  exec: '#334155',
  number: '#16a34a',
  text: '#db2777',
  bool: '#dc2626',
  list: '#2563eb',
  record: '#ea580c',
  any: '#94a3b8',
};

export interface NodeDef {
  type: string;
  category: CategoryId | 'note';
  label: string;
  help: string;
  config?: ConfigField[];
  inputs?: (n: FlowNode, p: Project) => PortDef[];
  outputs?: (n: FlowNode, p: Project) => PortDef[];
  subtitle?: (n: FlowNode, p: Project) => string;
  event?: EventKind;
  /** Exec nodes: does the work and names the exec output to continue with. */
  run?: (c: ExecCtx) => Promise<string | void> | string | void;
  /** Pure nodes: compute all data outputs from the inputs. */
  eval?: (c: NodeCtx) => Record<string, any>;
  /** A sentence (exec nodes, events) or a noun phrase (pure nodes). */
  describe: (d: DescCtx) => string;
  /** Phrase for a specific data output, when it is not what describe() says. */
  outPhrase?: (port: string, d: DescCtx) => string;
  width?: number;
}

const execIn: PortDef = { id: 'in', label: '', kind: 'exec' };
const execOut = (id = 'out', label = ''): PortDef => ({ id, label, kind: 'exec' });
const data = (id: string, label: string, type: DataType = 'any', def?: any): PortDef => ({
  id, label, kind: 'data', type, default: def,
});

function tableOf(p: Project, id: string | undefined): TableDef | undefined {
  return p.tables.find((t) => t.id === id);
}

function needTable(c: NodeCtx): TableDef {
  const t = tableOf(c.p, c.cfg.table);
  if (!t) throw new Error('Keine Tabelle gewählt');
  return t;
}

function fieldType(t: TableDef | undefined, name: string): DataType {
  const f = t?.fields.find((x) => x.name === name);
  if (!f) return 'any';
  return f.type === 'number' ? 'number' : f.type === 'bool' ? 'bool' : 'text';
}

const OP_OPTIONS = COMPARE_OPS.map((o) => ({ value: o.value, label: o.label }));

/** A condition as a German subordinate clause ("…, ob A gleich B ist"). */
export function condPhrase(a: string, op: string, b: string): string {
  switch (op) {
    case 'contains': return `${a} ${b} enthält`;
    case 'starts': return `${a} mit ${b} beginnt`;
    case 'empty': return `${a} leer ist`;
    case 'notempty': return `${a} nicht leer ist`;
  }
  return `${a} ${COMPARE_OPS.find((o) => o.value === op)?.words ?? op} ${b} ist`;
}

function filterPhrase(d: DescCtx, field: string | undefined, op: string, valuePort = 'value'): string {
  if (!field) return '';
  return `, bei denen ${condPhrase(`»${field}«`, op, opNeedsValue(op) ? d.in(valuePort) : '')}`;
}

function applyFilter(list: any[], field: string | undefined, op: string, value: any): any[] {
  if (!field) return list;
  return list.filter((r) => compare(getField(r, field), op, value));
}

function sortList(list: any[], field: string | undefined, dir: string): any[] {
  const key = (r: any) => (field ? getField(r, field) : r);
  const out = [...list].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return toText(x).localeCompare(toText(y), 'de', { numeric: true });
  });
  return dir === 'desc' ? out.reverse() : out;
}

const filterConfig = (tableKey?: string): ConfigField[] => [
  { key: 'field', label: 'Filter: Feld', kind: 'field', tableKey, placeholder: '(kein Filter)' },
  { key: 'op', label: 'Bedingung', kind: 'select', options: OP_OPTIONS, default: 'eq', showIf: (c) => !!c.field },
];

const filterInputs = (n: FlowNode, t?: TableDef): PortDef[] =>
  n.config.field && opNeedsValue(n.config.op ?? 'eq')
    ? [data('value', 'Filterwert', t ? fieldType(t, n.config.field) : 'any')]
    : [];

function sleepGuard(seconds: number): number {
  return Math.max(0, Math.min(seconds, 600)) * 1000;
}

// ---------------------------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------------------------

const defs: NodeDef[] = [
  // ----- events -------------------------------------------------------------------------------
  {
    type: 'event.start', category: 'events', label: 'App gestartet', event: 'start',
    help: 'Startet einmal, wenn die App ausgeführt wird. Gut zum Laden von Daten und Vorbelegen.',
    outputs: () => [execOut()],
    describe: () => 'Wenn die App startet',
  },
  {
    type: 'event.screen', category: 'events', label: 'Screen geöffnet', event: 'screen',
    help: 'Startet jedes Mal, wenn der gewählte Screen angezeigt wird.',
    config: [{ key: 'screen', label: 'Screen', kind: 'screen' }],
    outputs: () => [execOut()],
    subtitle: (n, p) => p.screens.find((s) => s.id === n.config.screen)?.name ?? '–',
    describe: (d) => `Wenn der Screen ${d.screen(d.cfg.screen)} geöffnet wird`,
  },
  {
    type: 'event.click', category: 'events', label: 'Geklickt', event: 'click',
    help: 'Startet, wenn ein Button (oder ein anderes Element) angeklickt wird.',
    config: [{ key: 'element', label: 'Element', kind: 'element', elementEvent: 'click' }],
    outputs: () => [execOut()],
    subtitle: (n, p) => p.elements.find((e) => e.id === n.config.element)?.name ?? '–',
    describe: (d) => `Wenn ${d.el(d.cfg.element)} geklickt wird`,
  },
  {
    type: 'event.change', category: 'events', label: 'Eingabe geändert', event: 'change',
    help: 'Startet, wenn sich der Wert eines Eingabefelds, einer Checkbox oder Auswahl ändert.',
    config: [{ key: 'element', label: 'Element', kind: 'element', elementEvent: 'change' }],
    outputs: () => [execOut(), data('value', 'Neuer Wert')],
    subtitle: (n, p) => p.elements.find((e) => e.id === n.config.element)?.name ?? '–',
    describe: (d) => `Wenn sich ${d.el(d.cfg.element)} ändert`,
    outPhrase: (_port, d) => `der neue Wert von ${d.el(d.cfg.element)}`,
  },
  {
    type: 'event.select', category: 'events', label: 'Eintrag gewählt', event: 'select',
    help: 'Startet, wenn in einer Liste oder Tabelle ein Eintrag angetippt wird.',
    config: [{ key: 'element', label: 'Liste/Tabelle', kind: 'element', elementEvent: 'select' }],
    outputs: () => [execOut(), data('item', 'Eintrag', 'record'), data('index', 'Position', 'number')],
    subtitle: (n, p) => p.elements.find((e) => e.id === n.config.element)?.name ?? '–',
    describe: (d) => `Wenn ein Eintrag in ${d.el(d.cfg.element)} gewählt wird`,
    outPhrase: (port, d) => (port === 'item'
      ? `der gewählte Eintrag aus ${d.el(d.cfg.element)}`
      : `die Position des gewählten Eintrags`),
  },
  {
    type: 'event.timer', category: 'events', label: 'Timer', event: 'timer',
    help: 'Startet regelmäßig, solange die App läuft.',
    config: [{ key: 'seconds', label: 'Alle … Sekunden', kind: 'number', default: 1 }],
    outputs: () => [execOut(), data('count', 'Durchgang', 'number')],
    subtitle: (n) => `alle ${n.config.seconds ?? 1} s`,
    describe: (d) => `Alle ${d.cfg.seconds ?? 1} Sekunden`,
    outPhrase: () => 'die Anzahl der bisherigen Timer-Durchgänge',
  },
  {
    type: 'event.custom', category: 'events', label: 'Eigener Ablauf', event: 'custom',
    help: 'Ein benannter Ablauf, den du mit »Ablauf starten« von überall aufrufen kannst – so musst du Schritte nicht doppelt bauen.',
    config: [{ key: 'name', label: 'Name', kind: 'text', default: 'Mein Ablauf' }],
    outputs: () => [execOut(), data('value', 'Übergabewert')],
    subtitle: (n) => n.config.name ?? '',
    describe: (d) => `Ablauf »${d.cfg.name ?? ''}«`,
    outPhrase: () => 'der übergebene Wert',
  },

  // ----- user interface -----------------------------------------------------------------------
  {
    type: 'ui.get', category: 'ui', label: 'Wert lesen',
    help: 'Liest den aktuellen Inhalt eines Elements: Eingabefeld → Text, Checkbox → Ja/Nein, Liste → Einträge.',
    config: [{ key: 'element', label: 'Element', kind: 'element', elementEvent: undefined }],
    outputs: () => [data('value', 'Wert')],
    subtitle: (n, p) => p.elements.find((e) => e.id === n.config.element)?.name ?? '–',
    eval: (c) => ({ value: c.rt.readElement(c.cfg.element) }),
    describe: (d) => `der Wert von ${d.el(d.cfg.element)}`,
  },
  {
    type: 'ui.setText', category: 'ui', label: 'Text setzen',
    help: 'Ändert den angezeigten Text einer Überschrift, eines Texts, Buttons oder einer Kennzahl.',
    config: [{ key: 'element', label: 'Element', kind: 'element', elementTypes: ['heading', 'text', 'button', 'kpi'] }],
    inputs: () => [execIn, data('text', 'Text', 'text')],
    outputs: () => [execOut()],
    subtitle: (n, p) => p.elements.find((e) => e.id === n.config.element)?.name ?? '–',
    run: (c) => {
      c.rt.setElement(c.cfg.element, { text: toText(c.input('text')) });
      return 'out';
    },
    describe: (d) => `Setze den Text von ${d.el(d.cfg.element)} auf ${d.in('text')}.`,
  },
  {
    type: 'ui.setValue', category: 'ui', label: 'Feld befüllen',
    help: 'Schreibt einen Wert in ein Eingabefeld, eine Checkbox oder Auswahl.',
    config: [{ key: 'element', label: 'Element', kind: 'element', elementEvent: 'change' }],
    inputs: () => [execIn, data('value', 'Wert')],
    outputs: () => [execOut()],
    subtitle: (n, p) => p.elements.find((e) => e.id === n.config.element)?.name ?? '–',
    run: (c) => {
      c.rt.setElement(c.cfg.element, { value: c.input('value') ?? '' });
      return 'out';
    },
    describe: (d) => `Trage ${d.in('value')} in ${d.el(d.cfg.element)} ein.`,
  },
  {
    type: 'ui.clear', category: 'ui', label: 'Eingaben leeren',
    help: 'Setzt alle Eingabefelder eines Screens auf ihren Startwert zurück.',
    config: [{ key: 'screen', label: 'Screen', kind: 'screen', placeholder: '(aktueller Screen)' }],
    inputs: () => [execIn],
    outputs: () => [execOut()],
    subtitle: (n, p) => p.screens.find((s) => s.id === n.config.screen)?.name ?? 'aktueller Screen',
    run: (c) => {
      c.rt.clearInputs(c.cfg.screen || c.rt.screenId);
      return 'out';
    },
    describe: (d) => `Leere alle Eingaben auf ${d.cfg.screen ? d.screen(d.cfg.screen) : 'dem aktuellen Screen'}.`,
  },
  {
    type: 'ui.visible', category: 'ui', label: 'Ein-/Ausblenden',
    help: 'Zeigt oder versteckt ein Element.',
    config: [{ key: 'element', label: 'Element', kind: 'element' }],
    inputs: () => [execIn, data('visible', 'Sichtbar', 'bool', true)],
    outputs: () => [execOut()],
    subtitle: (n, p) => p.elements.find((e) => e.id === n.config.element)?.name ?? '–',
    run: (c) => {
      c.rt.setElement(c.cfg.element, { hidden: !toBool(c.input('visible')) });
      return 'out';
    },
    describe: (d) => {
      const v = d.in('visible');
      if (v === 'ja') return `Blende ${d.el(d.cfg.element)} ein.`;
      if (v === 'nein') return `Blende ${d.el(d.cfg.element)} aus.`;
      return `Zeige ${d.el(d.cfg.element)} nur, wenn ${v}.`;
    },
  },
  {
    type: 'ui.items', category: 'ui', label: 'Liste befüllen',
    help: 'Zeigt eine Liste von Einträgen in einer Liste oder Tabelle an (statt direkt aus einer Datenbank-Tabelle).',
    config: [{ key: 'element', label: 'Liste/Tabelle', kind: 'element', elementEvent: 'select' }],
    inputs: () => [execIn, data('items', 'Einträge', 'list')],
    outputs: () => [execOut()],
    subtitle: (n, p) => p.elements.find((e) => e.id === n.config.element)?.name ?? '–',
    run: (c) => {
      c.rt.setElement(c.cfg.element, { items: toList(c.input('items')) });
      return 'out';
    },
    describe: (d) => `Zeige in ${d.el(d.cfg.element)} an: ${d.in('items')}.`,
  },
  {
    type: 'ui.navigate', category: 'ui', label: 'Gehe zu Screen',
    help: 'Wechselt zu einem anderen Screen.',
    config: [{ key: 'screen', label: 'Screen', kind: 'screen' }],
    inputs: () => [execIn],
    outputs: () => [execOut()],
    subtitle: (n, p) => p.screens.find((s) => s.id === n.config.screen)?.name ?? '–',
    run: async (c) => {
      if (!c.cfg.screen) throw new Error('Kein Screen gewählt');
      await c.rt.navigate(c.cfg.screen);
      return 'out';
    },
    describe: (d) => `Wechsle zum Screen ${d.screen(d.cfg.screen)}.`,
  },
  {
    type: 'ui.toast', category: 'ui', label: 'Meldung anzeigen',
    help: 'Blendet kurz eine Meldung ein.',
    config: [{
      key: 'style', label: 'Art', kind: 'select', default: 'info', options: [
        { value: 'info', label: 'Info' }, { value: 'success', label: 'Erfolg' },
        { value: 'warning', label: 'Warnung' }, { value: 'error', label: 'Fehler' }],
    }],
    inputs: () => [execIn, data('text', 'Text', 'text', 'Hallo!')],
    outputs: () => [execOut()],
    run: (c) => {
      c.rt.toast(toText(c.input('text')), c.cfg.style ?? 'info');
      return 'out';
    },
    describe: (d) => `Zeige die Meldung: ${d.in('text')}.`,
  },
  {
    type: 'ui.confirm', category: 'ui', label: 'Nachfragen',
    help: 'Fragt mit Ja/Nein nach und verzweigt je nach Antwort.',
    inputs: () => [execIn, data('text', 'Frage', 'text', 'Bist du sicher?')],
    outputs: () => [execOut('yes', 'Ja'), execOut('no', 'Nein')],
    run: async (c) => ((await c.rt.confirm(toText(c.input('text')))) ? 'yes' : 'no'),
    describe: (d) => `Frage nach: ${d.in('text')}`,
  },
  {
    type: 'ui.prompt', category: 'ui', label: 'Eingabe abfragen',
    help: 'Öffnet einen Dialog mit Eingabefeld. Bei »Abbrechen« geht es beim Ausgang »Abgebrochen« weiter.',
    inputs: () => [execIn, data('text', 'Frage', 'text', 'Bitte eingeben:'), data('default', 'Vorgabe', 'text', '')],
    outputs: () => [execOut('out', 'OK'), execOut('cancel', 'Abgebrochen'), data('value', 'Eingabe', 'text')],
    run: async (c) => {
      const v = await c.rt.prompt(toText(c.input('text')), toText(c.input('default')));
      if (v === null) return 'cancel';
      c.set('value', v);
      return 'out';
    },
    describe: (d) => `Frage per Dialog: ${d.in('text')}`,
    outPhrase: () => 'die Eingabe aus dem Dialog',
  },

  // ----- database -----------------------------------------------------------------------------
  {
    type: 'db.insert', category: 'data', label: 'Datensatz anlegen',
    help: 'Legt einen neuen Datensatz in einer Tabelle an. Jedes Feld bekommt einen Eingang.',
    config: [{ key: 'table', label: 'Tabelle', kind: 'table' }],
    inputs: (n, p) => [execIn, ...(tableOf(p, n.config.table)?.fields ?? []).map((f) =>
      data(`f:${f.id}`, f.name, f.type === 'number' ? 'number' : f.type === 'bool' ? 'bool' : 'text'))],
    outputs: () => [execOut(), data('record', 'Neuer Datensatz', 'record')],
    subtitle: (n, p) => tableOf(p, n.config.table)?.name ?? '–',
    run: (c) => {
      const t = needTable(c);
      const values: Record<string, any> = {};
      for (const f of t.fields) values[f.name] = c.input(`f:${f.id}`);
      c.set('record', c.rt.db.insert(t, values));
      return 'out';
    },
    describe: (d) => {
      const t = tableOf(d.p, d.cfg.table);
      const parts = (t?.fields ?? []).map((f) => `${f.name} = ${d.in(`f:${f.id}`)}`);
      return `Lege in ${d.table(d.cfg.table)} einen Datensatz an${parts.length ? ` mit ${parts.join(', ')}` : ''}.`;
    },
    outPhrase: () => 'der neu angelegte Datensatz',
  },
  {
    type: 'db.query', category: 'data', label: 'Datensätze holen', width: 250,
    help: 'Holt Datensätze aus einer Tabelle – auf Wunsch gefiltert und sortiert. Liefert die Liste, ihre Anzahl und den ersten Treffer.',
    config: [
      { key: 'table', label: 'Tabelle', kind: 'table' },
      ...filterConfig('table'),
      { key: 'sortField', label: 'Sortieren nach', kind: 'field', tableKey: 'table', placeholder: '(unsortiert)' },
      { key: 'sortDir', label: 'Richtung', kind: 'select', default: 'asc', options: [
        { value: 'asc', label: 'aufsteigend' }, { value: 'desc', label: 'absteigend' }], showIf: (c) => !!c.sortField },
      { key: 'limit', label: 'Höchstens (0 = alle)', kind: 'number', default: 0 },
    ],
    inputs: (n, p) => filterInputs(n, tableOf(p, n.config.table)),
    outputs: () => [data('list', 'Datensätze', 'list'), data('count', 'Anzahl', 'number'), data('first', 'Erster', 'record')],
    subtitle: (n, p) => tableOf(p, n.config.table)?.name ?? '–',
    eval: (c) => {
      const t = needTable(c);
      let list = applyFilter(c.rt.db.all(t.id), c.cfg.field, c.cfg.op ?? 'eq', c.input('value'));
      if (c.cfg.sortField) list = sortList(list, c.cfg.sortField, c.cfg.sortDir ?? 'asc');
      const lim = toNumber(c.cfg.limit);
      if (lim > 0) list = list.slice(0, lim);
      return { list, count: list.length, first: list[0] ?? null };
    },
    describe: (d) => {
      let s = `alle Datensätze aus ${d.table(d.cfg.table)}${filterPhrase(d, d.cfg.field, d.cfg.op ?? 'eq')}`;
      if (d.cfg.sortField) s += `, sortiert nach »${d.cfg.sortField}«${d.cfg.sortDir === 'desc' ? ' (absteigend)' : ''}`;
      if (toNumber(d.cfg.limit) > 0) s += `, höchstens ${d.cfg.limit}`;
      return s;
    },
    outPhrase: (port, d) => {
      const base = `Datensätze in ${d.table(d.cfg.table)}${filterPhrase(d, d.cfg.field, d.cfg.op ?? 'eq')}`;
      if (port === 'count') return `die Anzahl der ${base}`;
      if (port === 'first') return `der erste der ${base}`;
      return `alle ${base}`;
    },
  },
  {
    type: 'db.update', category: 'data', label: 'Datensatz ändern',
    help: 'Ändert ausgewählte Felder eines bestehenden Datensatzes.',
    config: [
      { key: 'table', label: 'Tabelle', kind: 'table' },
      { key: 'fields', label: 'Felder ändern', kind: 'fields', tableKey: 'table', default: [] },
    ],
    inputs: (n, p) => {
      const t = tableOf(p, n.config.table);
      const sel: string[] = n.config.fields ?? [];
      return [execIn, data('record', 'Datensatz', 'record'), ...(t?.fields ?? []).filter((f) => sel.includes(f.id)).map((f) =>
        data(`f:${f.id}`, f.name, f.type === 'number' ? 'number' : f.type === 'bool' ? 'bool' : 'text'))];
    },
    outputs: () => [execOut(), data('record', 'Geändert', 'record')],
    subtitle: (n, p) => tableOf(p, n.config.table)?.name ?? '–',
    run: (c) => {
      const t = needTable(c);
      const rec = c.input('record');
      const id = rec && typeof rec === 'object' ? rec.id : rec;
      const values: Record<string, any> = {};
      const sel: string[] = c.cfg.fields ?? [];
      for (const f of t.fields) if (sel.includes(f.id)) values[f.name] = c.input(`f:${f.id}`);
      const out = c.rt.db.update(t, toText(id), values);
      if (!out) throw new Error(`Datensatz nicht gefunden in »${t.name}«`);
      c.set('record', out);
      return 'out';
    },
    describe: (d) => {
      const t = tableOf(d.p, d.cfg.table);
      const sel: string[] = d.cfg.fields ?? [];
      const parts = (t?.fields ?? []).filter((f) => sel.includes(f.id)).map((f) => `${f.name} = ${d.in(`f:${f.id}`)}`);
      return `Ändere in ${d.table(d.cfg.table)} diesen Datensatz: ${d.in('record')}. Neue Werte: ${parts.join(', ') || '(keine Felder gewählt)'}.`;
    },
    outPhrase: () => 'der geänderte Datensatz',
  },
  {
    type: 'db.delete', category: 'data', label: 'Datensatz löschen',
    help: 'Löscht einen Datensatz aus einer Tabelle.',
    config: [{ key: 'table', label: 'Tabelle', kind: 'table' }],
    inputs: () => [execIn, data('record', 'Datensatz', 'record')],
    outputs: () => [execOut()],
    subtitle: (n, p) => tableOf(p, n.config.table)?.name ?? '–',
    run: (c) => {
      const t = needTable(c);
      const rec = c.input('record');
      c.rt.db.remove(t.id, toText(rec && typeof rec === 'object' ? rec.id : rec));
      return 'out';
    },
    describe: (d) => `Lösche aus ${d.table(d.cfg.table)} diesen Datensatz: ${d.in('record')}.`,
  },
  {
    type: 'db.clear', category: 'data', label: 'Tabelle leeren',
    help: 'Löscht alle Datensätze einer Tabelle.',
    config: [{ key: 'table', label: 'Tabelle', kind: 'table' }],
    inputs: () => [execIn],
    outputs: () => [execOut()],
    subtitle: (n, p) => tableOf(p, n.config.table)?.name ?? '–',
    run: (c) => {
      c.rt.db.clear(needTable(c).id);
      return 'out';
    },
    describe: (d) => `Lösche alle Datensätze in ${d.table(d.cfg.table)}.`,
  },

  // ----- logic ----------------------------------------------------------------------------------
  {
    type: 'logic.if', category: 'logic', label: 'Wenn / Sonst',
    help: 'Verzweigt: Ist die Bedingung erfüllt, geht es bei »Ja« weiter, sonst bei »Nein«.',
    inputs: () => [execIn, data('cond', 'Bedingung', 'bool')],
    outputs: () => [execOut('yes', 'Ja'), execOut('no', 'Nein')],
    run: (c) => (toBool(c.input('cond')) ? 'yes' : 'no'),
    describe: (d) => `Prüfe, ob ${d.in('cond')}`,
  },
  {
    type: 'logic.compare', category: 'logic', label: 'Vergleichen',
    help: 'Vergleicht zwei Werte. Zahlen werden als Zahlen verglichen, Text ohne Groß-/Kleinschreibung.',
    config: [{ key: 'op', label: 'Vergleich', kind: 'select', options: OP_OPTIONS, default: 'eq' }],
    inputs: (n) => (opNeedsValue(n.config.op ?? 'eq') ? [data('a', 'A'), data('b', 'B')] : [data('a', 'A')]),
    outputs: () => [data('result', 'Ergebnis', 'bool')],
    subtitle: (n) => COMPARE_OPS.find((o) => o.value === (n.config.op ?? 'eq'))?.label ?? '',
    eval: (c) => ({ result: compare(c.input('a'), c.cfg.op ?? 'eq', c.input('b')) }),
    describe: (d) => condPhrase(d.in('a'), d.cfg.op ?? 'eq', opNeedsValue(d.cfg.op ?? 'eq') ? d.in('b') : ''),
  },
  {
    type: 'logic.combine', category: 'logic', label: 'Und / Oder',
    help: 'Verknüpft zwei Bedingungen.',
    config: [{ key: 'op', label: 'Verknüpfung', kind: 'select', default: 'and', options: [
      { value: 'and', label: 'UND (beide)' }, { value: 'or', label: 'ODER (mindestens eine)' }] }],
    inputs: () => [data('a', 'A', 'bool'), data('b', 'B', 'bool')],
    outputs: () => [data('result', 'Ergebnis', 'bool')],
    subtitle: (n) => ((n.config.op ?? 'and') === 'and' ? 'UND' : 'ODER'),
    eval: (c) => ({
      result: (c.cfg.op ?? 'and') === 'and'
        ? toBool(c.input('a')) && toBool(c.input('b'))
        : toBool(c.input('a')) || toBool(c.input('b')),
    }),
    describe: (d) => `(${d.in('a')} ${(d.cfg.op ?? 'and') === 'and' ? 'und' : 'oder'} ${d.in('b')})`,
  },
  {
    type: 'logic.not', category: 'logic', label: 'Nicht',
    help: 'Kehrt Ja/Nein um.',
    inputs: () => [data('a', 'Wert', 'bool')],
    outputs: () => [data('result', 'Gegenteil', 'bool')],
    eval: (c) => ({ result: !toBool(c.input('a')) }),
    describe: (d) => `das Gegenteil von (${d.in('a')})`,
  },
  {
    type: 'logic.switch', category: 'logic', label: 'Verzweigen nach Wert',
    help: 'Wählt je nach Wert einen von mehreren Wegen. Fälle kommagetrennt eintragen.',
    config: [{ key: 'cases', label: 'Fälle (kommagetrennt)', kind: 'text', default: 'A, B' }],
    inputs: () => [execIn, data('value', 'Wert')],
    outputs: (n) => [
      ...String(n.config.cases ?? '').split(',').map((s) => s.trim()).filter(Boolean)
        .map((s, i) => execOut(`c${i}`, s)),
      execOut('else', 'Sonst'),
    ],
    run: (c) => {
      const cases = String(c.cfg.cases ?? '').split(',').map((s) => s.trim()).filter(Boolean);
      const v = c.input('value');
      const i = cases.findIndex((x) => compare(v, 'eq', x));
      return i >= 0 ? `c${i}` : 'else';
    },
    describe: (d) => `Unterscheide nach ${d.in('value')}`,
  },

  // ----- loops ----------------------------------------------------------------------------------
  {
    type: 'loop.each', category: 'loop', label: 'Für jedes Element',
    help: 'Führt die Schritte bei »Für jedes« einmal pro Element der Liste aus, danach geht es bei »Danach« weiter.',
    inputs: () => [execIn, data('list', 'Liste', 'list')],
    outputs: () => [execOut('body', 'Für jedes'), execOut('done', 'Danach'), data('item', 'Element'), data('index', 'Position', 'number')],
    run: async (c) => {
      const list = [...toList(c.input('list'))];
      for (let i = 0; i < list.length; i++) {
        c.set('item', list[i]);
        c.set('index', i + 1);
        await c.fire('body');
      }
      return 'done';
    },
    describe: (d) => `Für jedes Element der Liste (${d.in('list')})`,
    outPhrase: (port) => (port === 'item' ? 'das aktuelle Element' : 'die aktuelle Position'),
  },
  {
    type: 'loop.repeat', category: 'loop', label: 'N-mal wiederholen',
    help: 'Wiederholt die Schritte bei »Durchlauf« so oft wie angegeben.',
    inputs: () => [execIn, data('times', 'Anzahl', 'number', 3)],
    outputs: () => [execOut('body', 'Durchlauf'), execOut('done', 'Danach'), data('i', 'Nummer', 'number')],
    run: async (c) => {
      const n = Math.min(100000, Math.max(0, Math.floor(toNumber(c.input('times')))));
      for (let i = 1; i <= n; i++) {
        c.set('i', i);
        await c.fire('body');
      }
      return 'done';
    },
    describe: (d) => `Wiederhole ${d.in('times')}-mal`,
    outPhrase: () => 'die Nummer des Durchlaufs',
  },
  {
    type: 'loop.while', category: 'loop', label: 'Solange',
    help: 'Wiederholt, solange die Bedingung erfüllt ist (höchstens 10.000-mal).',
    inputs: () => [execIn, data('cond', 'Bedingung', 'bool')],
    outputs: () => [execOut('body', 'Durchlauf'), execOut('done', 'Danach'), data('i', 'Nummer', 'number')],
    run: async (c) => {
      let i = 0;
      while (toBool(c.input('cond'))) {
        if (++i > 10000) throw new Error('»Solange« nach 10.000 Durchläufen abgebrochen – endet die Bedingung nie?');
        c.set('i', i);
        await c.fire('body');
      }
      return 'done';
    },
    describe: (d) => `Wiederhole, solange ${d.in('cond')}`,
    outPhrase: () => 'die Nummer des Durchlaufs',
  },

  // ----- lists and counting ---------------------------------------------------------------------
  {
    type: 'list.count', category: 'list', label: 'Zählen',
    help: 'Zählt die Einträge einer Liste – alle, oder nur die, die eine Bedingung erfüllen.',
    config: filterConfig(),
    inputs: (n) => [data('list', 'Liste', 'list'), ...filterInputs(n)],
    outputs: () => [data('count', 'Anzahl', 'number')],
    subtitle: (n) => (n.config.field ? `wo ${n.config.field} …` : 'alle'),
    eval: (c) => ({ count: applyFilter(toList(c.input('list')), c.cfg.field, c.cfg.op ?? 'eq', c.input('value')).length }),
    describe: (d) => `die Anzahl der Einträge der Liste (${d.in('list')})${filterPhrase(d, d.cfg.field, d.cfg.op ?? 'eq')}`,
  },
  {
    type: 'list.aggregate', category: 'list', label: 'Summe / Schnitt',
    help: 'Berechnet Summe, Durchschnitt, Minimum oder Maximum über ein Feld aller Einträge.',
    config: [
      { key: 'op', label: 'Berechnung', kind: 'select', default: 'sum', options: [
        { value: 'sum', label: 'Summe' }, { value: 'avg', label: 'Durchschnitt' },
        { value: 'min', label: 'Minimum' }, { value: 'max', label: 'Maximum' }] },
      { key: 'field', label: 'Feld', kind: 'field', placeholder: '(Einträge selbst)' },
    ],
    inputs: () => [data('list', 'Liste', 'list')],
    outputs: () => [data('result', 'Ergebnis', 'number')],
    subtitle: (n) => `${{ sum: 'Summe', avg: 'Schnitt', min: 'Min', max: 'Max' }[n.config.op as string ?? 'sum'] ?? ''} ${n.config.field ?? ''}`,
    eval: (c) => {
      const nums = toList(c.input('list')).map((r) => toNumber(c.cfg.field ? getField(r, c.cfg.field) : r));
      const op = c.cfg.op ?? 'sum';
      if (!nums.length) return { result: 0 };
      const sum = nums.reduce((a, b) => a + b, 0);
      const result = op === 'avg' ? sum / nums.length : op === 'min' ? Math.min(...nums) : op === 'max' ? Math.max(...nums) : sum;
      return { result };
    },
    describe: (d) => {
      const w = ({ sum: 'die Summe', avg: 'der Durchschnitt', min: 'das Minimum', max: 'das Maximum' } as Record<string, string>)[d.cfg.op ?? 'sum'];
      return `${w} ${d.cfg.field ? `von »${d.cfg.field}« ` : ''}über die Liste (${d.in('list')})`;
    },
  },
  {
    type: 'list.filter', category: 'list', label: 'Filtern',
    help: 'Behält nur die Einträge, die die Bedingung erfüllen.',
    config: [
      { key: 'field', label: 'Feld', kind: 'field', placeholder: '(Einträge selbst)' },
      { key: 'op', label: 'Bedingung', kind: 'select', options: OP_OPTIONS, default: 'eq' },
    ],
    inputs: (n) => [data('list', 'Liste', 'list'), ...(opNeedsValue(n.config.op ?? 'eq') ? [data('value', 'Wert')] : [])],
    outputs: () => [data('list', 'Treffer', 'list')],
    eval: (c) => {
      const list = toList(c.input('list'));
      const op = c.cfg.op ?? 'eq';
      const v = c.input('value');
      return { list: list.filter((r) => compare(c.cfg.field ? getField(r, c.cfg.field) : r, op, v)) };
    },
    describe: (d) => `die Einträge der Liste (${d.in('list')}), bei denen ${condPhrase(d.cfg.field ? `»${d.cfg.field}«` : 'der Eintrag', d.cfg.op ?? 'eq', opNeedsValue(d.cfg.op ?? 'eq') ? d.in('value') : '')}`,
  },
  {
    type: 'list.sort', category: 'list', label: 'Sortieren',
    help: 'Sortiert eine Liste nach einem Feld.',
    config: [
      { key: 'field', label: 'Feld', kind: 'field', placeholder: '(Einträge selbst)' },
      { key: 'dir', label: 'Richtung', kind: 'select', default: 'asc', options: [
        { value: 'asc', label: 'aufsteigend' }, { value: 'desc', label: 'absteigend' }] },
    ],
    inputs: () => [data('list', 'Liste', 'list')],
    outputs: () => [data('list', 'Sortiert', 'list')],
    eval: (c) => ({ list: sortList(toList(c.input('list')), c.cfg.field, c.cfg.dir ?? 'asc') }),
    describe: (d) => `die Liste (${d.in('list')}), sortiert nach ${d.cfg.field ? `»${d.cfg.field}«` : 'Wert'}${d.cfg.dir === 'desc' ? ' (absteigend)' : ''}`,
  },
  {
    type: 'list.field', category: 'list', label: 'Feld lesen',
    help: 'Liest ein Feld aus einem Datensatz, z. B. den Namen eines Kunden.',
    config: [{ key: 'field', label: 'Feld', kind: 'field' }],
    inputs: () => [data('record', 'Datensatz', 'record')],
    outputs: () => [data('value', 'Wert')],
    subtitle: (n) => n.config.field ?? '',
    eval: (c) => ({ value: c.cfg.field ? getField(c.input('record'), c.cfg.field) ?? null : null }),
    describe: (d) => `${d.in('record')} → Feld »${d.cfg.field ?? '?'}«`,
  },
  {
    type: 'list.at', category: 'list', label: 'Element holen',
    help: 'Holt das erste, letzte oder n-te Element einer Liste.',
    config: [{ key: 'which', label: 'Welches', kind: 'select', default: 'first', options: [
      { value: 'first', label: 'Erstes' }, { value: 'last', label: 'Letztes' }, { value: 'nth', label: 'An Position …' }] }],
    inputs: (n) => [data('list', 'Liste', 'list'), ...(n.config.which === 'nth' ? [data('index', 'Position', 'number', 1)] : [])],
    outputs: () => [data('item', 'Element')],
    eval: (c) => {
      const list = toList(c.input('list'));
      const w = c.cfg.which ?? 'first';
      const i = w === 'first' ? 0 : w === 'last' ? list.length - 1 : Math.floor(toNumber(c.input('index'))) - 1;
      return { item: list[i] ?? null };
    },
    describe: (d) => {
      const w = d.cfg.which ?? 'first';
      return w === 'first' ? `das erste Element der Liste (${d.in('list')})`
        : w === 'last' ? `das letzte Element der Liste (${d.in('list')})`
          : `das Element an Position ${d.in('index')} der Liste (${d.in('list')})`;
    },
  },
  {
    type: 'list.join', category: 'list', label: 'Zu Text verbinden',
    help: 'Macht aus einer Liste einen Text, z. B. »Anna, Ben, Carla«.',
    config: [
      { key: 'field', label: 'Feld', kind: 'field', placeholder: '(Einträge selbst)' },
      { key: 'sep', label: 'Trennzeichen', kind: 'text', default: ', ' },
    ],
    inputs: () => [data('list', 'Liste', 'list')],
    outputs: () => [data('text', 'Text', 'text')],
    eval: (c) => ({
      text: toList(c.input('list')).map((r) => toText(c.cfg.field ? getField(r, c.cfg.field) : r)).join(c.cfg.sep ?? ', '),
    }),
    describe: (d) => `die Liste (${d.in('list')}) als Text`,
  },

  // ----- math -----------------------------------------------------------------------------------
  {
    type: 'math.calc', category: 'math', label: 'Rechnen',
    help: 'Rechnet mit zwei Zahlen.',
    config: [{ key: 'op', label: 'Rechenart', kind: 'select', default: 'add', options: [
      { value: 'add', label: '+ plus' }, { value: 'sub', label: '− minus' }, { value: 'mul', label: '× mal' },
      { value: 'div', label: '÷ geteilt' }, { value: 'mod', label: 'Rest (mod)' }, { value: 'pow', label: 'hoch' },
      { value: 'min', label: 'kleinere' }, { value: 'max', label: 'größere' }] }],
    inputs: () => [data('a', 'A', 'number', 0), data('b', 'B', 'number', 0)],
    outputs: () => [data('result', 'Ergebnis', 'number')],
    subtitle: (n) => ({ add: '+', sub: '−', mul: '×', div: '÷', mod: 'mod', pow: '^', min: 'min', max: 'max' } as Record<string, string>)[n.config.op ?? 'add'],
    eval: (c) => {
      const a = toNumber(c.input('a'));
      const b = toNumber(c.input('b'));
      const op = c.cfg.op ?? 'add';
      if ((op === 'div' || op === 'mod') && b === 0) throw new Error('Division durch 0');
      const r = op === 'add' ? a + b : op === 'sub' ? a - b : op === 'mul' ? a * b : op === 'div' ? a / b
        : op === 'mod' ? a % b : op === 'pow' ? a ** b : op === 'min' ? Math.min(a, b) : Math.max(a, b);
      return { result: r };
    },
    describe: (d) => {
      const op = d.cfg.op ?? 'add';
      if (op === 'min') return `die kleinere Zahl von ${d.in('a')} und ${d.in('b')}`;
      if (op === 'max') return `die größere Zahl von ${d.in('a')} und ${d.in('b')}`;
      const sym = ({ add: '+', sub: '−', mul: '×', div: '÷', mod: 'mod', pow: '^' } as Record<string, string>)[op];
      return `(${d.in('a')} ${sym} ${d.in('b')})`;
    },
  },
  {
    type: 'math.round', category: 'math', label: 'Runden',
    help: 'Rundet auf die gewünschte Anzahl Nachkommastellen.',
    config: [{ key: 'digits', label: 'Nachkommastellen', kind: 'number', default: 0 }],
    inputs: () => [data('a', 'Zahl', 'number', 0)],
    outputs: () => [data('result', 'Gerundet', 'number')],
    eval: (c) => {
      const f = 10 ** Math.max(0, Math.min(10, toNumber(c.cfg.digits)));
      return { result: Math.round(toNumber(c.input('a')) * f) / f };
    },
    describe: (d) => `${d.in('a')} gerundet auf ${toNumber(d.cfg.digits)} Nachkommastellen`,
  },
  {
    type: 'math.random', category: 'math', label: 'Zufallszahl',
    help: 'Eine ganze Zufallszahl zwischen Minimum und Maximum (beide eingeschlossen).',
    inputs: () => [data('min', 'Min', 'number', 1), data('max', 'Max', 'number', 6)],
    outputs: () => [data('result', 'Zahl', 'number')],
    eval: (c) => {
      const lo = Math.ceil(toNumber(c.input('min')));
      const hi = Math.floor(toNumber(c.input('max')));
      return { result: lo + Math.floor(Math.random() * (hi - lo + 1)) };
    },
    describe: (d) => `eine Zufallszahl zwischen ${d.in('min')} und ${d.in('max')}`,
  },

  // ----- text and values ------------------------------------------------------------------------
  {
    type: 'value.const', category: 'text', label: 'Wert',
    help: 'Ein fester Wert: Text, Zahl oder Ja/Nein.',
    config: [
      { key: 'vtype', label: 'Art', kind: 'select', default: 'text', options: [
        { value: 'text', label: 'Text' }, { value: 'number', label: 'Zahl' }, { value: 'bool', label: 'Ja/Nein' }] },
      { key: 'value', label: 'Wert', kind: 'text', default: '' },
    ],
    outputs: (n) => [data('value', 'Wert', (n.config.vtype ?? 'text') as DataType)],
    subtitle: (n) => String(n.config.value ?? ''),
    eval: (c) => {
      const t = c.cfg.vtype ?? 'text';
      return { value: t === 'number' ? toNumber(c.cfg.value) : t === 'bool' ? toBool(c.cfg.value) : toText(c.cfg.value) };
    },
    describe: (d) => {
      const t = d.cfg.vtype ?? 'text';
      if (t === 'number') return String(toNumber(d.cfg.value));
      if (t === 'bool') return toBool(d.cfg.value) ? 'ja' : 'nein';
      return `„${toText(d.cfg.value)}“`;
    },
  },
  {
    type: 'text.template', category: 'text', label: 'Text zusammensetzen', width: 250,
    help: 'Baut einen Text aus Bausteinen. Jeder Platzhalter in {geschweiften Klammern} bekommt einen eigenen Eingang.',
    config: [{ key: 'template', label: 'Vorlage', kind: 'textarea', default: 'Hallo {Name}!' }],
    inputs: (n) => templatePlaceholders(String(n.config.template ?? '')).map((p) => data(`p:${p}`, p)),
    outputs: () => [data('text', 'Text', 'text')],
    eval: (c) => {
      const tpl = String(c.cfg.template ?? '');
      const vals: Record<string, any> = {};
      for (const p of templatePlaceholders(tpl)) vals[p] = c.input(`p:${p}`);
      return { text: tpl.replace(/\{([^}]+)\}/g, (_, n: string) => fillTemplate('{Wert}', vals[n.trim()])) };
    },
    describe: (d) => {
      const ps = templatePlaceholders(String(d.cfg.template ?? ''));
      const parts = ps.map((p) => `${p} = ${d.in(`p:${p}`)}`);
      return `der Text „${d.cfg.template ?? ''}“${parts.length ? ` (mit ${parts.join(', ')})` : ''}`;
    },
  },
  {
    type: 'text.transform', category: 'text', label: 'Text umwandeln',
    help: 'Groß-/Kleinschreibung, Leerzeichen entfernen, Länge ermitteln oder in eine Zahl umwandeln.',
    config: [{ key: 'op', label: 'Umwandlung', kind: 'select', default: 'upper', options: [
      { value: 'upper', label: 'GROSSBUCHSTABEN' }, { value: 'lower', label: 'kleinbuchstaben' },
      { value: 'trim', label: 'Leerzeichen am Rand entfernen' }, { value: 'length', label: 'Länge (Zeichen)' },
      { value: 'number', label: 'In Zahl umwandeln' }] }],
    inputs: () => [data('text', 'Text', 'text')],
    outputs: (n) => [data('result', 'Ergebnis', ['length', 'number'].includes(n.config.op) ? 'number' : 'text')],
    subtitle: (n) => ({ upper: 'GROSS', lower: 'klein', trim: 'trimmen', length: 'Länge', number: '→ Zahl' } as Record<string, string>)[n.config.op ?? 'upper'],
    eval: (c) => {
      const s = toText(c.input('text'));
      const op = c.cfg.op ?? 'upper';
      return {
        result: op === 'upper' ? s.toUpperCase() : op === 'lower' ? s.toLowerCase() : op === 'trim' ? s.trim()
          : op === 'length' ? s.length : toNumber(s),
      };
    },
    describe: (d) => {
      const op = d.cfg.op ?? 'upper';
      if (op === 'length') return `die Länge von ${d.in('text')}`;
      if (op === 'number') return `${d.in('text')} als Zahl`;
      return `${d.in('text')} ${({ upper: 'in Großbuchstaben', lower: 'in Kleinbuchstaben', trim: 'ohne Leerzeichen am Rand' } as Record<string, string>)[op]}`;
    },
  },
  {
    type: 'value.now', category: 'text', label: 'Jetzt (Datum/Zeit)',
    help: 'Das aktuelle Datum und/oder die Uhrzeit.',
    config: [{ key: 'format', label: 'Format', kind: 'select', default: 'date', options: [
      { value: 'date', label: 'Datum (28.10.2026)' }, { value: 'time', label: 'Uhrzeit (14:30)' },
      { value: 'datetime', label: 'Datum und Uhrzeit' }, { value: 'iso', label: 'ISO (2026-10-28)' },
      { value: 'weekday', label: 'Wochentag' }, { value: 'year', label: 'Jahr (Zahl)' }] }],
    outputs: (n) => [data('value', 'Wert', n.config.format === 'year' ? 'number' : 'text')],
    subtitle: (n) => n.config.format ?? 'date',
    eval: (c) => {
      const d = new Date();
      const f = c.cfg.format ?? 'date';
      const value = f === 'time' ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : f === 'datetime' ? d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
          : f === 'iso' ? d.toISOString().slice(0, 10)
            : f === 'weekday' ? d.toLocaleDateString('de-DE', { weekday: 'long' })
              : f === 'year' ? d.getFullYear()
                : d.toLocaleDateString('de-DE');
      return { value };
    },
    describe: (d) => ({ date: 'das heutige Datum', time: 'die aktuelle Uhrzeit', datetime: 'Datum und Uhrzeit von jetzt', iso: 'das heutige Datum', weekday: 'der heutige Wochentag', year: 'das aktuelle Jahr' } as Record<string, string>)[d.cfg.format ?? 'date'],
  },

  // ----- variables ------------------------------------------------------------------------------
  {
    type: 'var.get', category: 'vars', label: 'Variable lesen',
    help: 'Liest den aktuellen Wert einer Variablen. Variablen merken sich Werte, solange die App läuft.',
    config: [{ key: 'variable', label: 'Variable', kind: 'variable' }],
    outputs: (n, p) => [data('value', 'Wert', p.variables.find((v) => v.id === n.config.variable)?.type ?? 'any')],
    subtitle: (n, p) => p.variables.find((v) => v.id === n.config.variable)?.name ?? '–',
    eval: (c) => ({ value: c.rt.getVar(c.cfg.variable) }),
    describe: (d) => `die Variable ${d.variable(d.cfg.variable)}`,
  },
  {
    type: 'var.set', category: 'vars', label: 'Variable setzen',
    help: 'Speichert einen Wert in einer Variablen.',
    config: [{ key: 'variable', label: 'Variable', kind: 'variable' }],
    inputs: (n, p) => [execIn, data('value', 'Wert', p.variables.find((v) => v.id === n.config.variable)?.type ?? 'any')],
    outputs: () => [execOut()],
    subtitle: (n, p) => p.variables.find((v) => v.id === n.config.variable)?.name ?? '–',
    run: (c) => {
      c.rt.setVar(c.cfg.variable, c.input('value'));
      return 'out';
    },
    describe: (d) => `Setze die Variable ${d.variable(d.cfg.variable)} auf ${d.in('value')}.`,
  },
  {
    type: 'var.add', category: 'vars', label: 'Variable erhöhen',
    help: 'Zählt eine Zahl-Variable hoch (oder mit negativem Wert herunter).',
    config: [{ key: 'variable', label: 'Variable', kind: 'variable' }],
    inputs: () => [execIn, data('by', 'um', 'number', 1)],
    outputs: () => [execOut(), data('value', 'Neuer Wert', 'number')],
    subtitle: (n, p) => p.variables.find((v) => v.id === n.config.variable)?.name ?? '–',
    run: (c) => {
      const v = toNumber(c.rt.getVar(c.cfg.variable)) + toNumber(c.input('by'));
      c.rt.setVar(c.cfg.variable, v);
      c.set('value', v);
      return 'out';
    },
    describe: (d) => `Erhöhe die Variable ${d.variable(d.cfg.variable)} um ${d.in('by')}.`,
    outPhrase: (_p, d) => `der neue Wert von ${d.variable(d.cfg.variable)}`,
  },
  {
    type: 'var.push', category: 'vars', label: 'An Liste anhängen',
    help: 'Hängt einen Wert an eine Listen-Variable an.',
    config: [{ key: 'variable', label: 'Variable', kind: 'variable' }],
    inputs: () => [execIn, data('value', 'Wert')],
    outputs: () => [execOut()],
    subtitle: (n, p) => p.variables.find((v) => v.id === n.config.variable)?.name ?? '–',
    run: (c) => {
      c.rt.setVar(c.cfg.variable, [...toList(c.rt.getVar(c.cfg.variable)), c.input('value')]);
      return 'out';
    },
    describe: (d) => `Hänge an die Liste ${d.variable(d.cfg.variable)} an: ${d.in('value')}.`,
  },

  // ----- flow -----------------------------------------------------------------------------------
  {
    type: 'flow.call', category: 'flow', label: 'Ablauf starten',
    help: 'Führt einen »Eigenen Ablauf« aus und macht danach hier weiter.',
    config: [{ key: 'name', label: 'Ablauf', kind: 'custom' }],
    inputs: () => [execIn, data('value', 'Übergabe')],
    outputs: () => [execOut()],
    subtitle: (n) => n.config.name ?? '–',
    run: async (c) => {
      if (!c.cfg.name) throw new Error('Kein Ablauf gewählt');
      await c.rt.callCustom(c.cfg.name, c.input('value'));
      return 'out';
    },
    describe: (d) => `Führe den Ablauf »${d.cfg.name ?? '?'}« aus.`,
  },
  {
    type: 'flow.delay', category: 'flow', label: 'Warten',
    help: 'Wartet einige Sekunden, bevor es weitergeht.',
    inputs: () => [execIn, data('seconds', 'Sekunden', 'number', 1)],
    outputs: () => [execOut()],
    run: async (c) => {
      await c.rt.sleep(sleepGuard(toNumber(c.input('seconds'))));
      return 'out';
    },
    describe: (d) => `Warte ${d.in('seconds')} Sekunden.`,
  },
  {
    type: 'flow.log', category: 'flow', label: 'Protokollieren',
    help: 'Schreibt einen Wert ins Protokoll der Vorschau – praktisch zum Ausprobieren.',
    inputs: () => [execIn, data('value', 'Wert')],
    outputs: () => [execOut()],
    run: (c) => {
      const v = c.input('value');
      c.rt.log(typeof v === 'object' && v !== null ? JSON.stringify(v) : toText(v));
      return 'out';
    },
    describe: (d) => `Schreibe ins Protokoll: ${d.in('value')}.`,
  },
  {
    type: 'note', category: 'note', label: 'Notiz', width: 220,
    help: 'Ein Klebezettel für Erklärungen im Workflow.',
    config: [{ key: 'text', label: 'Text', kind: 'textarea', default: 'Notiz …' }],
    describe: (d) => String(d.cfg.text ?? ''),
  },
];

export const NODE_DEFS: Record<string, NodeDef> = Object.fromEntries(defs.map((d) => [d.type, d]));
export const NODE_LIST = defs;

export function nodeDef(type: string): NodeDef | undefined {
  return NODE_DEFS[type];
}

export function inputsOf(n: FlowNode, p: Project): PortDef[] {
  return NODE_DEFS[n.type]?.inputs?.(n, p) ?? [];
}

export function outputsOf(n: FlowNode, p: Project): PortDef[] {
  return NODE_DEFS[n.type]?.outputs?.(n, p) ?? [];
}

export function isPure(def: NodeDef): boolean {
  return !!def.eval;
}

export function defaultConfig(def: NodeDef): Record<string, any> {
  const cfg: Record<string, any> = {};
  for (const f of def.config ?? []) if (f.default !== undefined) cfg[f.key] = Array.isArray(f.default) ? [...f.default] : f.default;
  return cfg;
}

export function literalKey(port: string): string {
  return `in.${port}`;
}
