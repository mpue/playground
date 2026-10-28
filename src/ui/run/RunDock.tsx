import { Eraser, Maximize2, Minimize2, RotateCcw, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useEditor } from '../store';
import { AppView, useRuntime } from './AppView';
import type { Runtime } from '../../runtime/Runtime';
import { toText } from '../../runtime/values';

/** The preview next to the editor: the app on the left of the console, live while you keep editing. */
export function RunDock() {
  const rt = useEditor((s) => s.runtime)!;
  useRuntime(rt);
  const { stopRun, startRun, revealNode } = useEditor.getState();
  const [tab, setTab] = useState<'log' | 'vars'>('log');
  const [full, setFull] = useState(false);
  const [width, setWidth] = useState(() => Number(localStorage.getItem('aquist.dockWidth')) || 440);
  const logRef = useRef<HTMLDivElement>(null);
  const p = rt.project;

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [rt.logs.length]);

  const startResize = (e: React.PointerEvent) => {
    const x0 = e.clientX;
    const w0 = width;
    const move = (ev: PointerEvent) => setWidth(Math.max(320, Math.min(window.innerWidth - 400, w0 - (ev.clientX - x0))));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setWidth((w) => {
        localStorage.setItem('aquist.dockWidth', String(w));
        return w;
      });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const errors = rt.logs.filter((l) => l.kind === 'error').length;

  return (
    <div className={`run-dock ${full ? 'full' : ''}`} style={full ? undefined : { width }}>
      {!full && <div className="dock-grip" onPointerDown={startResize} />}
      <div className="dock-head">
        <span className="live-dot" /> <b>Läuft</b>
        <select
          value={rt.screenId ?? ''}
          title="Zu einem Screen springen"
          onChange={(e) => void rt.navigate(e.target.value).catch(() => {})}
        >
          {p.screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="grow" />
        <button className="icon-btn" title="Neu starten" onClick={startRun}><RotateCcw size={16} /></button>
        <button className="icon-btn" title={full ? 'Verkleinern' : 'Vollbild'} onClick={() => setFull(!full)}>
          {full ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
        <button className="icon-btn stop" title="Beenden" onClick={stopRun}><Square size={14} fill="currentColor" /></button>
      </div>
      <AppView rt={rt} />
      <div className="dock-console">
        <div className="console-tabs">
          <button className={tab === 'log' ? 'on' : ''} onClick={() => setTab('log')}>
            Protokoll {errors > 0 && <span className="badge err">{errors}</span>}
          </button>
          <button className={tab === 'vars' ? 'on' : ''} onClick={() => setTab('vars')}>Variablen</button>
          <span className="grow" />
          {tab === 'log' && <button className="icon-btn" title="Protokoll leeren" onClick={() => rt.clearLog()}><Eraser size={14} /></button>}
        </div>
        {tab === 'log' ? (
          <div className="console-log" ref={logRef}>
            {rt.logs.map((l) => (
              <div
                key={l.id}
                className={`log ${l.kind} ${l.nodeId ? 'link' : ''}`}
                onClick={() => l.nodeId && revealNode(l.nodeId)}
                title={l.nodeId ? 'Im Workflow zeigen' : undefined}
              >
                <time>{new Date(l.t).toLocaleTimeString('de-DE')}</time>
                <span>{l.kind === 'event' ? '▶ ' : l.kind === 'error' ? '✖ ' : ''}{l.text}</span>
              </div>
            ))}
          </div>
        ) : (
          <VarsView rt={rt} />
        )}
      </div>
    </div>
  );
}

function VarsView({ rt }: { rt: Runtime }) {
  const p = rt.project;
  if (!p.variables.length) return <div className="console-log"><div className="log info">Keine Variablen angelegt.</div></div>;
  return (
    <div className="console-log">
      {p.variables.map((v) => {
        const val = v.id in rt.vars ? rt.vars[v.id] : v.initial;
        return (
          <div key={v.id} className="log var">
            <span className="vname">{v.name}</span>
            <span>{typeof val === 'object' && val !== null ? JSON.stringify(val) : toText(val) || '„“'}</span>
          </div>
        );
      })}
    </div>
  );
}
