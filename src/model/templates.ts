import { uid } from './ids';
import { makeElement, newProject, newScreen } from './project';
import { defaultConfig, literalKey, nodeDef } from '../runtime/nodes';
import type { DataType, DbData, DeviceKind, ElementType, FieldType, Project } from './types';

/** Small builder so templates read like a recipe. */
class Builder {
  p: Project;
  data: DbData = {};

  constructor(name: string, description: string) {
    this.p = newProject(name);
    this.p.description = description;
    this.p.screens = [];
    this.p.startScreenId = null;
  }

  screen(name: string, x: number, y: number, device: DeviceKind = 'phone'): string {
    const s = newScreen(name, x, y, device);
    this.p.screens.push(s);
    this.p.startScreenId ??= s.id;
    return s.id;
  }

  el(screenId: string | null, type: ElementType, name: string, x: number, y: number, w: number, h: number, props: Record<string, any> = {}): string {
    const e = makeElement(this.p, type, screenId, x, y, props);
    e.name = name;
    e.w = w;
    e.h = h;
    this.p.elements.push(e);
    return e.id;
  }

  table(name: string, fields: [string, FieldType, string[]?][]): { id: string; f: Record<string, string> } {
    const t = { id: uid('tbl'), name, fields: fields.map(([n, type, options]) => ({ id: uid('fld'), name: n, type, options })) };
    this.p.tables.push(t);
    return { id: t.id, f: Object.fromEntries(t.fields.map((f) => [f.name, f.id])) };
  }

  rows(tableId: string, rows: Record<string, any>[]) {
    this.data[tableId] = rows.map((r) => ({ id: uid(), ...r }));
  }

  variable(name: string, type: DataType, initial: any): string {
    const id = uid('var');
    this.p.variables.push({ id, name, type, initial });
    return id;
  }

  node(type: string, x: number, y: number, config: Record<string, any> = {}): string {
    const def = nodeDef(type);
    if (!def) throw new Error(`unknown node ${type}`);
    const id = uid('nd');
    this.p.nodes.push({ id, type, x, y, config: { ...defaultConfig(def), ...config } });
    return id;
  }

  wire(from: string, fromPort: string, to: string, toPort: string) {
    this.p.edges.push({ id: uid('ed'), from: { node: from, port: fromPort }, to: { node: to, port: toPort } });
  }

  lit(node: string, port: string, value: any) {
    this.p.nodes.find((n) => n.id === node)!.config[literalKey(port)] = value;
  }
}

