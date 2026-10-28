import { Copy, Download, FileCode2, FileText, Link, Lock, Play, Printer } from 'lucide-react';
import { useMemo, useState } from 'react';
import { describeProject } from '../../model/describe';
import { markdownToHtml } from '../../model/markdown';
import { canExportStandalone, download, fileSafe, shareLink, standaloneHtml } from '../../model/share';
import type { ShareBundle } from '../../model/types';
import { projectDb } from '../../runtime/database';
import { Modal, notify } from '../common';
import { useProject } from '../store';

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // navigator.clipboard exists only on https or localhost. Opened over plain http from
    // another machine (the Docker container on the LAN), the old copy command still works.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      ta.remove();
    }
  }
}

export function ShareDialog({ onClose }: { onClose(): void }) {
  const p = useProject();
  const db = projectDb(p.id);
  const records = db.count();
  const [withData, setWithData] = useState(false);
  const [link, setLink] = useState<{ kind: 'share' | 'play'; url: string } | null>(null);
  const bundle = (): ShareBundle => (withData ? { project: p, data: db.snapshot() } : { project: p });

  const makeLink = async (kind: 'share' | 'play') => {
    const url = await shareLink(kind, bundle());
    setLink({ kind, url });
    notify((await copyText(url)) ? 'Link kopiert' : 'Link erzeugt – bitte unten kopieren');
  };

  return (
    <Modal title="Teilen & Exportieren" onClose={onClose}>
      <label className={`data-opt ${withData ? 'on' : ''}`}>
        <input type="checkbox" checked={withData} onChange={(e) => {
          setWithData(e.target.checked);
          setLink(null);
        }} />
        <span>
          <b>Datenbank-Inhalte mitgeben</b> ({records} Datensatz/-sätze)
          <small>
            <Lock size={12} /> Ohne Haken teilst du nur Oberfläche, Workflow und den Aufbau der Tabellen.
            Die Datensätze bleiben in deinem Browser.
          </small>
        </span>
      </label>

      <h4 className="dlg-sec">Als Link</h4>
      <div className="btn-row wrap">
        <button className="btn" onClick={() => void makeLink('share')}><Link size={16} /> Link zum Bearbeiten</button>
        <button className="btn" onClick={() => void makeLink('play')}><Play size={16} /> Link zum Ausprobieren</button>
      </div>
      <p className="field-hint">
        Das ganze Projekt steckt im Link selbst – kein Server nötig. Der Empfänger bekommt eine eigene Kopie.
        {location.protocol === 'file:' && ' Achtung: Der Playground ist als Datei geöffnet – Links funktionieren nur, wenn der Empfänger die Datei am selben Ort hat. Nimm dann besser die Projektdatei.'}
      </p>
      {link && (
        <div className="link-box">
          <textarea readOnly value={link.url} rows={3} onFocus={(e) => e.currentTarget.select()} />
          <div className="link-meta">
            <span>{link.kind === 'share' ? 'Öffnet das Projekt zum Bearbeiten' : 'Öffnet direkt die laufende App'} · {(link.url.length / 1024).toFixed(1)} KB</span>
            <button className="btn small" onClick={async () => notify((await copyText(link.url)) ? 'Link kopiert' : 'Kopieren nicht erlaubt – bitte markieren und Strg+C')}>
              <Copy size={14} /> Kopieren
            </button>
          </div>
        </div>
      )}

      <h4 className="dlg-sec">Als Datei</h4>
      <div className="btn-row wrap">
        <button className="btn" onClick={() => download(`${fileSafe(p.name)}.aquist.json`, JSON.stringify(bundle(), null, 2), 'application/json')}>
          <Download size={16} /> Projektdatei (.aquist.json)
        </button>
        <button
          className="btn"
          disabled={!canExportStandalone()}
          title={canExportStandalone() ? '' : 'Nur in der gebauten Version (npm run build) verfügbar'}
          onClick={() => download(`${fileSafe(p.name)}.html`, standaloneHtml(bundle()), 'text/html')}
        >
          <FileCode2 size={16} /> Lauffähige App (.html)
        </button>
      </div>
      <p className="field-hint">
        Die Projektdatei lässt sich auf der Startseite wieder öffnen. Die HTML-Datei ist die fertige App zum Weitergeben – ein Doppelklick startet sie im Browser.
        {!canExportStandalone() && ' (Im Entwicklungsmodus nicht verfügbar.)'}
      </p>
    </Modal>
  );
}

export function DescribeDialog({ onClose }: { onClose(): void }) {
  const p = useProject();
  const md = useMemo(() => describeProject(p), [p]);
  const html = useMemo(() => markdownToHtml(md), [md]);
  const print = () => {
    const w = window.open('', '_blank');
    if (!w) return notify('Pop-up wurde blockiert');
    w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${p.name.replace(/</g, '')}</title>
      <style>body{font:14px/1.55 system-ui,sans-serif;max-width:780px;margin:32px auto;color:#0f172a;padding:0 16px}
      h1{color:#0e7490}h2{border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin-top:28px}
      table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #cbd5e1;padding:4px 10px;text-align:left}
      blockquote{background:#fef9c3;margin:8px 0;padding:8px 12px;border-radius:6px}li{margin:2px 0}</style></head>
      <body>${html}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };
  return (
    <Modal
      title="Steckbrief der App"
      onClose={onClose}
      wide
      footer={(
        <div className="btn-row">
          <button className="btn" onClick={async () => notify((await copyText(md)) ? 'Als Markdown kopiert' : 'Kopieren nicht erlaubt')}>
            <Copy size={16} /> Kopieren
          </button>
          <button className="btn" onClick={() => download(`${fileSafe(p.name)}.md`, md, 'text/markdown')}>
            <FileText size={16} /> Als Markdown speichern
          </button>
          <button className="btn primary" onClick={print}><Printer size={16} /> Drucken / PDF</button>
        </div>
      )}
    >
      <p className="field-hint">
        Die Beschreibung wird aus Oberfläche, Daten und Workflow erzeugt – gut für Abstimmungen, Tickets oder als Vorlage für die Entwicklung.
      </p>
      <article className="md" dangerouslySetInnerHTML={{ __html: html }} />
    </Modal>
  );
}
