import { ArrowDown, ArrowUp, Copy, Plus, Star, Trash2, Zap } from 'lucide-react';
import { DEVICES, ELEMENT_DEFS, selectOptions, type ElementEvent, type PropField } from '../../model/elements';
import type { DeviceKind, Project, Screen, UIElement } from '../../model/types';
import { validate } from '../../model/validate';
import { nodeDef } from '../../runtime/nodes';
import { addNodeBelow, copyUi, deleteUi, pasteUi } from '../actions';
import { ELEMENT_ICONS, Field, NumberField, TextField } from '../common';
import { useEditor, useProject } from '../store';

const EVENT_NODE: Record<ElementEvent, { type: string; label: string }> = {
  click: { type: 'event.click', label: 'Ablauf beim Klicken' },
  change: { type: 'event.change', label: 'Ablauf bei Änderung' },
  select: { type: 'event.select', label: 'Ablauf bei Auswahl eines Eintrags' },
};

function upd(fn: (d: Project) => void, key?: string) {
  useEditor.getState().update(fn, key ? { coalesce: key } : undefined);
}

export function UiInspector() {
  const p = useProject();
  const sel = useEditor((s) => s.uiSel);
  let body;
  if (sel.length > 1) body = <MultiPanel ids={sel} />;
  else if (sel.length === 1) {
    const s = p.screens.find((x) => x.id === sel[0]);
    const el = p.elements.find((x) => x.id === sel[0]);
    body = s ? <ScreenPanel s={s} /> : el ? <ElementPanel el={el} /> : <ProjectPanel />;
  } else body = <ProjectPanel />;
  return <aside className="inspector">{body}</aside>;
}

function Wiring({ id, events }: { id: string; events: { kind: string; type: string; label: string; config: Record<string, any> }[] }) {
  const p = useProject();
  const used = p.nodes.filter((n) => n.config.element === id || n.config.screen === id);
  const { revealNode } = useEditor.getState();
  if (!events.length && !used.length) return null;
  return (
    <section className="insp-sec">
      <h4><Zap size={14} /> Workflow</h4>
      {events.map((ev) => (
        <button key={ev.kind} className="btn small block" onClick={() => revealNode(addNodeBelow(ev.type, ev.config))}>
          <Plus size={14} /> {ev.label}
        </button>
      ))}
      {used.length > 0 && <div className="field-hint">Verwendet in:</div>}
      {used.map((n) => {
        const def = nodeDef(n.type);
        return (
          <button key={n.id} className="link-row" onClick={() => revealNode(n.id)}>
            <span className="dot" style={{ background: def ? undefined : '#999' }} />
            {def?.label ?? n.type}
          </button>
        );
      })}
    </section>
  );
}