function counter(): { project: Project; data: DbData } {
  const b = new Builder('Zähler', 'Ein einfacher Zähler – das kleinste Beispiel für Oberfläche, Variable und Workflow.');
  const s = b.screen('Zähler', 0, 0);
  b.el(s, 'heading', 'Titel', 24, 40, 342, 40, { text: 'Klick-Zähler', align: 'center' });
  const kpi = b.el(s, 'kpi', 'Anzeige', 95, 130, 200, 110, { text: '0', label: 'Klicks' });
  const plus = b.el(s, 'button', '+1', 24, 290, 163, 52, { text: '+1' });
  const minus = b.el(s, 'button', '−1', 203, 290, 163, 52, { text: '−1', variant: 'secondary' });
  const reset = b.el(s, 'button', 'Zurücksetzen', 24, 356, 342, 44, { text: 'Zurücksetzen', variant: 'ghost' });
  b.el(s, 'text', 'Hinweis', 24, 660, 342, 60, {
    text: 'Bei 10 Klicks gibt es eine Meldung. Schau dir im Workflow an, wie das verdrahtet ist.',
    size: 13, align: 'center', color: '#64748b',
  });
  b.el(null, 'note', 'Notiz', 440, 0, 220, 200, {
    text: 'So geht\'s:\n1. Oberfläche skizzieren\n2. Im Workflow verdrahten\n3. Oben rechts »Ausprobieren«',
  });

  const v = b.variable('Zähler', 'number', 0);
  const get = b.node('var.get', 300, 200, { variable: v });

  const c1 = b.node('event.click', 0, 0, { element: plus });
  const add = b.node('var.add', 280, 0, { variable: v });
  const show1 = b.node('ui.setText', 560, 0, { element: kpi });
  const ifTen = b.node('logic.if', 840, 0);
  const cmp = b.node('logic.compare', 560, 200, { op: 'eq' });
  const toast = b.node('ui.toast', 1120, 0, { style: 'success' });
  b.lit(add, 'by', 1);
  b.lit(cmp, 'b', 10);
  b.lit(toast, 'text', 'Zehn Klicks erreicht! 🎉');
  b.wire(c1, 'out', add, 'in');
  b.wire(add, 'out', show1, 'in');
  b.wire(get, 'value', show1, 'text');
  b.wire(show1, 'out', ifTen, 'in');
  b.wire(get, 'value', cmp, 'a');
  b.wire(cmp, 'result', ifTen, 'cond');
  b.wire(ifTen, 'yes', toast, 'in');

  const c2 = b.node('event.click', 0, 380, { element: minus });
  const sub = b.node('var.add', 280, 380, { variable: v });
  const show2 = b.node('ui.setText', 560, 380, { element: kpi });
  b.lit(sub, 'by', -1);
  b.wire(c2, 'out', sub, 'in');
  b.wire(sub, 'out', show2, 'in');
  b.wire(get, 'value', show2, 'text');

  const c3 = b.node('event.click', 0, 600, { element: reset });
  const ask = b.node('ui.confirm', 280, 600);
  const set0 = b.node('var.set', 560, 600, { variable: v });
  const show3 = b.node('ui.setText', 840, 600, { element: kpi });
  b.lit(ask, 'text', 'Zähler wirklich auf 0 setzen?');
  b.lit(set0, 'value', 0);
  b.lit(show3, 'text', '0');
  b.wire(c3, 'out', ask, 'in');
  b.wire(ask, 'yes', set0, 'in');
  b.wire(set0, 'out', show3, 'in');

  const note = b.node('note', -300, 0);
  b.p.nodes.find((n) => n.id === note)!.config.text =
    'Weiße Pfeile = Reihenfolge der Schritte.\nFarbige Linien = Werte, die in einen Schritt hineinfließen.';
  return { project: b.p, data: b.data };
}

