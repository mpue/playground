import { DEVICES, ELEMENT_DEFS, nextElementName } from './elements';
import { clone, uid } from './ids';
import type { DeviceKind, ElementType, Project, Screen, UIElement } from './types';

export function newScreen(name: string, x: number, y: number, device: DeviceKind = 'phone'): Screen {
  const d = DEVICES[device];
  return { id: uid('scr'), name, x, y, w: d.w, h: d.h, device, bg: '#ffffff' };
}

export function newProject(name = 'Neue App'): Project {
  const now = Date.now();
  const s = newScreen('Start', 0, 0);
  return {
    format: 'aquist-playground',
    version: 1,
    id: uid('prj'),
    name,
    description: '',
    createdAt: now,
    updatedAt: now,
    screens: [s],
    elements: [],
    startScreenId: s.id,
    nodes: [],
    edges: [],
    tables: [],
    variables: [],
  };
}

export function makeElement(
  p: Project, type: ElementType, screenId: string | null, x: number, y: number, props: Record<string, any> = {},
): UIElement {
  const def = ELEMENT_DEFS[type];
  return {
    id: uid('el'),
    type,
    name: nextElementName(p, type),
    screenId: def.boardOnly ? null : screenId,
    x: Math.round(x),
    y: Math.round(y),
    w: def.w,
    h: def.h,
    props: { ...clone(def.defaults), ...props },
  };
}

/** Accepts anything that looks like a project (imports, links) and fills what is missing. */
export function normalizeProject(raw: any): Project {
  if (!raw || typeof raw !== 'object') throw new Error('Keine gültige Projektdatei');
  const base = newProject(String(raw.name ?? 'Importierte App'));
  const p: Project = {
    ...base,
    ...raw,
    format: 'aquist-playground',
    version: 1,
    screens: Array.isArray(raw.screens) ? raw.screens : [],
    elements: Array.isArray(raw.elements) ? raw.elements : [],
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    edges: Array.isArray(raw.edges) ? raw.edges : [],
    tables: Array.isArray(raw.tables) ? raw.tables : [],
    variables: Array.isArray(raw.variables) ? raw.variables : [],
  };
  if (!p.id) p.id = uid('prj');
  for (const e of p.elements) e.props = { ...ELEMENT_DEFS[e.type]?.defaults, ...e.props };
  for (const n of p.nodes) n.config = n.config ?? {};
  if (p.startScreenId && !p.screens.some((s) => s.id === p.startScreenId)) p.startScreenId = p.screens[0]?.id ?? null;
  return p;
}

/** A copy with fresh ids for the project (elements keep theirs; they are only unique per project). */
export function copyProject(p: Project, name?: string): Project {
  const now = Date.now();
  return { ...clone(p), id: uid('prj'), name: name ?? p.name, createdAt: now, updatedAt: now };
}
