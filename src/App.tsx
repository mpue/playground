import { Download, Lock, Play } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { adoptProject, loadProject } from './model/persist';
import { decodeBundle } from './model/share';
import type { Project, ShareBundle } from './model/types';
import { nodeDef } from './runtime/nodes';
import { projectDb } from './runtime/database';
import { EditorToasts } from './ui/common';
import { Editor } from './ui/Editor';
import { Home, Logo } from './ui/Home';
import { PlayerPage, seededDb } from './ui/run/PlayerPage';
import { useEditor } from './ui/store';

type Route =
  | { kind: 'home' }
  | { kind: 'edit'; id: string }
  | { kind: 'run'; id: string }
  | { kind: 'share'; payload: string }
  | { kind: 'play'; payload: string };

function parse(hash: string): Route {
  const h = hash.replace(/^#/, '');
  if (h.startsWith('share=')) return { kind: 'share', payload: h.slice(6) };
  if (h.startsWith('play=')) return { kind: 'play', payload: h.slice(5) };
  const m = /^\/(p|run)\/(.+)$/.exec(h);
  if (m) return m[1] === 'p' ? { kind: 'edit', id: m[2] } : { kind: 'run', id: m[2] };
  return { kind: 'home' };
}

function useRoute(): Route {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  return useMemo(() => parse(hash), [hash]);
}

const go = (h: string) => {
  location.hash = h;
};

export function App() {
  const route = useRoute();
  return (
    <>
      <Routed route={route} />
      <EditorToasts />
    </>
  );
}

function Routed({ route }: { route: Route }) {
  switch (route.kind) {
    case 'edit':
      return <EditRoute id={route.id} />;
    case 'run':
      return <RunRoute id={route.id} />;
    case 'share':
    case 'play':
      return <SharedRoute payload={route.payload} play={route.kind === 'play'} />;
    default:
      return <Home onOpen={(p) => go(`#/p/${p.id}`)} />;
  }
}

function EditRoute({ id }: { id: string }) {
  const project = useEditor((s) => s.project);
  useEffect(() => {
    if (useEditor.getState().project?.id === id) return;
    const p = loadProject(id);
    if (p) useEditor.getState().open(p);
    else go('#/');
  }, [id]);
  useEffect(() => () => useEditor.getState().close(), []);
  if (!project || project.id !== id) return null;
  return <Editor onHome={() => go('#/')} />;
}

function RunRoute({ id }: { id: string }) {
  const p = useMemo(() => loadProject(id), [id]);
  if (!p) return <Home onOpen={(x) => go(`#/p/${x.id}`)} />;
  return <PlayerPage project={p} db={projectDb(p.id)} onBack={() => go('#/')} />;
}

function SharedRoute({ payload, play }: { payload: string; play: boolean }) {
  const [bundle, setBundle] = useState<ShareBundle | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'ask' | 'play'>(play ? 'play' : 'ask');
  const [withData, setWithData] = useState(true);
  useEffect(() => {
    decodeBundle(payload).then(setBundle, (e) => setError((e as Error).message));
  }, [payload]);
  const db = useMemo(() => bundle && seededDb(`aquist.db.shared.${bundle.project.id}`, bundle.data), [bundle]);

  if (error) {
    return (
      <div className="import-page">
        <Logo />
        <h1>Link kaputt</h1>
        <p>Der Link ließ sich nicht lesen – vielleicht wurde er beim Kopieren abgeschnitten.</p>
        <button className="btn" onClick={() => go('#/')}>Zur Startseite</button>
      </div>
    );
  }
  if (!bundle || !db) return null;
  const adopt = () => {
    const p: Project = adoptProject(bundle.project, withData ? bundle.data : undefined);
    go(`#/p/${p.id}`);
  };
  if (mode === 'play') return <PlayerPage project={bundle.project} db={db} onAdopt={adopt} />;

  const p = bundle.project;
  const records = bundle.data ? Object.values(bundle.data).reduce((n, r) => n + r.length, 0) : 0;
  const flows = p.nodes.filter((n) => nodeDef(n.type)?.event).length;
  return (
    <div className="import-page">
      <Logo />
      <h1>Geteiltes Projekt: {p.name}</h1>
      {p.description && <p>{p.description}</p>}
      <p className="field-hint">{p.screens.length} Screen(s) · {p.tables.length} Tabelle(n) · {flows} Ablauf/Abläufe</p>
      {bundle.data ? (
        <label className={`data-opt ${withData ? 'on' : ''}`}>
          <input type="checkbox" checked={withData} onChange={(e) => setWithData(e.target.checked)} />
          <span><b>Mitgeschickte Daten übernehmen</b> ({records} Datensatz/-sätze)</span>
        </label>
      ) : (
        <p className="field-hint"><Lock size={12} /> Ohne Datenbank-Inhalte geteilt.</p>
      )}
      <div className="btn-row">
        <button className="btn primary" onClick={adopt}><Download size={16} /> In meinen Playground übernehmen</button>
        <button className="btn" onClick={() => setMode('play')}><Play size={16} /> Erst ausprobieren</button>
      </div>
      <p className="field-hint">Übernehmen legt eine eigene Kopie in diesem Browser an. Das Original bleibt unverändert.</p>
    </div>
  );
}
