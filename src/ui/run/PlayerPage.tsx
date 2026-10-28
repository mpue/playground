import { ArrowLeft, Download, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { DbData, Project } from '../../model/types';
import { Database } from '../../runtime/database';
import { Runtime } from '../../runtime/Runtime';
import { Logo } from '../Home';
import { AppView } from './AppView';

/** A database for an app someone shared: seeded with their data once, then kept in this browser. */
export function seededDb(key: string, data?: DbData): Database {
  let fresh = false;
  try {
    fresh = localStorage.getItem(key) === null;
  } catch {
    fresh = true;
  }
  const db = new Database(key);
  if (fresh && data) db.replace(data);
  return db;
}

interface Props {
  project: Project;
  db: Database;
  onBack?(): void;
  onAdopt?(): void;
  embedded?: boolean;
}

/** The app on its own, without the editor: for "try it" links and exported HTML files. */
export function PlayerPage({ project, db, onBack, onAdopt, embedded }: Props) {
  const [rt, setRt] = useState<Runtime | null>(null);
  const [run, setRun] = useState(0);
  useEffect(() => {
    const r = new Runtime(project, db);
    setRt(r);
    void r.start();
    document.title = project.name;
    return () => r.stop();
  }, [project, db, run]);
  return (
    <div className="player">
      <header className="player-top">
        {onBack && <button className="icon-btn" title="Zurück" onClick={onBack}><ArrowLeft size={18} /></button>}
        <b>{project.name}</b>
        <span className="grow" />
        <button className="btn small ghost" onClick={() => setRun((n) => n + 1)}><RotateCcw size={14} /> Neu starten</button>
        {onAdopt && <button className="btn small primary" onClick={onAdopt}><Download size={14} /> In meinen Playground übernehmen</button>}
      </header>
      <div className="player-stage">{rt && <AppView key={run} rt={rt} maxScale={1.25} />}</div>
      <footer className="player-foot">
        <Logo small /> {embedded ? 'Prototyp – Daten bleiben in diesem Browser.' : 'Prototyp aus dem Aquist Playground'}
      </footer>
    </div>
  );
}
