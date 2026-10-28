import { produce } from 'immer';
import { create } from 'zustand';
import { saveProject } from '../model/persist';
import type { Project } from '../model/types';
import { projectDb } from '../runtime/database';
import { Runtime } from '../runtime/Runtime';

export type Tab = 'ui' | 'flow' | 'data';

export interface View {
  x: number;
  y: number;
  z: number;
}

interface UpdateOpts {
  /** Repeated updates with the same key within a second become one undo step (typing). */
  coalesce?: string;
}

interface EditorState {
  project: Project | null;
  past: Project[];
  future: Project[];
  tab: Tab;
  uiSel: string[];
  flowSel: string[];
  edgeSel: string | null;
  views: Record<'ui' | 'flow', View | null>;
  runtime: Runtime | null;
  savedAt: number;
  /** A node or element the other board should scroll to and select. */
  reveal: { id: string; t: number } | null;

  open(p: Project): void;
  close(): void;
  update(fn: (d: Project) => void, opts?: UpdateOpts): void;
  beginGesture(): void;
  endGesture(): void;
  undo(): void;
  redo(): void;
  setTab(t: Tab): void;
  setUiSel(ids: string[]): void;
  setFlowSel(ids: string[]): void;
  setEdgeSel(id: string | null): void;
  setView(which: 'ui' | 'flow', v: View): void;
  revealNode(id: string): void;
  revealElement(id: string): void;
  startRun(): void;
  stopRun(): void;
}

let gestureBase: Project | null = null;
let lastKey = '';
let lastTime = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleSave(p: Project, set: (s: Partial<EditorState>) => void) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveProject(p);
    set({ savedAt: Date.now() });
  }, 400);
}

export const useEditor = create<EditorState>((set, get) => ({
  project: null,
  past: [],
  future: [],
  tab: 'ui',
  uiSel: [],
  flowSel: [],
  edgeSel: null,
  views: { ui: null, flow: null },
  runtime: null,
  savedAt: 0,
  reveal: null,

  open(p) {
    get().runtime?.stop();
    set({
      project: p, past: [], future: [], uiSel: [], flowSel: [], edgeSel: null,
      views: { ui: null, flow: null }, runtime: null, tab: 'ui',
    });
  },

  close() {
    const { project, runtime } = get();
    runtime?.stop();
    if (project) saveProject(project);
    set({ project: null, runtime: null });
  },

  update(fn, opts) {
    const cur = get().project;
    if (!cur) return;
    const next = produce(cur, (d) => {
      fn(d);
      d.updatedAt = Date.now();
    });
    if (next === cur) return;
    const now = Date.now();
    const merge = gestureBase !== null || (opts?.coalesce && opts.coalesce === lastKey && now - lastTime < 1000);
    lastKey = opts?.coalesce ?? '';
    lastTime = now;
    set({
      project: next,
      past: merge ? get().past : [...get().past.slice(-150), cur],
      future: merge ? get().future : [],
    });
    get().runtime?.setProject(next);
    scheduleSave(next, set);
  },

  beginGesture() {
    gestureBase = get().project;
  },

  endGesture() {
    const base = gestureBase;
    gestureBase = null;
    const cur = get().project;
    if (base && cur && base !== cur) set({ past: [...get().past.slice(-150), base], future: [] });
  },

  undo() {
    const { past, project, future } = get();
    if (!past.length || !project) return;
    const prev = past[past.length - 1];
    set({ project: prev, past: past.slice(0, -1), future: [project, ...future] });
    get().runtime?.setProject(prev);
    scheduleSave(prev, set);
  },

  redo() {
    const { past, project, future } = get();
    if (!future.length || !project) return;
    const next = future[0];
    set({ project: next, past: [...past, project], future: future.slice(1) });
    get().runtime?.setProject(next);
    scheduleSave(next, set);
  },

  setTab: (tab) => set({ tab }),
  setUiSel: (uiSel) => set({ uiSel }),
  setFlowSel: (flowSel) => set({ flowSel, edgeSel: null }),
  setEdgeSel: (edgeSel) => set({ edgeSel, flowSel: [] }),
  setView: (which, v) => set({ views: { ...get().views, [which]: v } }),
  revealNode: (id) => set({ tab: 'flow', flowSel: [id], edgeSel: null, reveal: { id, t: Date.now() } }),
  revealElement: (id) => set({ tab: 'ui', uiSel: [id], reveal: { id, t: Date.now() } }),

  startRun() {
    const p = get().project;
    if (!p) return;
    get().runtime?.stop();
    const rt = new Runtime(p, projectDb(p.id));
    rt.onNode = flashNode;
    useFlash.setState({ map: {} });
    set({ runtime: rt });
    void rt.start();
  },

  stopRun() {
    get().runtime?.stop();
    set({ runtime: null });
    useFlash.setState({ map: {} });
  },
}));

// Node highlighting while the app runs. Kept apart so a flash re-renders one node only.
interface FlashState {
  map: Record<string, { t: number; state: 'run' | 'error' }>;
}

export const useFlash = create<FlashState>(() => ({ map: {} }));

function flashNode(id: string, state: 'run' | 'error') {
  const cur = useFlash.getState().map[id];
  const now = Date.now();
  if (cur && cur.state === state && now - cur.t < 120) return;
  useFlash.setState((s) => ({ map: { ...s.map, [id]: { t: now, state } } }));
}

/** Shortcut for components that only render while a project is open. */
export function useProject(): Project {
  return useEditor((s) => s.project)!;
}
