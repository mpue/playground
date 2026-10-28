import { Database, FileText, LayoutTemplate, Play, Redo2, Share2, Square, Undo2, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DataView } from './data/DataView';
import { DescribeDialog, ShareDialog } from './dialogs/Dialogs';
import { FlowBoard } from './flow/FlowBoard';
import { UiBoard } from './board/UiBoard';
import { Logo } from './Home';
import { RunDock } from './run/RunDock';
import { isTyping } from './common';
import { useEditor, useProject, type Tab } from './store';

const TABS: { id: Tab; label: string; icon: typeof Workflow; step?: string }[] = [
  { id: 'ui', label: 'Oberfläche', icon: LayoutTemplate, step: '1' },
  { id: 'flow', label: 'Workflow', icon: Workflow, step: '2' },
  { id: 'data', label: 'Daten', icon: Database },
];

export function Editor({ onHome }: { onHome(): void }) {
  const p = useProject();
  const tab = useEditor((s) => s.tab);
  const running = useEditor((s) => !!s.runtime);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const savedAt = useEditor((s) => s.savedAt);
  const { setTab, undo, redo, startRun, stopRun, update } = useEditor.getState();
  const [dialog, setDialog] = useState<'share' | 'describe' | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'Enter') {
        e.preventDefault();
        if (useEditor.getState().runtime) stopRun();
        else startRun();
        return;
      }
      if (isTyping()) return;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.title = `${p.name} · Aquist Playground`;
  }, [p.name]);

  return (
    <div className="editor">
      <header className="topbar">
        <button className="brand" onClick={onHome} title="Zur Projektübersicht"><Logo /></button>
        <input
          className="project-name"
          value={p.name}
          onChange={(e) => update((d) => { d.name = e.target.value; }, { coalesce: 'name' })}
          spellCheck={false}
        />
        <nav className="tabs">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
              {t.step && <span className="step">{t.step}</span>}
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </nav>
        <span className="grow" />
        <button className="icon-btn" disabled={!canUndo} onClick={undo} title="Rückgängig (Strg+Z)"><Undo2 size={18} /></button>
        <button className="icon-btn" disabled={!canRedo} onClick={redo} title="Wiederholen (Strg+Y)"><Redo2 size={18} /></button>
        <span className="saved" title="Alles wird automatisch in diesem Browser gespeichert">
          {savedAt ? 'Lokal gespeichert' : 'Lokal'}
        </span>
        <button className="btn ghost" onClick={() => setDialog('describe')}><FileText size={16} /> Steckbrief</button>
        <button className="btn ghost" onClick={() => setDialog('share')}><Share2 size={16} /> Teilen</button>
        {running ? (
          <button className="btn run on" onClick={stopRun} title="Strg+Enter"><Square size={14} fill="currentColor" /> Stoppen</button>
        ) : (
          <button className="btn run" onClick={startRun} title="Strg+Enter"><Play size={16} fill="currentColor" /> Ausprobieren</button>
        )}
      </header>
      <div className="editor-body">
        <main className="editor-main">
          {tab === 'ui' && <UiBoard />}
          {tab === 'flow' && <FlowBoard />}
          {tab === 'data' && <DataView />}
        </main>
        {running && <RunDock />}
      </div>
      {dialog === 'share' && <ShareDialog onClose={() => setDialog(null)} />}
      {dialog === 'describe' && <DescribeDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
