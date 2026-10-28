import { forgetDb, projectDb } from '../runtime/database';
import { copyProject, normalizeProject } from './project';
import type { DbData, Project } from './types';

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  screens: number;
  nodes: number;
}

const INDEX = 'aquist.index';
const key = (id: string) => `aquist.project.${id}`;

function readIndex(): ProjectMeta[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX) ?? '[]');
  } catch {
    return [];
  }
}

function writeIndex(list: ProjectMeta[]) {
  localStorage.setItem(INDEX, JSON.stringify(list));
}

export function listProjects(): ProjectMeta[] {
  return readIndex().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function loadProject(id: string): Project | null {
  const raw = localStorage.getItem(key(id));
  if (!raw) return null;
  try {
    return normalizeProject(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveProject(p: Project) {
  localStorage.setItem(key(p.id), JSON.stringify(p));
  const meta: ProjectMeta = { id: p.id, name: p.name, updatedAt: p.updatedAt, screens: p.screens.length, nodes: p.nodes.length };
  writeIndex([meta, ...readIndex().filter((m) => m.id !== p.id)]);
}

export function deleteProject(id: string) {
  localStorage.removeItem(key(id));
  forgetDb(id);
  writeIndex(readIndex().filter((m) => m.id !== id));
}

/** Stores a project (with optional data) as a new local project and returns it. */
export function adoptProject(p: Project, data?: DbData, name?: string): Project {
  const copy = copyProject(normalizeProject(p), name);
  saveProject(copy);
  if (data) projectDb(copy.id).replace(data);
  return copy;
}

export function duplicateProject(id: string): Project | null {
  const p = loadProject(id);
  if (!p) return null;
  return adoptProject(p, projectDb(id).snapshot(), `${p.name} (Kopie)`);
}
