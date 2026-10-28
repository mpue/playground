import type { DeviceKind, ElementType, Project, UIElement } from './types';

export type PropKind = 'text' | 'textarea' | 'number' | 'select' | 'color' | 'bool' | 'lines' | 'table';

export interface PropField {
  key: string;
  label: string;
  kind: PropKind;
  options?: { value: string; label: string }[];
  hint?: string;
}

export type ElementEvent = 'click' | 'change' | 'select';

export interface ElementDef {
  type: ElementType;
  label: string;
  /** What a palette tooltip says. */
  hint: string;
  w: number;
  h: number;
  props: PropField[];
  defaults: Record<string, any>;
  /** The prop a double-click edits in place. */
  textProp?: string;
  events: ElementEvent[];
  /** Whether "Wert lesen" gives something meaningful. */
  readable: boolean;
  /** Board-only things are never part of the running app. */
  boardOnly?: boolean;
}

const ALIGN = [
  { value: 'left', label: 'Links' },
  { value: 'center', label: 'Mitte' },
  { value: 'right', label: 'Rechts' },
];

export const NOTE_COLORS = ['#fff3a3', '#ffd6a5', '#caffbf', '#9bf6ff', '#bdb2ff', '#ffc6ff'];

export const ELEMENT_DEFS: Record<ElementType, ElementDef> = {
  heading: {
    type: 'heading', label: 'Überschrift', hint: 'Große Überschrift', w: 300, h: 40,
    props: [
      { key: 'text', label: 'Text', kind: 'text' },
      { key: 'size', label: 'Größe', kind: 'select', options: [
        { value: '18', label: 'Klein' }, { value: '24', label: 'Mittel' }, { value: '32', label: 'Groß' }] },
      { key: 'align', label: 'Ausrichtung', kind: 'select', options: ALIGN },
      { key: 'color', label: 'Farbe', kind: 'color' },
    ],
    defaults: { text: 'Überschrift', size: '24', align: 'left', color: '#0f172a' },
    textProp: 'text', events: ['click'], readable: true,
  },
  text: {
    type: 'text', label: 'Text', hint: 'Fließtext oder Beschriftung', w: 300, h: 44,
    props: [
      { key: 'text', label: 'Text', kind: 'textarea' },
      { key: 'size', label: 'Schriftgröße', kind: 'number' },
      { key: 'align', label: 'Ausrichtung', kind: 'select', options: ALIGN },
      { key: 'color', label: 'Farbe', kind: 'color' },
    ],
    defaults: { text: 'Ein kurzer Text', size: 15, align: 'left', color: '#334155' },
    textProp: 'text', events: ['click'], readable: true,
  },
  button: {
    type: 'button', label: 'Button', hint: 'Löst beim Klick einen Ablauf aus', w: 160, h: 44,
    props: [
      { key: 'text', label: 'Beschriftung', kind: 'text' },
      { key: 'variant', label: 'Stil', kind: 'select', options: [
        { value: 'primary', label: 'Primär' }, { value: 'secondary', label: 'Sekundär' },
        { value: 'danger', label: 'Gefahr' }, { value: 'ghost', label: 'Dezent' }] },
    ],
    defaults: { text: 'Button', variant: 'primary' },
    textProp: 'text', events: ['click'], readable: true,
  },
  input: {
    type: 'input', label: 'Eingabefeld', hint: 'Einzeilige Eingabe', w: 300, h: 66,
    props: [
      { key: 'label', label: 'Bezeichnung', kind: 'text' },
      { key: 'placeholder', label: 'Platzhalter', kind: 'text' },
      { key: 'inputType', label: 'Art', kind: 'select', options: [
        { value: 'text', label: 'Text' }, { value: 'number', label: 'Zahl' },
        { value: 'email', label: 'E-Mail' }, { value: 'date', label: 'Datum' },
        { value: 'password', label: 'Passwort' }] },
      { key: 'value', label: 'Startwert', kind: 'text' },
    ],
    defaults: { label: 'Bezeichnung', placeholder: 'Eingeben …', inputType: 'text', value: '' },
    textProp: 'label', events: ['change'], readable: true,
  },
  textarea: {
    type: 'textarea', label: 'Textbereich', hint: 'Mehrzeilige Eingabe', w: 300, h: 120,
    props: [
      { key: 'label', label: 'Bezeichnung', kind: 'text' },
      { key: 'placeholder', label: 'Platzhalter', kind: 'text' },
      { key: 'value', label: 'Startwert', kind: 'textarea' },
    ],
    defaults: { label: 'Notiz', placeholder: 'Eingeben …', value: '' },
    textProp: 'label', events: ['change'], readable: true,
  },
  checkbox: {
    type: 'checkbox', label: 'Checkbox', hint: 'Ja/Nein-Auswahl', w: 220, h: 30,
    props: [
      { key: 'label', label: 'Beschriftung', kind: 'text' },
      { key: 'checked', label: 'Angehakt', kind: 'bool' },
    ],
    defaults: { label: 'Option', checked: false },
    textProp: 'label', events: ['change'], readable: true,
  },
  select: {
    type: 'select', label: 'Auswahl', hint: 'Dropdown mit festen Optionen', w: 300, h: 66,
    props: [
      { key: 'label', label: 'Bezeichnung', kind: 'text' },
      { key: 'options', label: 'Optionen (eine pro Zeile)', kind: 'lines' },
      { key: 'value', label: 'Startwert', kind: 'text' },
    ],
    defaults: { label: 'Auswahl', options: ['Option A', 'Option B', 'Option C'], value: '' },
    textProp: 'label', events: ['change'], readable: true,
  },
  list: {
    type: 'list', label: 'Liste', hint: 'Zeigt Einträge, z. B. aus einer Tabelle', w: 300, h: 220,
    props: [
      { key: 'source', label: 'Daten aus Tabelle', kind: 'table', hint: 'Leer lassen, wenn der Workflow die Liste befüllt.' },
      { key: 'itemTemplate', label: 'Zeilen-Vorlage', kind: 'text', hint: 'Felder in geschweiften Klammern, z. B. {Name} – {Preis} €' },
      { key: 'emptyText', label: 'Text wenn leer', kind: 'text' },
    ],
    defaults: { source: '', itemTemplate: '', emptyText: 'Keine Einträge' },
    events: ['select'], readable: true,
  },
  table: {
    type: 'table', label: 'Tabelle', hint: 'Einträge in Spalten', w: 340, h: 220,
    props: [
      { key: 'source', label: 'Daten aus Tabelle', kind: 'table', hint: 'Leer lassen, wenn der Workflow die Tabelle befüllt.' },
      { key: 'columns', label: 'Spalten (kommagetrennt)', kind: 'text', hint: 'Leer = alle Felder' },
      { key: 'emptyText', label: 'Text wenn leer', kind: 'text' },
    ],
    defaults: { source: '', columns: '', emptyText: 'Keine Einträge' },
    events: ['select'], readable: true,
  },
  kpi: {
    type: 'kpi', label: 'Kennzahl', hint: 'Große Zahl mit Beschriftung', w: 150, h: 84,
    props: [
      { key: 'text', label: 'Wert', kind: 'text' },
      { key: 'label', label: 'Beschriftung', kind: 'text' },
      { key: 'color', label: 'Farbe', kind: 'color' },
    ],
    defaults: { text: '0', label: 'Anzahl', color: '#0e7490' },
    textProp: 'label', events: ['click'], readable: true,
  },
  image: {
    type: 'image', label: 'Bild', hint: 'Bild-Platzhalter oder Bild-URL', w: 220, h: 140,
    props: [
      { key: 'label', label: 'Beschreibung', kind: 'text' },
      { key: 'url', label: 'Bild-URL (optional)', kind: 'text' },
    ],
    defaults: { label: 'Bild', url: '' },
    textProp: 'label', events: ['click'], readable: false,
  },
  box: {
    type: 'box', label: 'Fläche', hint: 'Farbige Fläche zum Gruppieren', w: 300, h: 160,
    props: [
      { key: 'color', label: 'Farbe', kind: 'color' },
      { key: 'radius', label: 'Rundung', kind: 'number' },
      { key: 'border', label: 'Rahmen', kind: 'bool' },
    ],
    defaults: { color: '#f1f5f9', radius: 12, border: true },
    events: ['click'], readable: false,
  },
  divider: {
    type: 'divider', label: 'Trennlinie', hint: 'Horizontale Linie', w: 300, h: 12,
    props: [{ key: 'color', label: 'Farbe', kind: 'color' }],
    defaults: { color: '#cbd5e1' },
    events: [], readable: false,
  },
  note: {
    type: 'note', label: 'Notiz', hint: 'Klebezettel fürs Board – läuft nicht in der App', w: 200, h: 180,
    props: [
      { key: 'text', label: 'Text', kind: 'textarea' },
      { key: 'color', label: 'Farbe', kind: 'select', options: NOTE_COLORS.map((c, i) => ({ value: c, label: ['Gelb', 'Orange', 'Grün', 'Blau', 'Lila', 'Rosa'][i] })) },
    ],
    defaults: { text: 'Idee …', color: NOTE_COLORS[0] },
    textProp: 'text', events: [], readable: false, boardOnly: true,
  },
};

