import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ELEMENT_DEFS } from '../../model/elements';
import type { Runtime } from '../../runtime/Runtime';
import { ElementView } from '../ElementView';

export function useRuntime(rt: Runtime | null): number {
  return useSyncExternalStore(
    (fn) => (rt ? rt.subscribe(fn) : () => {}),
    () => rt?.version ?? 0,
  );
}

/** The running app: the current screen, scaled to fit, with its toasts and dialogs. */
export function AppView({ rt, maxScale = 1 }: { rt: Runtime; maxScale?: number }) {
  useRuntime(rt);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = box.current!;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  const p = rt.project;
  const s = p.screens.find((x) => x.id === rt.screenId);
  if (!s) {
    return <div className="appview" ref={box}><div className="app-empty">Diese App hat noch keinen Screen.</div></div>;
  }
  const scale = Math.max(0.1, Math.min(maxScale, (size.w - 24) / s.w, (size.h - 24) / s.h) || 0.5);
  const els = p.elements.filter((e) => e.screenId === s.id && !ELEMENT_DEFS[e.type]?.boardOnly && !rt.state(e.id).hidden);
  return (
    <div className="appview" ref={box}>
      <div className="device" style={{ width: s.w * scale, height: s.h * scale }}>
        <div className="device-screen" style={{ width: s.w, height: s.h, background: s.bg, transform: `scale(${scale})` }}>
          {els.map((el) => (
            <div key={el.id} className={`run-el t-${el.type}`} style={{ left: el.x, top: el.y, width: el.w, height: el.h }}>
              <ElementView el={el} p={p} rt={rt} />
            </div>
          ))}
          <div className="app-toasts">
            {rt.toasts.map((t) => <div key={t.id} className={`app-toast ${t.style}`}>{t.text}</div>)}
          </div>
          {rt.dialog && <AppDialog rt={rt} />}
        </div>
      </div>
    </div>
  );
}

function AppDialog({ rt }: { rt: Runtime }) {
  const d = rt.dialog!;
  const [v, setV] = useState(d.def ?? '');
  return (
    <div className="app-dialog-back">
      <form
        className="app-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          d.answer(d.kind === 'confirm' ? true : v);
        }}
      >
        <p>{d.text}</p>
        {d.kind === 'prompt' && <input autoFocus value={v} onChange={(e) => setV(e.target.value)} />}
        <div className="app-dialog-btns">
          <button type="button" className="app-btn ghost" onClick={() => d.answer(d.kind === 'confirm' ? false : null)}>
            {d.kind === 'confirm' ? 'Nein' : 'Abbrechen'}
          </button>
          <button type="submit" className="app-btn primary" autoFocus={d.kind === 'confirm'}>
            {d.kind === 'confirm' ? 'Ja' : 'OK'}
          </button>
        </div>
      </form>
    </div>
  );
}
