import { Monitor, Smartphone, Star, Tablet } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { DEVICES, ELEMENT_DEFS, PALETTE_GROUPS } from '../../model/elements';
import { makeElement, newScreen } from '../../model/project';
import type { DeviceKind, ElementType, Project, Screen, UIElement } from '../../model/types';
import { projectDb } from '../../runtime/database';
import { absRect, copyUi, deleteUi, intersects, pasteUi, screenAt, unionRect } from '../actions';
import { Canvas, type Rect } from '../Canvas';
import { ELEMENT_ICONS, isTyping, snap } from '../common';
import { ElementView, sampleRows } from '../ElementView';
import { useEditor, useProject } from '../store';
import { UiInspector } from './UiInspector';

const DEVICE_ICON = { phone: Smartphone, tablet: Tablet, desktop: Monitor };
type Dir = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const DIRS: Dir[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

function useDbVersion(projectId: string) {
  const db = projectDb(projectId);
  return useSyncExternalStore(
    (fn) => db.subscribe(fn),
    () => db.version,
  );
}

export function UiBoard() {
  const p = useProject();
  const sel = useEditor((s) => s.uiSel);
  const view = useEditor((s) => s.views.ui);
  const reveal = useEditor((s) => s.reveal);
  const { update, setUiSel, setView, beginGesture, endGesture } = useEditor.getState();
  const [editing, setEditing] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const z = view?.z ?? 1;
  useDbVersion(p.id);
  const db = projectDb(p.id);

  const bounds = useMemo(() => unionRect([
    ...p.screens.map((s) => ({ x: s.x, y: s.y - 30, w: s.w, h: s.h + 30 })),
    ...p.elements.filter((e) => !e.screenId).map((e) => absRect(p, e)),
  ]), [p]);

  // Jump to an element another view asked for.
  useEffect(() => {
    if (!reveal || !wrap.current) return;
    const el = p.elements.find((e) => e.id === reveal.id);
    const s = p.screens.find((x) => x.id === reveal.id);
    const r = el ? absRect(p, el) : s ? { x: s.x, y: s.y, w: s.w, h: s.h } : null;
    if (!r) return;
    const { clientWidth: w, clientHeight: h } = wrap.current;
    const zz = Math.min(1, view?.z ?? 1);
    setView('ui', { z: zz, x: w / 2 - (r.x + r.w / 2) * zz, y: h / 2 - (r.y + r.h / 2) * zz });
  }, [reveal?.t]); // eslint-disable-line react-hooks/exhaustive-deps

  const worldCenter = () => {
    const r = wrap.current!.getBoundingClientRect();
    const v = view ?? { x: 0, y: 0, z: 1 };
    return { x: (r.width / 2 - v.x) / v.z, y: (r.height / 2 - v.y) / v.z };
  };

  /** The screen new elements go to: the selected one, the one holding the selection, or the first. */
  const targetScreen = (d: Project): Screen | undefined => {
    for (const id of sel) {
      const s = d.screens.find((x) => x.id === id);
      if (s) return s;
      const e = d.elements.find((x) => x.id === id);
      if (e?.screenId) return d.screens.find((x) => x.id === e.screenId);
    }
    const c = worldCenter();
    return screenAt(d, c.x, c.y) ?? d.screens[0];
  };

  const addElement = (type: ElementType, at?: { x: number; y: number }) => {
    let newId = '';
    update((d) => {
      const def = ELEMENT_DEFS[type];
      let el: UIElement;
      if (at) {
        const s = def.boardOnly ? undefined : screenAt(d, at.x, at.y);
        el = makeElement(d, type, s?.id ?? null, snap(at.x - (s?.x ?? 0) - def.w / 2), snap(at.y - (s?.y ?? 0) - def.h / 2));
      } else if (def.boardOnly) {
        const c = worldCenter();
        el = makeElement(d, type, null, c.x - def.w / 2, c.y - def.h / 2);
      } else {
        const s = targetScreen(d);
        const below = d.elements.filter((e) => e.screenId === s?.id).reduce((m, e) => Math.max(m, e.y + e.h), 12);
        el = makeElement(d, type, s?.id ?? null, 24, snap(below + 12));
        if (s) el.w = Math.min(el.w, s.w - 48);
      }
      d.elements.push(el);
      newId = el.id;
    });
    setUiSel([newId]);
  };

  const addScreen = (device: DeviceKind) => {
    let id = '';
    update((d) => {
      const right = d.screens.reduce((m, s) => Math.max(m, s.x + s.w), -80);
      const top = d.screens.length ? Math.min(...d.screens.map((s) => s.y)) : 0;
      const s = newScreen(`Screen ${d.screens.length + 1}`, right + 80, top, device);
      d.screens.push(s);
      d.startScreenId ??= s.id;
      id = s.id;
    });
    setUiSel([id]);
    useEditor.getState().revealElement(id);
  };

  // ----- moving and resizing -------------------------------------------------------------------

  const startMove = (e: React.PointerEvent, ids: string[]) => {
    const toWorld = (cx: number, cy: number) => {
      const r = wrap.current!.querySelector('.canvas')!.getBoundingClientRect();
      const v = useEditor.getState().views.ui!;
      return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z };
    };
    const start = toWorld(e.clientX, e.clientY);
    const p0 = useEditor.getState().project!;
    const movingScreens = new Set(ids.filter((id) => p0.screens.some((s) => s.id === id)));
    const items = ids.flatMap((id) => {
      const s = p0.screens.find((x) => x.id === id);
      if (s) return [{ id, screen: true, x: s.x, y: s.y }];
      const el = p0.elements.find((x) => x.id === id);
      if (!el || (el.screenId && movingScreens.has(el.screenId))) return [];
      const r = absRect(p0, el);
      return [{ id, screen: false, x: r.x, y: r.y }];
    });
    let began = false;
    const move = (ev: PointerEvent) => {
      const w = toWorld(ev.clientX, ev.clientY);
      const dx = w.x - start.x;
      const dy = w.y - start.y;
      if (!began) {
        if (Math.hypot(dx, dy) * z < 3) return;
        began = true;
        beginGesture();
      }
      const free = ev.altKey;
      update((d) => {
        for (const it of items) {
          if (it.screen) {
            const s = d.screens.find((x) => x.id === it.id)!;
            s.x = free ? it.x + dx : snap(it.x + dx, 8);
            s.y = free ? it.y + dy : snap(it.y + dy, 8);
            continue;
          }
          const el = d.elements.find((x) => x.id === it.id)!;
          const nx = it.x + dx;
          const ny = it.y + dy;
          const target = ELEMENT_DEFS[el.type].boardOnly ? undefined
            : screenAt({ ...d, screens: d.screens.filter((s) => !movingScreens.has(s.id)) } as Project, nx + el.w / 2, ny + el.h / 2);
          el.screenId = target?.id ?? null;
          el.x = free ? nx - (target?.x ?? 0) : snap(nx - (target?.x ?? 0));
          el.y = free ? ny - (target?.y ?? 0) : snap(ny - (target?.y ?? 0));
        }
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (began) endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const startResize = (e: React.PointerEvent, id: string, dir: Dir) => {
    e.stopPropagation();
    e.preventDefault();
    const p0 = useEditor.getState().project!;
    const s0 = p0.screens.find((x) => x.id === id);
    const e0 = p0.elements.find((x) => x.id === id);
    const r0 = s0 ?? e0;
    if (!r0) return;
    const min = s0 ? 160 : 16;
    const sx = e.clientX;
    const sy = e.clientY;
    beginGesture();
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / z;
      const dy = (ev.clientY - sy) / z;
      let { x, y, w, h } = r0;
      if (dir.includes('e')) w = Math.max(min, snap(r0.w + dx));
      if (dir.includes('s')) h = Math.max(min, snap(r0.h + dy));
      if (dir.includes('w')) {
        w = Math.max(min, snap(r0.w - dx));
        x = r0.x + r0.w - w;
      }
      if (dir.includes('n')) {
        h = Math.max(min, snap(r0.h - dy));
        y = r0.y + r0.h - h;
      }
      update((d) => {
        const t = (s0 ? d.screens.find((s) => s.id === id) : d.elements.find((el) => el.id === id))!;
        Object.assign(t, { x, y, w, h });
      });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      endGesture();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const pick = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (editing) setEditing(null);
    let ids = sel;
    if (e.shiftKey) {
      ids = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      setUiSel(ids);
      return;
    }
    if (!sel.includes(id)) {
      ids = [id];
      setUiSel(ids);
    }
    startMove(e, ids);
  };

  const onMarquee = (r: Rect) => {
    const hit = [
      ...p.screens.filter((s) => r.x <= s.x && r.y <= s.y && r.x + r.w >= s.x + s.w && r.y + r.h >= s.y + s.h).map((s) => s.id),
      ...p.elements.filter((el) => intersects(r, absRect(p, el))).map((el) => el.id),
    ];
    const screensHit = new Set(hit.filter((id) => p.screens.some((s) => s.id === id)));
    setUiSel([...new Set([...sel, ...hit.filter((id) => {
      const el = p.elements.find((x) => x.id === id);
      return !el?.screenId || !screensHit.has(el.screenId);
    })])]);
  };

  // ----- keyboard ------------------------------------------------------------------------------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping() || editing) return;
      const mod = e.ctrlKey || e.metaKey;
      const { uiSel, project } = useEditor.getState();
      if (!project) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && uiSel.length) {
        e.preventDefault();
        update((d) => deleteUi(d, uiSel));
        setUiSel([]);
      } else if (mod && e.key.toLowerCase() === 'c' && uiSel.length) {
        copyUi(project, uiSel);
      } else if (mod && (e.key.toLowerCase() === 'v' || e.key.toLowerCase() === 'd')) {
        e.preventDefault();
        if (e.key.toLowerCase() === 'd') copyUi(project, uiSel);
        let ids: string[] = [];
        update((d) => {
          ids = pasteUi(d, targetScreen(d)?.id ?? null);
        });
        if (ids.length) setUiSel(ids);
      } else if (e.key === 'Escape') {
        setUiSel([]);
      } else if (e.key.startsWith('Arrow') && uiSel.length) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        update((d) => {
          for (const it of [...d.screens, ...d.elements]) if (uiSel.includes(it.id)) {
            it.x += dx;
            it.y += dy;
          }
        }, { coalesce: 'nudge' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- rendering -----------------------------------------------------------------------------

  const single = sel.length === 1 ? sel[0] : null;
  const singleRect = (() => {
    if (!single) return null;
    const s = p.screens.find((x) => x.id === single);
    if (s) return { x: s.x, y: s.y, w: s.w, h: s.h };
    const el = p.elements.find((x) => x.id === single);
    return el ? absRect(p, el) : null;
  })();

  const renderEl = (el: UIElement) => {
    const def = ELEMENT_DEFS[el.type];
    const isSel = sel.includes(el.id);
    const rows = (el.type === 'list' || el.type === 'table')
      ? sampleRows(el, el.props.source ? db.all(el.props.source) : undefined)
      : undefined;
    return (
      <div
        key={el.id}
        className={`ui-el t-${el.type} ${isSel ? 'sel' : ''}`}
        style={{ left: el.x, top: el.y, width: el.w, height: el.h }}
        onPointerDown={(e) => pick(e, el.id)}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (def.textProp) setEditing(el.id);
        }}
      >
        <ElementView el={el} p={p} sample={rows} />
        {editing === el.id && def.textProp && (
          <InlineEditor
            value={String(el.props[def.textProp] ?? '')}
            multiline={el.type === 'note' || el.type === 'text'}
            onDone={(v) => {
              setEditing(null);
              if (v !== null) update((d) => {
                const t = d.elements.find((x) => x.id === el.id);
                if (t) t.props[def.textProp!] = v;
              });
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div className="board-layout">
      <aside className="palette">
        <div className="palette-title">Screens</div>
        <div className="palette-screens">
          {(Object.keys(DEVICES) as DeviceKind[]).map((k) => {
            const I = DEVICE_ICON[k];
            return (
              <button key={k} className="pal-item" onClick={() => addScreen(k)} title={`${DEVICES[k].label}-Screen hinzufügen`}>
                <I size={18} />
                <span>{DEVICES[k].label}</span>
              </button>
            );
          })}
        </div>
        {PALETTE_GROUPS.map((g) => (
          <div key={g.title}>
            <div className="palette-title">{g.title}</div>
            <div className="palette-grid">
              {g.types.map((t) => {
                const I = ELEMENT_ICONS[t];
                return (
                  <button
                    key={t}
                    className="pal-item"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('aquist/element', t)}
                    onClick={() => addElement(t)}
                    title={`${ELEMENT_DEFS[t].hint} – klicken zum Anhängen, ziehen zum Platzieren`}
                  >
                    <I size={18} />
                    <span>{ELEMENT_DEFS[t].label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div className="palette-help">
          Ziehen = Board verschieben · Mausrad = Zoom · Shift+Ziehen = Auswahl · Doppelklick = Text bearbeiten
        </div>
      </aside>
      <div className="board-main" ref={wrap}>
        <Canvas
          view={view}
          onView={(v) => setView('ui', v)}
          bounds={bounds}
          onBackgroundClick={() => {
            setUiSel([]);
            setEditing(null);
          }}
          onMarquee={onMarquee}
          onDrop={(e, at) => {
            const t = e.dataTransfer.getData('aquist/element') as ElementType;
            if (t && ELEMENT_DEFS[t]) addElement(t, at);
          }}
        >
          {p.screens.map((s) => {
            const I = DEVICE_ICON[s.device] ?? Smartphone;
            return (
              <div
                key={s.id}
                className={`screen-frame ${sel.includes(s.id) ? 'sel' : ''}`}
                style={{ left: s.x, top: s.y, width: s.w, height: s.h, background: s.bg }}
                onPointerDown={(e) => pick(e, s.id)}
              >
                <div className="screen-title" style={{ fontSize: 13 / Math.max(z, 0.35), top: -26 / Math.max(z, 0.35) - 2 }}>
                  <I size={13 / Math.max(z, 0.35)} />
                  <span>{s.name}</span>
                  {p.startScreenId === s.id && <Star size={12 / Math.max(z, 0.35)} className="start-star" />}
                </div>
                {p.elements.filter((el) => el.screenId === s.id).map(renderEl)}
              </div>
            );
          })}
          {p.elements.filter((el) => !el.screenId).map(renderEl)}
          {single && singleRect && !editing && DIRS.map((d) => (
            <div
              key={d}
              className={`handle h-${d}`}
              style={{
                left: singleRect.x + (d.includes('w') ? 0 : d.includes('e') ? singleRect.w : singleRect.w / 2),
                top: singleRect.y + (d.includes('n') ? 0 : d.includes('s') ? singleRect.h : singleRect.h / 2),
                width: 10 / z,
                height: 10 / z,
                borderWidth: 1.5 / z,
              }}
              onPointerDown={(e) => startResize(e, single, d)}
            />
          ))}
        </Canvas>
      </div>
      <UiInspector />
    </div>
  );
}

function InlineEditor({ value, multiline, onDone }: { value: string; multiline: boolean; onDone(v: string | null): void }) {
  const [v, setV] = useState(value);
  const done = useRef(false);
  const finish = (out: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(out);
  };
  return (
    <textarea
      className="inline-edit"
      autoFocus
      value={v}
      onFocus={(e) => e.currentTarget.select()}
      onPointerDown={(e) => e.stopPropagation()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(v)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') finish(null);
        if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          finish(v);
        }
      }}
    />
  );
}
