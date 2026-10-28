import type { DataType } from '../model/types';

export function isNumeric(v: any): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v !== 'string') return false;
  const s = v.trim().replace(',', '.');
  return s !== '' && Number.isFinite(Number(s));
}

export function toNumber(v: any): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Array.isArray(v)) return v.length;
  if (typeof v === 'string') {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function toBool(v: any): boolean {
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return !(s === '' || s === 'false' || s === 'nein' || s === '0' || s === 'falsch');
  }
  if (Array.isArray(v)) return v.length > 0;
  return !!v;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  const r = Math.round(n * 1e6) / 1e6;
  return r.toLocaleString('de-DE', { maximumFractionDigits: 6 });
}

export function toText(v: any): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'boolean') return v ? 'Ja' : 'Nein';
  if (Array.isArray(v)) return v.map(toText).join(', ');
  if (typeof v === 'object') {
    const keys = Object.keys(v).filter((k) => k !== 'id');
    return keys.map((k) => `${k}: ${toText(v[k])}`).join(', ');
  }
  return String(v);
}

export function toList(v: any): any[] {
  if (Array.isArray(v)) return v;
  if (v === null || v === undefined || v === '') return [];
  return [v];
}

export function convert(v: any, t: DataType | undefined): any {
  switch (t) {
    case 'number': return toNumber(v);
    case 'text': return toText(v);
    case 'bool': return toBool(v);
    case 'list': return toList(v);
    default: return v;
  }
}

export function isEmpty(v: any): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

export type CompareOp = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge' | 'contains' | 'starts' | 'empty' | 'notempty';

export const COMPARE_OPS: { value: CompareOp; label: string; words: string }[] = [
  { value: 'eq', label: '=', words: 'gleich' },
  { value: 'ne', label: '≠', words: 'ungleich' },
  { value: 'lt', label: '<', words: 'kleiner als' },
  { value: 'le', label: '≤', words: 'kleiner oder gleich' },
  { value: 'gt', label: '>', words: 'größer als' },
  { value: 'ge', label: '≥', words: 'größer oder gleich' },
  { value: 'contains', label: 'enthält', words: 'enthält' },
  { value: 'starts', label: 'beginnt mit', words: 'beginnt mit' },
  { value: 'empty', label: 'ist leer', words: 'ist leer' },
  { value: 'notempty', label: 'ist nicht leer', words: 'ist nicht leer' },
];

export function opNeedsValue(op: string): boolean {
  return op !== 'empty' && op !== 'notempty';
}

function norm(v: any): string {
  return toText(v).trim().toLowerCase();
}

/** Compares the way a person would: numbers as numbers, text ignoring case, "ja" equal to true. */
export function compare(a: any, op: CompareOp | string, b: any): boolean {
  switch (op) {
    case 'empty': return isEmpty(a);
    case 'notempty': return !isEmpty(a);
    case 'contains':
      if (Array.isArray(a)) return a.some((x) => compare(x, 'eq', b));
      return norm(a).includes(norm(b));
    case 'starts': return norm(a).startsWith(norm(b));
  }
  let x: any;
  let y: any;
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    x = toBool(a) ? 1 : 0;
    y = toBool(b) ? 1 : 0;
  } else if (isNumeric(a) && isNumeric(b)) {
    x = toNumber(a);
    y = toNumber(b);
  } else {
    x = norm(a);
    y = norm(b);
  }
  switch (op) {
    case 'eq': return x === y;
    case 'ne': return x !== y;
    case 'lt': return x < y;
    case 'le': return x <= y;
    case 'gt': return x > y;
    case 'ge': return x >= y;
  }
  return false;
}

export function getField(rec: any, field: string): any {
  if (rec === null || rec === undefined || typeof rec !== 'object') return undefined;
  if (field in rec) return rec[field];
  const lower = field.toLowerCase();
  const key = Object.keys(rec).find((k) => k.toLowerCase() === lower);
  return key ? rec[key] : undefined;
}

/** "{Titel} ({Preis} €)" filled from a record; booleans show as ✓ / ○. */
export function fillTemplate(tpl: string, item: any): string {
  if (!tpl) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const keys = Object.keys(item).filter((k) => k !== 'id');
      return keys.length ? toText(item[keys[0]]) : '';
    }
    return toText(item);
  }
  return tpl.replace(/\{([^}]+)\}/g, (_, name: string) => {
    const v = name.trim() === 'Wert' && (typeof item !== 'object' || item === null) ? item : getField(item, name.trim());
    if (typeof v === 'boolean') return v ? '✓' : '○';
    return toText(v);
  });
}

export function templatePlaceholders(tpl: string): string[] {
  const out: string[] = [];
  for (const m of tpl.matchAll(/\{([^}]+)\}/g)) {
    const n = m[1].trim();
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

export const TYPE_LABEL: Record<DataType, string> = {
  any: 'Beliebig',
  number: 'Zahl',
  text: 'Text',
  bool: 'Ja/Nein',
  list: 'Liste',
  record: 'Datensatz',
};

export function compatible(out: DataType | undefined, inp: DataType | undefined): boolean {
  const o = out ?? 'any';
  const i = inp ?? 'any';
  if (o === 'any' || i === 'any' || o === i) return true;
  if (i === 'text') return o === 'number' || o === 'bool';
  if (i === 'number') return o === 'text' || o === 'bool';
  if (i === 'bool') return o !== 'record';
  return false;
}
