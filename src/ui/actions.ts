import { clone, uid } from '../model/ids';
import type { FlowNode, Project, Screen, UIElement } from '../model/types';
import { defaultConfig, nodeDef } from '../runtime/nodes';
import type { Rect } from './Canvas';
import { useEditor } from './store';

export function screenOf(p: Project, el: UIElement): Screen | undefined {
  return el.screenId ? p.screens.find((s) => s.id === el.screenId) : undefined;
}

export function absRect(p: Project, el: UIElement): Rect {
  const s = screenOf(p, el);
  return { x: (s?.x ?? 0) + el.x, y: (s?.y ?? 0) + el.y, w: el.w, h: el.h };
}

/** The top-most screen under a board point. */
export function screenAt(p: Project, x: number, y: number): Screen | undefined {
  for (let i = p.screens.length - 1; i >= 0; i--) {
    const s = p.screens[i];
    if (x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h) return s;
  }
  return undefined;
}

export function unionRect(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.w));
  const y1 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** Adds a workflow node below everything else and returns its id. */
export function addNodeBelow(type: string, config: Record<string, any>): string {
  const def = nodeDef(type)!;
  const id = uid('nd');
  useEditor.getState().update((d) => {
    const maxY = d.nodes.length ? Math.max(...d.nodes.map((n) => n.y)) + 220 : 0;
    const node: FlowNode = { id, type, x: 0, y: maxY, config: { ...defaultConfig(def), ...config } };
    d.nodes.push(node);
  });
  return id;
}

/** Clipboard shared by copy/paste on the UI board. */
let uiClipboard: { screens: Screen[]; elements: UIElement[] } | null = null;

export function copyUi(p: Project, ids: string[]) {
  const screens = p.screens.filter((s) => ids.includes(s.id));
  const elements = p.elements.filter((e) => ids.includes(e.id) || (e.screenId && screens.some((s) => s.id === e.screenId)));
  if (screens.length || elements.length) uiClipboard = clone({ screens, elements });
}

export function pasteUi(d: Project, targetScreen: string | null): string[] {
  if (!uiClipboard) return [];
  const map = new Map<string, string>();
  const out: string[] = [];
  for (const s of uiClipboard.screens) {
    const id = uid('scr');
    map.set(s.id, id);
    d.screens.push({ ...clone(s), id, name: `${s.name} (Kopie)`, x: s.x + s.w + 80 });
    out.push(id);
  }
  const taken = new Set(d.elements.map((e) => e.name));
  for (const e of uiClipboard.elements) {
    const copiedScreen = e.screenId ? map.get(e.screenId) : undefined;
    const id = uid('el');
    let name = e.name;
    for (let i = 2; taken.has(name); i++) name = `${e.name} ${i}`;
    taken.add(name);
    const fresh: UIElement = { ...clone(e), id, name };
    if (copiedScreen) fresh.screenId = copiedScreen;
    else {
      if (targetScreen && fresh.screenId !== targetScreen && !fresh.type.startsWith('note')) fresh.screenId = targetScreen;
      fresh.x += 16;
      fresh.y += 16;
      out.push(id);
    }
    d.elements.push(fresh);
  }
  return out;
}

export function deleteUi(d: Project, ids: string[]) {
  const screens = new Set(ids.filter((id) => d.screens.some((s) => s.id === id)));
  d.screens = d.screens.filter((s) => !screens.has(s.id));
  d.elements = d.elements.filter((e) => !ids.includes(e.id) && !(e.screenId && screens.has(e.screenId)));
  if (d.startScreenId && screens.has(d.startScreenId)) d.startScreenId = d.screens[0]?.id ?? null;
}