export const PALETTE_GROUPS: { title: string; types: ElementType[] }[] = [
  { title: 'Inhalt', types: ['heading', 'text', 'kpi', 'image'] },
  { title: 'Eingabe', types: ['button', 'input', 'textarea', 'checkbox', 'select'] },
  { title: 'Daten', types: ['list', 'table'] },
  { title: 'Layout', types: ['box', 'divider', 'note'] },
];

export const DEVICES: Record<DeviceKind, { label: string; w: number; h: number }> = {
  phone: { label: 'Smartphone', w: 390, h: 760 },
  tablet: { label: 'Tablet', w: 820, h: 1100 },
  desktop: { label: 'Desktop', w: 1280, h: 800 },
};

export function nextElementName(p: Project, type: ElementType): string {
  const base = ELEMENT_DEFS[type].label;
  const taken = new Set(p.elements.map((e) => e.name));
  for (let i = 1; ; i++) {
    const n = `${base} ${i}`;
    if (!taken.has(n)) return n;
  }
}

export function elementLabel(p: Project, el: UIElement): string {
  const s = el.screenId ? p.screens.find((x) => x.id === el.screenId) : null;
  return s ? `${s.name} › ${el.name}` : el.name;
}

export function selectOptions(el: UIElement): string[] {
  const o = el.props.options;
  if (Array.isArray(o)) return o.map(String);
  if (typeof o === 'string') return o.split('\n').map((s) => s.trim()).filter(Boolean);
  return [];
}