function PropEditor({ el, f }: { el: UIElement; f: PropField }) {
  const p = useProject();
  const v = el.props[f.key];
  const set = (val: any, key?: string) => upd((d) => {
    const t = d.elements.find((x) => x.id === el.id);
    if (t) t.props[f.key] = val;
  }, key);
  switch (f.kind) {
    case 'text':
      return <TextField value={String(v ?? '')} onChange={(x) => set(x, `${el.id}.${f.key}`)} />;
    case 'textarea':
      return <TextField multiline value={String(v ?? '')} onChange={(x) => set(x, `${el.id}.${f.key}`)} />;
    case 'number':
      return <NumberField value={Number(v ?? 0)} onChange={(x) => set(x, `${el.id}.${f.key}`)} />;
    case 'bool':
      return <input type="checkbox" checked={!!v} onChange={(e) => set(e.target.checked)} />;
    case 'select':
      return (
        <select value={String(v ?? '')} onChange={(e) => set(e.target.value)}>
          {f.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'color':
      return (
        <div className="color-row">
          <input type="color" value={/^#[0-9a-f]{6}$/i.test(v) ? v : '#000000'} onChange={(e) => set(e.target.value, `${el.id}.${f.key}`)} />
          <TextField value={String(v ?? '')} onChange={(x) => set(x, `${el.id}.${f.key}`)} />
        </div>
      );
    case 'lines':
      return (
        <TextField
          multiline
          rows={4}
          value={selectOptions(el).join('\n')}
          onChange={(x) => set(x.split('\n'), `${el.id}.${f.key}`)}
        />
      );
    case 'table':
      return (
        <select value={String(v ?? '')} onChange={(e) => set(e.target.value)}>
          <option value="">(keine – der Workflow befüllt)</option>
          {p.tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      );
  }
}

function ElementPanel({ el }: { el: UIElement }) {
  const p = useProject();
  const def = ELEMENT_DEFS[el.type];
  const I = ELEMENT_ICONS[el.type];
  const { setUiSel, update } = useEditor.getState();
  const dup = p.elements.some((x) => x.id !== el.id && x.name === el.name);
  const source = p.tables.find((t) => t.id === el.props.source);
  const setGeom = (k: 'x' | 'y' | 'w' | 'h', v: number) => upd((d) => {
    const t = d.elements.find((x) => x.id === el.id);
    if (t) t[k] = Math.max(k === 'w' || k === 'h' ? 8 : -99999, Math.round(v));
  }, `${el.id}.geom`);
  const reorder = (dir: 1 | -1) => update((d) => {
    const i = d.elements.findIndex((x) => x.id === el.id);
    const j = i + dir;
    if (j < 0 || j >= d.elements.length) return;
    const [x] = d.elements.splice(i, 1);
    d.elements.splice(j, 0, x);
  });
  return (
    <>
      <div className="insp-head">
        <I size={18} />
        <span>{def.label}</span>
      </div>
      <section className="insp-sec">
        <Field label="Name" hint={dup ? '⚠️ Den Namen gibt es schon – im Workflow schwer zu unterscheiden.' : 'So heißt das Element im Workflow.'}>
          <TextField value={el.name} onChange={(v) => upd((d) => {
            const t = d.elements.find((x) => x.id === el.id);
            if (t) t.name = v;
          }, `${el.id}.name`)} />
        </Field>
        {def.props.map((f) => (
          <Field key={f.key} label={f.label} hint={f.hint}>
            <PropEditor el={el} f={f} />
            {f.key === 'itemTemplate' && source && (
              <div className="chips">
                {source.fields.map((fd) => (
                  <button key={fd.id} className="chip" onClick={() => upd((d) => {
                    const t = d.elements.find((x) => x.id === el.id);
                    if (t) t.props.itemTemplate = `${t.props.itemTemplate ?? ''}${t.props.itemTemplate ? ' ' : ''}{${fd.name}}`;
                  })}>{`{${fd.name}}`}</button>
                ))}
              </div>
            )}
          </Field>
        ))}
      </section>
      <section className="insp-sec">
        <h4>Position & Größe</h4>
        <div className="grid2">
          <Field label="X"><NumberField value={el.x} onChange={(v) => setGeom('x', v)} /></Field>
          <Field label="Y"><NumberField value={el.y} onChange={(v) => setGeom('y', v)} /></Field>
          <Field label="Breite"><NumberField value={el.w} onChange={(v) => setGeom('w', v)} /></Field>
          <Field label="Höhe"><NumberField value={el.h} onChange={(v) => setGeom('h', v)} /></Field>
        </div>
        <div className="btn-row">
          <button className="btn small" onClick={() => reorder(1)} title="Vor andere Elemente legen"><ArrowUp size={14} /> Nach vorne</button>
          <button className="btn small" onClick={() => reorder(-1)} title="Hinter andere Elemente legen"><ArrowDown size={14} /> Nach hinten</button>
        </div>
      </section>
      {!def.boardOnly && (
        <Wiring
          id={el.id}
          events={def.events.map((k) => ({ kind: k, ...EVENT_NODE[k], config: { element: el.id } }))}
        />
      )}
      <div className="insp-foot">
        <button className="btn small" onClick={() => {
          copyUi(p, [el.id]);
          let ids: string[] = [];
          update((d) => {
            ids = pasteUi(d, el.screenId);
          });
          setUiSel(ids);
        }}><Copy size={14} /> Duplizieren</button>
        <button className="btn small danger" onClick={() => {
          update((d) => deleteUi(d, [el.id]));
          setUiSel([]);
        }}><Trash2 size={14} /> Löschen</button>
      </div>
    </>
  );
}

function ScreenPanel({ s }: { s: Screen }) {
  const p = useProject();
  const { update, setUiSel } = useEditor.getState();
  const set = (fn: (t: Screen) => void, key?: string) => upd((d) => {
    const t = d.screens.find((x) => x.id === s.id);
    if (t) fn(t);
  }, key);
  const count = p.elements.filter((e) => e.screenId === s.id).length;
  return (
    <>
      <div className="insp-head"><span>Screen</span></div>
      <section className="insp-sec">
        <Field label="Name">
          <TextField value={s.name} onChange={(v) => set((t) => { t.name = v; }, `${s.id}.name`)} />
        </Field>
        <Field label="Gerät">
          <select value={s.device} onChange={(e) => set((t) => {
            const d = DEVICES[e.target.value as DeviceKind];
            t.device = e.target.value as DeviceKind;
            t.w = d.w;
            t.h = d.h;
          })}>
            {(Object.keys(DEVICES) as DeviceKind[]).map((k) => <option key={k} value={k}>{DEVICES[k].label} ({DEVICES[k].w} × {DEVICES[k].h})</option>)}
          </select>
        </Field>
        <div className="grid2">
          <Field label="Breite"><NumberField value={s.w} onChange={(v) => set((t) => { t.w = Math.max(160, v); }, `${s.id}.w`)} /></Field>
          <Field label="Höhe"><NumberField value={s.h} onChange={(v) => set((t) => { t.h = Math.max(160, v); }, `${s.id}.h`)} /></Field>
        </div>
        <Field label="Hintergrund">
          <div className="color-row">
            <input type="color" value={/^#[0-9a-f]{6}$/i.test(s.bg) ? s.bg : '#ffffff'} onChange={(e) => set((t) => { t.bg = e.target.value; }, `${s.id}.bg`)} />
            <TextField value={s.bg} onChange={(v) => set((t) => { t.bg = v; }, `${s.id}.bg`)} />
          </div>
        </Field>
        {p.startScreenId === s.id ? (
          <div className="field-hint"><Star size={12} /> Startscreen – hier beginnt die App.</div>
        ) : (
          <button className="btn small block" onClick={() => update((d) => { d.startScreenId = s.id; })}>
            <Star size={14} /> Als Startscreen festlegen
          </button>
        )}
      </section>
      <Wiring id={s.id} events={[{ kind: 'open', type: 'event.screen', label: 'Ablauf beim Öffnen', config: { screen: s.id } }]} />
      <div className="insp-foot">
        <span className="field-hint">{count} Element(e)</span>
        <button className="btn small danger" onClick={() => {
          update((d) => deleteUi(d, [s.id]));
          setUiSel([]);
        }}><Trash2 size={14} /> Screen löschen</button>
      </div>
    </>
  );
}

function MultiPanel({ ids }: { ids: string[] }) {
  const p = useProject();
  const { update, setUiSel } = useEditor.getState();
  const els = p.elements.filter((e) => ids.includes(e.id));
  const align = (fn: (e: UIElement, ref: UIElement[]) => void) => update((d) => {
    const list = d.elements.filter((e) => ids.includes(e.id));
    for (const e of list) fn(e, list);
  });
  return (
    <>
      <div className="insp-head"><span>{ids.length} ausgewählt</span></div>
      {els.length > 1 && (
        <section className="insp-sec">
          <h4>Ausrichten</h4>
          <div className="btn-row wrap">
            <button className="btn small" onClick={() => align((e, l) => { e.x = Math.min(...l.map((x) => x.x)); })}>Links</button>
            <button className="btn small" onClick={() => align((e, l) => { e.x = Math.max(...l.map((x) => x.x + x.w)) - e.w; })}>Rechts</button>
            <button className="btn small" onClick={() => align((e, l) => { e.y = Math.min(...l.map((x) => x.y)); })}>Oben</button>
            <button className="btn small" onClick={() => align((e, l) => { e.w = Math.max(...l.map((x) => x.w)); })}>Gleich breit</button>
            <button className="btn small" onClick={() => align((e, l) => {
              const sorted = [...l].sort((a, b) => a.y - b.y);
              let y = sorted[0].y;
              for (const x of sorted) {
                x.y = y;
                y += x.h + 12;
              }
            })}>Untereinander</button>
          </div>
        </section>
      )}
      <div className="insp-foot">
        <button className="btn small danger" onClick={() => {
          update((d) => deleteUi(d, ids));
          setUiSel([]);
        }}><Trash2 size={14} /> Alle löschen</button>
      </div>
    </>
  );
}

function ProjectPanel() {
  const p = useProject();
  const { update, revealElement } = useEditor.getState();
  const hints = validate(p).filter((i) => i.elementId);
  return (
    <>
      <div className="insp-head"><span>App</span></div>
      <section className="insp-sec">
        <Field label="Name der App">
          <TextField value={p.name} onChange={(v) => upd((d) => { d.name = v; }, 'name')} />
        </Field>
        <Field label="Beschreibung" hint="Erscheint im exportierten Steckbrief.">
          <TextField multiline rows={4} value={p.description} onChange={(v) => upd((d) => { d.description = v; }, 'desc')} />
        </Field>
        <Field label="Startscreen">
          <select value={p.startScreenId ?? ''} onChange={(e) => update((d) => { d.startScreenId = e.target.value || null; })}>
            {p.screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </section>
      {hints.length > 0 && (
        <section className="insp-sec">
          <h4>Hinweise</h4>
          {hints.map((h, i) => (
            <button key={i} className={`issue ${h.level}`} onClick={() => h.elementId && revealElement(h.elementId)}>{h.text}</button>
          ))}
        </section>
      )}
      <section className="insp-sec help">
        <h4>So geht's</h4>
        <ol>
          <li>Links einen Screen anlegen und Elemente hineinziehen (oder anklicken – dann werden sie untereinander angehängt).</li>
          <li>Element auswählen und rechts im Bereich <b>Workflow</b> einen Ablauf anlegen.</li>
          <li>Im Tab <b>Workflow</b> die Schritte verdrahten, dann oben <b>Ausprobieren</b>.</li>
        </ol>
      </section>
    </>
  );
}
