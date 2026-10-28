import { Plus, Trash2 } from 'lucide-react';
import { uid } from '../model/ids';
import type { DataType, VarDef } from '../model/types';
import { TYPE_LABEL, convert, toText } from '../runtime/values';
import { TextField } from './common';
import { useRuntime } from './run/AppView';
import { useEditor, useProject } from './store';

const TYPES: DataType[] = ['number', 'text', 'bool', 'list', 'any'];

function initialFor(type: DataType): any {
  return type === 'number' ? 0 : type === 'bool' ? false : type === 'list' ? [] : '';
}

/** Variables hold values while the app runs (a counter, a selected customer, a cart). */
export function VariablesEditor() {
  const p = useProject();
  const rt = useEditor((s) => s.runtime);
  useRuntime(rt);
  const { update } = useEditor.getState();
  const set = (id: string, fn: (v: VarDef) => void, key?: string) => update((d) => {
    const v = d.variables.find((x) => x.id === id);
    if (v) fn(v);
  }, key ? { coalesce: key } : undefined);
  const used = (id: string) => p.nodes.filter((n) => n.config.variable === id).length;
  return (
    <div className="vars">
      {p.variables.map((v) => (
        <div key={v.id} className="var-row">
          <TextField value={v.name} onChange={(x) => set(v.id, (t) => { t.name = x; }, `${v.id}.name`)} />
          <select value={v.type} onChange={(e) => set(v.id, (t) => {
            t.type = e.target.value as DataType;
            t.initial = initialFor(t.type);
          })}>
            {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
          {v.type === 'list' ? (
            <span className="field-hint">leere Liste</span>
          ) : v.type === 'bool' ? (
            <input type="checkbox" checked={!!v.initial} title="Startwert" onChange={(e) => set(v.id, (t) => { t.initial = e.target.checked; })} />
          ) : (
            <TextField
              value={toText(v.initial)}
              placeholder="Startwert"
              onChange={(x) => set(v.id, (t) => { t.initial = convert(x, t.type); }, `${v.id}.init`)}
            />
          )}
          <button
            className="icon-btn"
            title={used(v.id) ? `Wird in ${used(v.id)} Baustein(en) verwendet` : 'Löschen'}
            onClick={() => update((d) => { d.variables = d.variables.filter((x) => x.id !== v.id); })}
          >
            <Trash2 size={14} />
          </button>
          {rt && <div className="var-live">jetzt: <b>{JSON.stringify(rt.vars[v.id] ?? v.initial)}</b></div>}
        </div>
      ))}
      <button className="btn small" onClick={() => update((d) => {
        d.variables.push({ id: uid('var'), name: `Variable ${d.variables.length + 1}`, type: 'number', initial: 0 });
      })}>
        <Plus size={14} /> Variable
      </button>
    </div>
  );
}