function tasks(): { project: Project; data: DbData } {
  const b = new Builder('Aufgabenliste', 'Aufgaben erfassen, abhaken und zählen – mit Datenbank-Tabelle, Liste, Schleife und einem wiederverwendbaren Ablauf.');
  const t = b.table('Aufgaben', [['Titel', 'text'], ['Priorität', 'choice', ['Hoch', 'Mittel', 'Niedrig']], ['Erledigt', 'bool']]);
  b.rows(t.id, [
    { Titel: 'Angebot für Kunde Müller schreiben', Priorität: 'Hoch', Erledigt: false },
    { Titel: 'Messestand planen', Priorität: 'Mittel', Erledigt: false },
    { Titel: 'Reisekosten abrechnen', Priorität: 'Niedrig', Erledigt: true },
  ]);
  const s = b.screen('Aufgaben', 0, 0);
  b.el(s, 'heading', 'Titel', 24, 28, 342, 40, { text: 'Meine Aufgaben' });
  const kOpen = b.el(s, 'kpi', 'Offen', 24, 84, 163, 84, { text: '0', label: 'Offen' });
  const kDone = b.el(s, 'kpi', 'Erledigt', 203, 84, 163, 84, { text: '0', label: 'Erledigt', color: '#16a34a' });
  const inTitle = b.el(s, 'input', 'Eingabe Titel', 24, 184, 342, 66, { label: 'Neue Aufgabe', placeholder: 'Was ist zu tun?' });
  const inPrio = b.el(s, 'select', 'Auswahl Priorität', 24, 258, 200, 66, { label: 'Priorität', options: ['Hoch', 'Mittel', 'Niedrig'], value: 'Mittel' });
  const btnAdd = b.el(s, 'button', 'Hinzufügen', 236, 280, 130, 44, { text: 'Hinzufügen' });
  const list = b.el(s, 'list', 'Aufgabenliste', 24, 340, 342, 300, { source: t.id, itemTemplate: '{Erledigt}  {Titel} · {Priorität}' });
  b.el(s, 'text', 'Hinweis', 24, 648, 342, 22, { text: 'Tippe auf eine Aufgabe, um sie abzuhaken.', size: 13, color: '#64748b', align: 'center' });
  const btnPurge = b.el(s, 'button', 'Erledigte löschen', 24, 684, 342, 44, { text: 'Erledigte löschen', variant: 'secondary' });
  b.el(null, 'note', 'Notiz', 440, 0, 230, 210, {
    text: 'Die Liste ist direkt an die Tabelle »Aufgaben« gebunden – neue Datensätze erscheinen von selbst.',
    color: '#caffbf',
  });

  const gone = b.variable('Anzahl gelöscht', 'number', 0);

  // Add a task
  const cAdd = b.node('event.click', 0, 0, { element: btnAdd });
  const getTitle = b.node('ui.get', 0, 200, { element: inTitle });
  const getPrio = b.node('ui.get', 0, 330, { element: inPrio });
  const empty = b.node('logic.compare', 280, 200, { op: 'empty' });
  const ifEmpty = b.node('logic.if', 280, 0);
  const warn = b.node('ui.toast', 560, -60, { style: 'warning' });
  const ins = b.node('db.insert', 560, 120, { table: t.id });
  const clear = b.node('ui.clear', 860, 120, { screen: s });
  const call1 = b.node('flow.call', 1140, 120, { name: 'Zähler aktualisieren' });
  b.lit(warn, 'text', 'Bitte gib einen Titel ein.');
  b.lit(ins, `f:${t.f.Erledigt}`, false);
  b.wire(cAdd, 'out', ifEmpty, 'in');
  b.wire(getTitle, 'value', empty, 'a');
  b.wire(empty, 'result', ifEmpty, 'cond');
  b.wire(ifEmpty, 'yes', warn, 'in');
  b.wire(ifEmpty, 'no', ins, 'in');
  b.wire(getTitle, 'value', ins, `f:${t.f.Titel}`);
  b.wire(getPrio, 'value', ins, `f:${t.f.Priorität}`);
  b.wire(ins, 'out', clear, 'in');
  b.wire(clear, 'out', call1, 'in');

  // Tick a task off
  const cSel = b.node('event.select', 0, 520, { element: list });
  const field = b.node('list.field', 280, 660, { field: 'Erledigt' });
  const not = b.node('logic.not', 560, 760);
  const upd = b.node('db.update', 560, 520, { table: t.id, fields: [t.f.Erledigt] });
  const call2 = b.node('flow.call', 860, 520, { name: 'Zähler aktualisieren' });
  b.wire(cSel, 'out', upd, 'in');
  b.wire(cSel, 'item', upd, 'record');
  b.wire(cSel, 'item', field, 'record');
  b.wire(field, 'value', not, 'a');
  b.wire(not, 'result', upd, `f:${t.f.Erledigt}`);
  b.wire(upd, 'out', call2, 'in');

  // Purge finished tasks, one by one in a loop
  const cPurge = b.node('event.click', 0, 880, { element: btnPurge });
  const ask = b.node('ui.confirm', 280, 880);
  const done = b.node('db.query', 0, 1040, { table: t.id, field: 'Erledigt', op: 'eq' });
  const remember = b.node('var.set', 560, 880, { variable: gone });
  const each = b.node('loop.each', 840, 880);
  const del = b.node('db.delete', 1120, 820, { table: t.id });
  const call3 = b.node('flow.call', 1120, 1000, { name: 'Zähler aktualisieren' });
  const msg = b.node('text.template', 1120, 1160, { template: '{Anzahl} erledigte Aufgabe(n) gelöscht.' });
  const getGone = b.node('var.get', 840, 1160, { variable: gone });
  const toast = b.node('ui.toast', 1400, 1000, { style: 'success' });
  b.lit(ask, 'text', 'Alle erledigten Aufgaben löschen?');
  b.lit(done, 'value', true);
  b.wire(cPurge, 'out', ask, 'in');
  b.wire(ask, 'yes', remember, 'in');
  b.wire(done, 'count', remember, 'value');
  b.wire(remember, 'out', each, 'in');
  b.wire(done, 'list', each, 'list');
  b.wire(each, 'body', del, 'in');
  b.wire(each, 'item', del, 'record');
  b.wire(each, 'done', call3, 'in');
  b.wire(call3, 'out', toast, 'in');
  b.wire(getGone, 'value', msg, 'p:Anzahl');
  b.wire(msg, 'text', toast, 'text');

  // Counters, reused by everything above
  const fn = b.node('event.custom', 0, 1460, { name: 'Zähler aktualisieren' });
  const open = b.node('db.query', 280, 1620, { table: t.id, field: 'Erledigt', op: 'eq' });
  const setOpen = b.node('ui.setText', 580, 1460, { element: kOpen });
  const all = b.node('db.query', 580, 1660, { table: t.id });
  const count = b.node('list.count', 880, 1660, { field: 'Erledigt', op: 'eq' });
  const setDone = b.node('ui.setText', 880, 1460, { element: kDone });
  b.lit(open, 'value', false);
  b.lit(count, 'value', true);
  b.wire(fn, 'out', setOpen, 'in');
  b.wire(open, 'count', setOpen, 'text');
  b.wire(setOpen, 'out', setDone, 'in');
  b.wire(all, 'list', count, 'list');
  b.wire(count, 'count', setDone, 'text');

  const start = b.node('event.start', 0, 2040);
  const call4 = b.node('flow.call', 280, 2040, { name: 'Zähler aktualisieren' });
  b.wire(start, 'out', call4, 'in');

  const note = b.node('note', -320, 0);
  b.p.nodes.find((n) => n.id === note)!.config.text =
    '»Zähler aktualisieren« ist ein eigener Ablauf (ganz unten). Drei Stellen rufen ihn mit »Ablauf starten« auf.';
  return { project: b.p, data: b.data };
}

