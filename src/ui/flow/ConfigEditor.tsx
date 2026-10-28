import { useState } from 'react';
import { ELEMENT_DEFS } from '../../model/elements';
import { uid } from '../../model/ids';
import type { DataType, FlowNode, Project } from '../../model/types';
import type { ConfigField } from '../../runtime/nodes';
import { TextField } from '../common';
import { useEditor } from '../store';

function setCfg(nodeId: string, key: string, value: any, coalesce?: string) {
  useEditor.getState().update((d) => {
    const n = d.nodes.find((x) => x.id === nodeId);
    if (n) n.config[key] = value;
  }, coalesce ? { coalesce } : undefined);
}

function elementOptions(p: Project, f: ConfigField) {
  const ok = (type: keyof typeof ELEMENT_DEFS) => {
    const def = ELEMENT_DEFS[type];
    if (def.boardOnly) return false;
    if (f.elementEvent) return def.events.includes(f.elementEvent);
    if (f.elementTypes) return f.elementTypes.includes(type);
    return true;
  };
  return p.screens.map((s) => ({
    screen: s,
    items: p.elements.filter((e) => e.screenId === s.id && ok(e.type)),
  })).filter((g) => g.items.length);
}

function newVariableType(nodeType: string): DataType {
  if (nodeType === 'var.add') return 'number';
  if (nodeType === 'var.push') return 'list';
  return 'any';
}

/** Name field that replaces a select while something new (a variable, a table) gets created. */
function InlineCreate({ placeholder, onDone }: { placeholder: string; onDone(name: string | null): void }) {
  const [v, setV] = useState('');
  return (
    <input
      autoFocus
      placeholder={placeholder}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onDone(v.trim() || null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onDone(v.trim() || null);
        if (e.key === 'Escape') onDone(null);
        e.stopPropagation();
      }}
    />
  );
}

/** One config value of a node, as a compact form control. */
export function ConfigEditor({ node, f, p }: { node: FlowNode; f: ConfigField; p: Project }) {
  const [creating, setCreating] = useState(false);
  const v = node.config[f.key];
  const key = `${node.id}.${f.key}`;
  const set = (x: any, co?: string) => setCfg(node.id, f.key, x, co);
  switch (f.kind) {
    case 'text':
      return <TextField value={String(v ?? '')} onChange={(x) => set(x, key)} placeholder={f.placeholder} />;
    case 'textarea':
      return <TextField multiline rows={3} value={String(v ?? '')} onChange={(x) => set(x, key)} />;
    case 'number':
      return <TextField value={String(v ?? '')} onChange={(x) => set(Number(x.replace(',', '.')) || 0, key)} />;
    case 'bool':
      return <input type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} />;
    case 'color':
      return <input type="color" value={v ?? '#fff3a3'} onChange={(e) => set(e.target.value, key)} />;
    case 'select':
      return (
        <select value={String(v ?? f.default ?? '')} onChange={(e) => set(e.target.value)}>
          {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'element': {
      const groups = elementOptions(p, f);
      const missing = v && !p.elements.some((e) => e.id === v);
      return (
        <select value={v ?? ''} onChange={(e) => set(e.target.value)} className={!v || missing ? 'invalid' : ''}>
          <option value="">{groups.length ? '– Element wählen –' : '– keins auf dem Board –'}</option>
          {missing && <option value={v}>(gelöscht)</option>}
          {groups.map((g) => (
            <optgroup key={g.screen.id} label={g.screen.name}>
              {g.items.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </optgroup>
          ))}
        </select>
      );
    }
    case 'screen':
      return (
        <select value={v ?? ''} onChange={(e) => set(e.target.value)} className={!v && !f.placeholder ? 'invalid' : ''}>
          <option value="">{f.placeholder ?? '– Screen wählen –'}</option>
          {p.screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      );
    case 'table':
      if (creating) {
        return <InlineCreate placeholder="Name der Tabelle + Enter" onDone={(name) => {
          setCreating(false);
          if (!name) return;
          const id = uid('tbl');
          useEditor.getState().update((d) => {
            d.tables.push({ id, name, fields: [{ id: uid('fld'), name: 'Name', type: 'text' }] });
            const n = d.nodes.find((x) => x.id === node.id);
            if (n) n.config[f.key] = id;
          });
        }} />;
      }
      return (
        <select
          value={v ?? ''}
          className={!v ? 'invalid' : ''}
          onChange={(e) => (e.target.value === '__new' ? setCreating(true) : set(e.target.value))}
        >
          <option value="">– Tabelle wählen –</option>
          {p.tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          <option value="__new">+ Neue Tabelle …</option>
        </select>
      );
    case 'field': {
      if (f.tableKey) {
        const t = p.tables.find((x) => x.id === node.config[f.tableKey!]);
        return (
          <select value={v ?? ''} onChange={(e) => set(e.target.value)}>
            <option value="">{f.placeholder ?? '– Feld wählen –'}</option>
            {(t?.fields ?? []).map((fd) => <option key={fd.id} value={fd.name}>{fd.name}</option>)}
          </select>
        );
      }
      const names = [...new Set(p.tables.flatMap((t) => t.fields.map((fd) => fd.name)))];
      const listId = `fields-${node.id}-${f.key}`;
      return (
        <>
          <input
            list={listId}
            value={v ?? ''}
            placeholder={f.placeholder ?? 'Feldname'}
            onChange={(e) => set(e.target.value, key)}
          />
          <datalist id={listId}>{names.map((n) => <option key={n} value={n} />)}</datalist>
        </>
      );
    }
    case 'fields': {
      const t = p.tables.find((x) => x.id === node.config[f.tableKey ?? 'table']);
      const sel: string[] = Array.isArray(v) ? v : [];
      if (!t) return <span className="field-hint">Erst eine Tabelle wählen</span>;
      return (
        <div className="checks">
          {t.fields.map((fd) => (
            <label key={fd.id}>
              <input
                type="checkbox"
                checked={sel.includes(fd.id)}
                onChange={(e) => set(e.target.checked ? [...sel, fd.id] : sel.filter((x) => x !== fd.id))}
              />
              {fd.name}
            </label>
          ))}
        </div>
      );
    }
    case 'variable':
      if (creating) {
        return <InlineCreate placeholder="Name der Variable + Enter" onDone={(name) => {
          setCreating(false);
          if (!name) return;
          const id = uid('var');
          const type = newVariableType(node.type);
          useEditor.getState().update((d) => {
            d.variables.push({ id, name, type, initial: type === 'number' ? 0 : type === 'list' ? [] : '' });
            const n = d.nodes.find((x) => x.id === node.id);
            if (n) n.config[f.key] = id;
          });
        }} />;
      }
      return (
        <select
          value={v ?? ''}
          className={!v ? 'invalid' : ''}
          onChange={(e) => (e.target.value === '__new' ? setCreating(true) : set(e.target.value))}
        >
          <option value="">– Variable wählen –</option>
          {p.variables.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          <option value="__new">+ Neue Variable …</option>
        </select>
      );
    case 'custom': {
      const names = [...new Set(p.nodes.filter((n) => n.type === 'event.custom').map((n) => String(n.config.name ?? '')))];
      return (
        <select value={v ?? ''} onChange={(e) => set(e.target.value)} className={!v ? 'invalid' : ''}>
          <option value="">{names.length ? '– Ablauf wählen –' : '– erst »Eigener Ablauf« anlegen –'}</option>
          {v && !names.includes(v) && <option value={v}>{v} (fehlt)</option>}
          {names.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      );
    }
  }
  return null;
}
