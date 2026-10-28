import { Database as DbIcon, Download, Lock, Plus, Trash2, Upload, Variable } from 'lucide-react';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { parseCsv, toCsv } from '../../model/csv';
import { uid } from '../../model/ids';
import { download, fileSafe } from '../../model/share';
import type { FieldDef, FieldType, Project, TableDef } from '../../model/types';
import { projectDb } from '../../runtime/database';
import { toBool, toNumber } from '../../runtime/values';
import { TextField, notify } from '../common';
import { useEditor, useProject } from '../store';
import { VariablesEditor } from '../VariablesEditor';

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Zahl' },
  { value: 'bool', label: 'Ja/Nein' },
  { value: 'date', label: 'Datum' },
  { value: 'choice', label: 'Auswahl' },
];

function useDb(projectId: string) {
  const db = projectDb(projectId);
  useSyncExternalStore((fn) => db.subscribe(fn), () => db.version);
  return db;
}

/** Field rename: the stored rows, workflow settings and list templates follow the new name. */
function renameField(d: Project, tableId: string, from: string, to: string) {
  if (from === to) return;
  projectDb(d.id).renameField(tableId, from, to);
  for (const n of d.nodes) {
    for (const k of ['field', 'sortField']) if (n.config[k] === from && (!n.config.table || n.config.table === tableId)) n.config[k] = to;
  }
  for (const e of d.elements) {
    if (e.props.source !== tableId) continue;
    if (typeof e.props.itemTemplate === 'string') e.props.itemTemplate = e.props.itemTemplate.split(`{${from}}`).join(`{${to}}`);
    if (typeof e.props.columns === 'string') {
      e.props.columns = e.props.columns.split(',').map((c: string) => (c.trim() === from ? to : c.trim())).join(', ');
    }
  }
}

export function DataView() {
  const p = useProject();
  const db = useDb(p.id);
  const { update } = useEditor.getState();
  const [tid, setTid] = useState<string | null>(p.tables[0]?.id ?? null);
  const table = p.tables.find((t) => t.id === tid) ?? p.tables[0];
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!table && p.tables[0]) setTid(p.tables[0].id);
  }, [p.tables, table]);

  const addTable = () => {
    const id = uid('tbl');
    update((d) => {
      d.tables.push({ id, name: `Tabelle ${d.tables.length + 1}`, fields: [{ id: uid('fld'), name: 'Name', type: 'text' }] });
    });
    setTid(id);
  };

  const importCsv = async (file: File, t: TableDef) => {
    const rows = parseCsv(await file.text());
    if (rows.length < 2) return notify('Die Datei enthält keine Datenzeilen.');
    const header = rows[0].map((h) => h.trim());
    const missing = header.filter((h) => h && !t.fields.some((f) => f.name.toLowerCase() === h.toLowerCase()));
    if (missing.length) {
      update((d) => {
        const dt = d.tables.find((x) => x.id === t.id)!;
        for (const m of missing) dt.fields.push({ id: uid('fld'), name: m, type: 'text' });
      });
    }
    const fresh = useEditor.getState().project!.tables.find((x) => x.id === t.id)!;
    for (const r of rows.slice(1)) {
      const values: Record<string, any> = {};
      header.forEach((h, i) => {
        const f = fresh.fields.find((x) => x.name.toLowerCase() === h.toLowerCase());
        if (f) values[f.name] = f.type === 'number' ? toNumber(r[i]) : f.type === 'bool' ? toBool(r[i]) : r[i] ?? '';
      });
      db.insert(fresh, values);
    }
    notify(`${rows.length - 1} Zeile(n) importiert${missing.length ? `, neue Felder: ${missing.join(', ')}` : ''}.`);
  };

  return (
    <div className="board-layout data-layout">
      <aside className="palette">
        <div className="palette-title">Tabellen</div>
        {p.tables.map((t) => (
          <button key={t.id} className={`table-item ${t.id === table?.id ? 'on' : ''}`} onClick={() => setTid(t.id)}>
            <DbIcon size={15} />
            <span>{t.name}</span>
            <small>{db.all(t.id).length}</small>
          </button>
        ))}
        <button className="btn small block" onClick={addTable}><Plus size={14} /> Neue Tabelle</button>
        <div className="palette-title"><Variable size={13} /> Variablen</div>
        <VariablesEditor />
        <div className="privacy-note">
          <Lock size={14} />
          <span>Die Datensätze liegen nur in <b>diesem Browser</b>. Beim Teilen gibst du sie nur mit, wenn du es ausdrücklich ankreuzt.</span>
        </div>
      </aside>
      <div className="data-main">
        {!table ? (
          <div className="empty-hint static">
            <b>Noch keine Tabelle.</b>
            <span>Eine Tabelle ist wie ein Tabellenblatt: Felder (Spalten) und Datensätze (Zeilen). Listen auf der Oberfläche können sie direkt anzeigen, der Workflow kann sie lesen und schreiben.</span>
            <button className="btn primary" onClick={addTable}><Plus size={16} /> Erste Tabelle anlegen</button>
          </div>
        ) : (
          <>
            <div className="data-head">
              <TextField
                className="table-name"
                value={table.name}
                onChange={(v) => update((d) => {
                  const t = d.tables.find((x) => x.id === table.id);
                  if (t) t.name = v;
                }, { coalesce: `${table.id}.name` })}
              />
              <span className="grow" />
              <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importCsv(f, table);
                e.target.value = '';
              }} />
              <button className="btn small" onClick={() => fileRef.current?.click()} title="CSV aus Excel o. Ä. anhängen"><Upload size={14} /> CSV importieren</button>
              <button className="btn small" onClick={() => download(
                `${fileSafe(table.name)}.csv`,
                `﻿${toCsv(table.fields.map((f) => f.name), db.all(table.id).map((r) => table.fields.map((f) => r[f.name])))}`,
                'text/csv;charset=utf-8',
              )}><Download size={14} /> CSV exportieren</button>
              <button className="btn small danger" title="Tabelle samt Daten löschen" onClick={() => {
                if (!window.confirm(`Tabelle »${table.name}« mit allen Datensätzen löschen?`)) return;
                update((d) => { d.tables = d.tables.filter((t) => t.id !== table.id); });
                db.dropTable(table.id);
              }}><Trash2 size={14} /></button>
            </div>
            <FieldsEditor table={table} />
            <RecordsGrid table={table} />
          </>
        )}
      </div>
    </div>
  );
}

