import { uid } from '../model/ids';
import type { DbData, DbRecord, FieldDef, TableDef } from '../model/types';
import { toBool, toNumber, toText } from './values';

function storage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function coerceField(f: FieldDef, v: any): any {
  if (v === undefined || v === null) return f.type === 'bool' ? false : f.type === 'number' ? 0 : '';
  switch (f.type) {
    case 'number': return toNumber(v);
    case 'bool': return toBool(v);
    default: return toText(v);
  }
}

/**
 * The app's JSON store. It lives in the browser (localStorage) under a key of its own,
 * so nothing leaves the machine unless the author shares it explicitly.
 * With a null key it is memory only (tests, previews of shared links).
 */
export class Database {
  private data: DbData;
  private listeners = new Set<() => void>();
  version = 0;

  constructor(private key: string | null, initial?: DbData) {
    this.data = initial ? JSON.parse(JSON.stringify(initial)) : {};
    if (key && !initial) {
      const raw = storage()?.getItem(key);
      if (raw) {
        try {
          this.data = JSON.parse(raw);
        } catch {
          this.data = {};
        }
      }
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    this.version++;
    if (this.key) {
      try {
        storage()?.setItem(this.key, JSON.stringify(this.data));
      } catch {
        /* storage full: data stays in memory for this session */
      }
    }
    this.listeners.forEach((l) => l());
  }

  all(tableId: string): DbRecord[] {
    return this.data[tableId] ?? [];
  }

  snapshot(): DbData {
    return JSON.parse(JSON.stringify(this.data));
  }

  count(): number {
    return Object.values(this.data).reduce((n, rows) => n + rows.length, 0);
  }

  insert(table: TableDef, values: Record<string, any>): DbRecord {
    const rec: DbRecord = { id: uid() };
    for (const f of table.fields) rec[f.name] = coerceField(f, values[f.name]);
    this.data[table.id] = [...this.all(table.id), rec];
    this.changed();
    return rec;
  }

  update(table: TableDef, id: string, values: Record<string, any>): DbRecord | null {
    const rows = this.all(table.id);
    const i = rows.findIndex((r) => r.id === id);
    if (i < 0) return null;
    const rec = { ...rows[i] };
    for (const f of table.fields) if (f.name in values) rec[f.name] = coerceField(f, values[f.name]);
    this.data[table.id] = rows.map((r, j) => (j === i ? rec : r));
    this.changed();
    return rec;
  }

  remove(tableId: string, id: string): boolean {
    const rows = this.all(tableId);
    const next = rows.filter((r) => r.id !== id);
    if (next.length === rows.length) return false;
    this.data[tableId] = next;
    this.changed();
    return true;
  }

  clear(tableId: string) {
    this.data[tableId] = [];
    this.changed();
  }

  replace(data: DbData) {
    this.data = JSON.parse(JSON.stringify(data));
    this.changed();
  }

  /** Field rename: carry values over to the new key. */
  renameField(tableId: string, from: string, to: string) {
    if (from === to) return;
    this.data[tableId] = this.all(tableId).map((r) => {
      const { [from]: v, ...rest } = r;
      return { ...rest, [to]: v } as DbRecord;
    });
    this.changed();
  }

  dropTable(tableId: string) {
    delete this.data[tableId];
    this.changed();
  }
}

const open = new Map<string, Database>();

export function dbKey(projectId: string): string {
  return `aquist.db.${projectId}`;
}

/** One live Database per project, shared by the data tab and the running app. */
export function projectDb(projectId: string): Database {
  const key = dbKey(projectId);
  let db = open.get(key);
  if (!db) {
    db = new Database(key);
    open.set(key, db);
  }
  return db;
}

export function forgetDb(projectId: string) {
  open.delete(dbKey(projectId));
  storage()?.removeItem(dbKey(projectId));
}
