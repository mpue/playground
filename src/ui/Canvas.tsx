import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { View } from './store';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CanvasApi {
  view: View;
  toWorld(clientX: number, clientY: number): { x: number; y: number };
  el: HTMLDivElement | null;
}

const Ctx = createContext<CanvasApi | null>(null);

export function useCanvas(): CanvasApi {
  return useContext(Ctx)!;
}

interface Props {
  view: View | null;
  onView(v: View): void;
  /** Bounds of the content, used for the first view and "zoom to fit". */
  bounds: Rect | null;
  children: ReactNode;
  overlay?: ReactNode;
  className?: string;
  onBackgroundClick?(): void;
  onMarquee?(r: Rect, additive: boolean): void;
  onDrop?(e: React.DragEvent, world: { x: number; y: number }): void;
  onDoubleClick?(e: React.MouseEvent, world: { x: number; y: number }): void;
  onContextMenu?(e: React.MouseEvent, world: { x: number; y: number }): void;
}

export const MIN_Z = 0.1;
export const MAX_Z = 3;

export function fitView(b: Rect, w: number, h: number, pad = 80, maxZ = 1): View {
  const z = Math.max(MIN_Z, Math.min(maxZ, (w - pad * 2) / Math.max(b.w, 1), (h - pad * 2) / Math.max(b.h, 1)));
  return { z, x: w / 2 - (b.x + b.w / 2) * z, y: h / 2 - (b.y + b.h / 2) * z };
}

function isBackground(t: EventTarget | null, root: HTMLElement): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el === root || el.dataset?.bg === '1');
}

/** Infinite board: wheel zooms at the cursor, dragging empty space pans, Shift+drag selects. */
export function Canvas(props: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [space, setSpace] = useState(false);
  const view = props.view ?? { x: 0, y: 0, z: 1 };
  const viewRef = useRef(view);
  viewRef.current = view;
  const onViewRef = useRef(props.onView);
  onViewRef.current = props.onView;

  useLayoutEffect(() => {
    const el = ref.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // First view: fit the content.
  useEffect(() => {
    if (props.view || !size.w) return;
    props.onView(props.bounds ? fitView(props.bounds, size.w, size.h) : { x: size.w / 2, y: 80, z: 1 });
  }, [props.view, size.w, size.h]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = viewRef.current;
      const r = el.getBoundingClientRect();
      if (!e.ctrlKey && (e.shiftKey || Math.abs(e.deltaX) > 0.5)) {
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        onViewRef.current({ ...v, x: v.x - dx, y: v.y - dy });
        return;
      }
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const scale = e.deltaMode === 1 ? 0.05 : 0.0015;
      const z = Math.max(MIN_Z, Math.min(MAX_Z, v.z * Math.exp(-e.deltaY * scale * (e.ctrlKey ? 4 : 1))));
      onViewRef.current({ z, x: mx - ((mx - v.x) / v.z) * z, y: my - ((my - v.y) / v.z) * z });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const typing = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !typing()) {
        setSpace(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const toWorld = (cx: number, cy: number) => {
    const r = ref.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const bg = isBackground(e.target, ref.current!);
    const pan = e.button === 1 || (e.button === 0 && (space || (bg && !e.shiftKey)));
    if (pan) {
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY, v: viewRef.current };
      let moved = false;
      const move = (ev: PointerEvent) => {
        const dx = ev.clientX - start.x;
        const dy = ev.clientY - start.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        onViewRef.current({ ...start.v, x: start.v.x + dx, y: start.v.y + dy });
      };
      const upFn = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', upFn);
        ref.current?.classList.remove('panning');
        if (!moved && bg && e.button === 0) props.onBackgroundClick?.();
      };
      ref.current!.classList.add('panning');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', upFn);
      return;
    }
    if (bg && e.button === 0 && e.shiftKey && props.onMarquee) {
      const a = toWorld(e.clientX, e.clientY);
      const move = (ev: PointerEvent) => {
        const b = toWorld(ev.clientX, ev.clientY);
        setMarquee({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });
      };
      const upFn = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', upFn);
        const b = toWorld(ev.clientX, ev.clientY);
        setMarquee(null);
        props.onMarquee?.({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }, true);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', upFn);
    }
  };

  const zoomBy = (f: number) => {
    const v = viewRef.current;
    const z = Math.max(MIN_Z, Math.min(MAX_Z, v.z * f));
    const cx = size.w / 2;
    const cy = size.h / 2;
    props.onView({ z, x: cx - ((cx - v.x) / v.z) * z, y: cy - ((cy - v.y) / v.z) * z });
  };

  const fit = () => {
    if (props.bounds) props.onView(fitView(props.bounds, size.w, size.h));
  };

  const api: CanvasApi = { view, toWorld, el: ref.current };
  const grid = 24 * view.z;

  return (
    <Ctx.Provider value={api}>
      <div
        ref={ref}
        className={`canvas ${space ? 'space' : ''} ${props.className ?? ''}`}
        style={{
          backgroundSize: `${grid}px ${grid}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        onPointerDown={onPointerDown}
        onDragOver={(e) => props.onDrop && e.preventDefault()}
        onDrop={(e) => {
          if (!props.onDrop) return;
          e.preventDefault();
          props.onDrop(e, toWorld(e.clientX, e.clientY));
        }}
        onDoubleClick={(e) => isBackground(e.target, ref.current!) && props.onDoubleClick?.(e, toWorld(e.clientX, e.clientY))}
        onContextMenu={(e) => {
          if (!props.onContextMenu || !isBackground(e.target, ref.current!)) return;
          e.preventDefault();
          props.onContextMenu(e, toWorld(e.clientX, e.clientY));
        }}
      >
        <div
          className="canvas-world"
          data-bg="1"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, ['--z' as any]: view.z }}
        >
          {props.children}
          {marquee && (
            <div className="marquee" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h, borderWidth: 1 / view.z }} />
          )}
        </div>
        {props.overlay}
        <div className="zoom-ctl" onPointerDown={(e) => e.stopPropagation()}>
          <button title="Verkleinern" onClick={() => zoomBy(1 / 1.25)}>−</button>
          <button title="Auf 100 % setzen" className="pct" onClick={() => zoomBy(1 / view.z)}>{Math.round(view.z * 100)} %</button>
          <button title="Vergrößern" onClick={() => zoomBy(1.25)}>+</button>
          <button title="Alles zeigen" onClick={fit}>⤢</button>
        </div>
      </div>
    </Ctx.Provider>
  );
}
