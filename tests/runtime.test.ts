import { describe, expect, it } from 'vitest';
import { describeProject } from '../src/model/describe';
import { TEMPLATES } from '../src/model/templates';
import type { Project } from '../src/model/types';
import { validate } from '../src/model/validate';
import { Database } from '../src/runtime/database';
import { Runtime } from '../src/runtime/Runtime';
import { decodeBundle, encodeBundle } from '../src/model/share';

function boot(id: string) {
  const t = TEMPLATES.find((x) => x.id === id)!.build();
  const db = new Database(null, t.data);
  const rt = new Runtime(t.project, db);
  rt.confirm = async () => true;
  return { p: t.project, db, rt };
}

const elByName = (p: Project, name: string) => p.elements.find((e) => e.name === name)!.id;
const errors = (rt: Runtime) => rt.logs.filter((l) => l.kind === 'error').map((l) => l.text);

describe('templates', () => {
  it('have no errors or warnings', () => {
    for (const t of TEMPLATES) {
      const issues = validate(t.build().project).filter((i) => i.level !== 'info');
      expect(issues, t.id).toEqual([]);
    }
  });

  it('describe themselves', () => {
    const md = describeProject(boot('tasks').p);
    expect(md).toContain('# Aufgabenliste');
    expect(md).toContain('Wenn »Hinzufügen« geklickt wird');
    expect(md).toContain('Lege in »Aufgaben« einen Datensatz an');
    expect(md).toContain('Für jedes Element der Liste');
    expect(md).toContain('Ändere in »Aufgaben« diesen Datensatz');
  });
});

describe('counter', () => {
  it('counts clicks and congratulates at ten', async () => {
    const { p, rt } = boot('counter');
    const toasts: string[] = [];
    const toast = rt.toast.bind(rt);
    rt.toast = (text, style) => { toasts.push(text); toast(text, style); };
    await rt.start();
    const plus = elByName(p, '+1');
    for (let i = 0; i < 10; i++) await rt.userClick(plus);
    expect(rt.readElement(elByName(p, 'Anzeige'))).toBe('10');
    expect(toasts).toEqual(['Zehn Klicks erreicht! 🎉']);
    await rt.userClick(elByName(p, '−1'));
    expect(rt.readElement(elByName(p, 'Anzeige'))).toBe('9');
    await rt.userClick(elByName(p, 'Zurücksetzen'));
    expect(rt.readElement(elByName(p, 'Anzeige'))).toBe('0');
    expect(errors(rt)).toEqual([]);
    rt.stop();
  });
});

describe('tasks', () => {
  it('adds, ticks off, counts and purges', async () => {
    const { p, db, rt } = boot('tasks');
    const table = p.tables[0];
    await rt.start();
    const open = elByName(p, 'Offen');
    const done = elByName(p, 'Erledigt');
    expect(rt.readElement(open)).toBe('2');
    expect(rt.readElement(done)).toBe('1');

    // empty title is refused
    await rt.userClick(elByName(p, 'Hinzufügen'));
    expect(db.all(table.id)).toHaveLength(3);

    await rt.userInput(elByName(p, 'Eingabe Titel'), 'Kaffee kaufen');
    await rt.userInput(elByName(p, 'Auswahl Priorität'), 'Hoch');
    await rt.userClick(elByName(p, 'Hinzufügen'));
    const rows = db.all(table.id);
    expect(rows).toHaveLength(4);
    expect(rows[3]).toMatchObject({ Titel: 'Kaffee kaufen', Priorität: 'Hoch', Erledigt: false });
    expect(rt.readElement(elByName(p, 'Eingabe Titel'))).toBe('');
    expect(rt.readElement(open)).toBe('3');

    await rt.userSelect(elByName(p, 'Aufgabenliste'), rows[0], 0);
    expect(db.all(table.id)[0].Erledigt).toBe(true);
    expect(rt.readElement(done)).toBe('2');

    await rt.userClick(elByName(p, 'Erledigte löschen'));
    expect(db.all(table.id).map((r) => r.Titel)).toEqual(['Messestand planen', 'Kaffee kaufen']);
    expect(rt.readElement(done)).toBe('0');
    expect(rt.readElement(open)).toBe('2');
    expect(errors(rt)).toEqual([]);
    rt.stop();
  });
});

describe('survey', () => {
  it('stores a rating and shows the average', async () => {
    const { p, db, rt } = boot('survey');
    await rt.start();
    await rt.userInput(elByName(p, 'Eingabe Name'), 'Test');
    await rt.userInput(elByName(p, 'Auswahl Note'), '3');
    await rt.userClick(elByName(p, 'Absenden'));
    expect(db.all(p.tables[0].id)).toHaveLength(3);
    expect(rt.screenId).toBe(p.screens[1].id);
    expect(rt.readElement(elByName(p, 'Durchschnitt'))).toBe('4');
    expect(rt.readElement(elByName(p, 'Anzahl'))).toBe('3');
    expect(errors(rt)).toEqual([]);
    rt.stop();
  });
});

describe('errors', () => {
  it('reports the failing node and stops runaway loops', async () => {
    const { p, rt } = boot('counter');
    const loop = { id: 'w', type: 'loop.while', x: 0, y: 2000, config: { 'in.cond': true } };
    const ev = { id: 's', type: 'event.start', x: 0, y: 2000, config: {} };
    p.nodes.push(ev, loop);
    p.edges.push({ id: 'e1', from: { node: 's', port: 'out' }, to: { node: 'w', port: 'in' } });
    const flagged: string[] = [];
    rt.onNode = (id, state) => { if (state === 'error') flagged.push(id); };
    await rt.start();
    expect(errors(rt)[0]).toMatch(/10.000/);
    expect(flagged).toEqual(['w']);
    rt.stop();
  });
});

describe('share', () => {
  it('round-trips through a link payload', async () => {
    const t = TEMPLATES[1].build();
    const s = await encodeBundle({ project: t.project, data: t.data });
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    const back = await decodeBundle(s);
    expect(back.project.nodes).toHaveLength(t.project.nodes.length);
    expect(back.data).toEqual(t.data);
  });
});