function FieldsEditor({ table }: { table: TableDef }) {
  const { update } = useEditor.getState();
  const set = (f: FieldDef, fn: (x: FieldDef, d: Project) => void, key?: string) => update((d) => {
    const t = d.tables.find((x) => x.id === table.id);
    const x = t?.fields.find((y) => y.id === f.id);
    if (x) fn(x, d);
  }, key ? { coalesce: key } : undefined);
  return (
    <section className="fields-sec">
      <h4>Felder</h4>
      <div className="fields">
        {table.fields.map((f) => (
          <div key={f.id} className="field-row">
            <TextField value={f.name} onChange={(v) => set(f, (x, d) => {
              const name = v.trim() || x.name;
              renameField(d, table.id, x.name, name);
              x.name = name;
            }, `${f.id}.name`)} />
            <select value={f.type} onChange={(e) => set(f, (x) => {
              x.type = e.target.value as FieldType;
              if (x.type === 'choice' && !x.options?.length) x.options = ['A', 'B'];
            })}>
              {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            {f.type === 'choice' ? (
              <TextField
                value={(f.options ?? []).join(', ')}
                placeholder="Optionen, kommagetrennt"
                onChange={(v) => set(f, (x) => { x.options = v.split(',').map((s) => s.trim()).filter(Boolean); }, `${f.id}.opt`)}
              />
            ) : <span />}
            <button className="icon-btn" title="Feld löschen" onClick={() => update((d) => {
              const t = d.tables.find((x) => x.id === table.id);
              if (t) t.fields = t.fields.filter((x) => x.id !== f.id);
            })}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
      <button className="btn small" onClick={() => update((d) => {
        const t = d.tables.find((x) => x.id === table.id);
        if (!t) return;
        let name = 'Feld';
        for (let i = 2; t.fields.some((x) => x.name === name); i++) name = `Feld ${i}`;
        t.fields.push({ id: uid('fld'), name, type: 'text' });
      })}><Plus size={14} /> Feld</button>
    </section>
  );
}

function RecordsGrid({ table }: { table: TableDef }) {
  const p = useProject();
  const db = useDb(p.id);
  const rows = db.all(table.id);
  return (
    <section className="records-sec">
      <div className="records-head">
        <h4>Datensätze <small>{rows.length}</small></h4>
        <span className="grow" />
        {rows.length > 0 && (
          <button className="btn small" onClick={() => window.confirm('Alle Datensätze dieser Tabelle löschen?') && db.clear(table.id)}>
            Alle löschen
          </button>
        )}
        <button className="btn small primary" onClick={() => db.insert(table, {})}><Plus size={14} /> Datensatz</button>
      </div>
      <div className="grid-wrap">
        <table className="grid">
          <thead>
            <tr>
              {table.fields.map((f) => <th key={f.id}>{f.name}</th>)}
              <th className="act" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {table.fields.map((f) => (
                  <td key={f.id}>
                    <Cell f={f} value={r[f.name]} onChange={(v) => db.update(table, r.id, { [f.name]: v })} />
                  </td>
                ))}
                <td className="act">
                  <button className="icon-btn" title="Datensatz löschen" onClick={() => db.remove(table.id, r.id)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="field-hint pad">Noch keine Datensätze. Lege welche an, importiere eine CSV – oder lass die App sie anlegen.</div>}
      </div>
    </section>
  );
}

function Cell({ f, value, onChange }: { f: FieldDef; value: any; onChange(v: any): void }) {
  switch (f.type) {
    case 'bool':
      return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
    case 'choice':
      return (
        <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="" />
          {(f.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'date':
      return <input type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <TextField value={String(value ?? '')} onChange={(v) => onChange(v)} />;
    default:
      return <TextField value={String(value ?? '')} onChange={(v) => onChange(v)} />;
  }
}