function survey(): { project: Project; data: DbData } {
  const b = new Builder('Kundenfeedback', 'Zwei Screens: Bewertung abgeben und Auswertung mit Durchschnitt – zeigt Navigation und Rechnen über Daten.');
  const t = b.table('Bewertungen', [['Name', 'text'], ['Note', 'number'], ['Kommentar', 'text']]);
  b.rows(t.id, [
    { Name: 'Frau Schmidt', Note: 5, Kommentar: 'Sehr schnelle Lieferung' },
    { Name: 'Herr Yilmaz', Note: 4, Kommentar: 'Gute Beratung' },
  ]);
  const s1 = b.screen('Bewerten', 0, 0);
  const s2 = b.screen('Auswertung', 460, 0);
  b.el(s1, 'heading', 'Titel', 24, 32, 342, 40, { text: 'Wie zufrieden sind Sie?' });
  b.el(s1, 'text', 'Intro', 24, 80, 342, 44, { text: 'Ihre Meinung hilft uns, besser zu werden.', color: '#64748b' });
  const name = b.el(s1, 'input', 'Eingabe Name', 24, 140, 342, 66, { label: 'Ihr Name', placeholder: 'Max Mustermann' });
  const note = b.el(s1, 'select', 'Auswahl Note', 24, 220, 342, 66, { label: 'Bewertung (1–5 Sterne)', options: ['5', '4', '3', '2', '1'], value: '5' });
  const comment = b.el(s1, 'textarea', 'Eingabe Kommentar', 24, 300, 342, 120, { label: 'Kommentar', placeholder: 'Was hat Ihnen gefallen?' });
  const send = b.el(s1, 'button', 'Absenden', 24, 440, 342, 48, { text: 'Absenden' });
  const toResults = b.el(s1, 'button', 'Zur Auswertung', 24, 500, 342, 44, { text: 'Zur Auswertung', variant: 'ghost' });

  b.el(s2, 'heading', 'Titel', 24, 32, 342, 40, { text: 'Auswertung' });
  const avg = b.el(s2, 'kpi', 'Durchschnitt', 24, 88, 163, 90, { text: '–', label: 'Ø Sterne' });
  const cnt = b.el(s2, 'kpi', 'Anzahl', 203, 88, 163, 90, { text: '0', label: 'Bewertungen', color: '#7c3aed' });
  b.el(s2, 'table', 'Tabelle Bewertungen', 24, 196, 342, 420, { source: t.id, columns: 'Name, Note, Kommentar' });
  const back = b.el(s2, 'button', 'Zurück', 24, 636, 342, 44, { text: 'Zurück', variant: 'secondary' });

  const cSend = b.node('event.click', 0, 0, { element: send });
  const gName = b.node('ui.get', 0, 160, { element: name });
  const gNote = b.node('ui.get', 0, 280, { element: note });
  const gCom = b.node('ui.get', 0, 400, { element: comment });
  const ins = b.node('db.insert', 300, 0, { table: t.id });
  const clr = b.node('ui.clear', 600, 0, { screen: s1 });
  const go = b.node('ui.navigate', 880, 0, { screen: s2 });
  b.wire(cSend, 'out', ins, 'in');
  b.wire(gName, 'value', ins, `f:${t.f.Name}`);
  b.wire(gNote, 'value', ins, `f:${t.f.Note}`);
  b.wire(gCom, 'value', ins, `f:${t.f.Kommentar}`);
  b.wire(ins, 'out', clr, 'in');
  b.wire(clr, 'out', go, 'in');

  const cRes = b.node('event.click', 0, 560, { element: toResults });
  const go2 = b.node('ui.navigate', 300, 560, { screen: s2 });
  b.wire(cRes, 'out', go2, 'in');
  const cBack = b.node('event.click', 0, 700, { element: back });
  const go3 = b.node('ui.navigate', 300, 700, { screen: s1 });
  b.wire(cBack, 'out', go3, 'in');

  const opened = b.node('event.screen', 0, 880, { screen: s2 });
  const q = b.node('db.query', 0, 1040, { table: t.id });
  const agg = b.node('list.aggregate', 300, 1080, { op: 'avg', field: 'Note' });
  const rnd = b.node('math.round', 580, 1080, { digits: 1 });
  const setAvg = b.node('ui.setText', 580, 880, { element: avg });
  const setCnt = b.node('ui.setText', 880, 880, { element: cnt });
  b.wire(opened, 'out', setAvg, 'in');
  b.wire(q, 'list', agg, 'list');
  b.wire(agg, 'result', rnd, 'a');
  b.wire(rnd, 'result', setAvg, 'text');
  b.wire(setAvg, 'out', setCnt, 'in');
  b.wire(q, 'count', setCnt, 'text');
  return { project: b.p, data: b.data };
}

export const TEMPLATES: { id: string; name: string; description: string; build: () => { project: Project; data: DbData } }[] = [
  { id: 'counter', name: 'Zähler', description: 'Variable hochzählen, Vergleich, Rückfrage', build: counter },
  { id: 'tasks', name: 'Aufgabenliste', description: 'Datenbank, Liste, Zählen, Schleife, eigener Ablauf', build: tasks },
  { id: 'survey', name: 'Kundenfeedback', description: 'Zwei Screens, Navigation, Durchschnitt', build: survey },
];
