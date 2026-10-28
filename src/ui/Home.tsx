import { Copy, Download, FolderOpen, Lock, Play, Plus, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { adoptProject, deleteProject, duplicateProject, listProjects, loadProject, saveProject } from '../model/persist';
import { newProject } from '../model/project';
import { download, fileSafe, parseBundle } from '../model/share';
import { TEMPLATES } from '../model/templates';
import type { Project } from '../model/types';
import { projectDb } from '../runtime/database';
import { notify } from './common';

export function Logo({ small }: { small?: boolean }) {
  return (
    <span className={`logo ${small ? 'small' : ''}`}>
      <svg viewBox="0 0 32 32" width={small ? 22 : 28} height={small ? 22 : 28} aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <path d="M8 22 L16 8 L24 22 Z" fill="none" stroke="#fff" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="16" cy="19" r="2.5" fill="#fff" />
      </svg>
      <span className="logo-text"><b>Aquist</b> Playground</span>
    </span>
  );
}

function ago(t: number): string {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'gerade eben';
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  return new Date(t).toLocaleDateString('de-DE');
}

export function Home({ onOpen }: { onOpen(p: Project): void }) {
  const [list, setList] = useState(listProjects);
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = () => setList(listProjects());

  const create = (p: Project, data?: Record<string, any>) => {
    saveProject(p);
    if (data) projectDb(p.id).replace(data);
    onOpen(p);
  };

  const importFile = async (f: File) => {
    try {
      const b = parseBundle(await f.text());
      onOpen(adoptProject(b.project, b.data));
    } catch (e) {
      notify(`Datei konnte nicht gelesen werden: ${(e as Error).message}`);
    }
  };

  return (
    <div className="home">
      <header className="home-top">
        <Logo />
        <span className="grow" />
        <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = '';
        }} />
        <button className="btn ghost" onClick={() => fileRef.current?.click()}><FolderOpen size={16} /> Projektdatei öffnen</button>
        <button className="btn primary" onClick={() => create(newProject())}><Plus size={16} /> Neues Projekt</button>
      </header>
      <section className="hero">
        <h1>Apps skizzieren, verdrahten, ausprobieren.</h1>
        <div className="steps">
          <div><span className="step">1</span><b>Oberfläche</b><p>Screens auf dem Board anlegen, Buttons, Eingabefelder und Listen hineinziehen.</p></div>
          <div><span className="step">2</span><b>Workflow</b><p>Bausteine verdrahten: Ereignisse, Datenbank, Vergleiche, Zählen, Schleifen.</p></div>
          <div><span className="step">3</span><b>Ausprobieren & Teilen</b><p>Die App läuft sofort im Browser. Als Link, Datei oder Steckbrief weitergeben.</p></div>
        </div>
      </section>

      <section className="home-sec">
        <h2>Mit einer Vorlage starten</h2>
        <div className="cards">
          {TEMPLATES.map((t) => (
            <button key={t.id} className="card tpl" onClick={() => {
              const { project, data } = t.build();
              create(project, data);
            }}>
              <b>{t.name}</b>
              <span>{t.description}</span>
            </button>
          ))}
          <button className="card tpl blank" onClick={() => create(newProject())}>
            <Plus size={20} />
            <b>Leeres Projekt</b>
          </button>
        </div>
      </section>

      <section className="home-sec">
        <h2>Meine Projekte</h2>
        {list.length === 0 && <p className="field-hint">Noch keine Projekte in diesem Browser.</p>}
        <div className="cards">
          {list.map((m) => (
            <div key={m.id} className="card proj" onClick={() => {
              const p = loadProject(m.id);
              if (p) onOpen(p);
              else notify('Projekt konnte nicht geladen werden');
            }}>
              <b>{m.name}</b>
              <span>{m.screens} Screen(s) · {m.nodes} Baustein(e)</span>
              <small>{ago(m.updatedAt)}</small>
              <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                <button className="icon-btn" title="Ausprobieren" onClick={() => { location.hash = `#/run/${m.id}`; }}><Play size={15} /></button>
                <button className="icon-btn" title="Duplizieren" onClick={() => { duplicateProject(m.id); refresh(); }}><Copy size={15} /></button>
                <button className="icon-btn" title="Projektdatei herunterladen (ohne Daten)" onClick={() => {
                  const p = loadProject(m.id);
                  if (p) download(`${fileSafe(p.name)}.aquist.json`, JSON.stringify({ project: p }, null, 2), 'application/json');
                }}><Download size={15} /></button>
                <button className="icon-btn danger" title="Löschen" onClick={() => {
                  if (!window.confirm(`»${m.name}« mit allen lokalen Daten löschen?`)) return;
                  deleteProject(m.id);
                  refresh();
                }}><Trash2 size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <footer className="home-foot">
        <Lock size={14} /> Projekte und Daten bleiben in diesem Browser. Weitergegeben wird nur, was du über »Teilen« ausdrücklich exportierst.
      </footer>
    </div>
  );
}
