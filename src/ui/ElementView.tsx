import { ImageIcon } from 'lucide-react';
import { selectOptions } from '../model/elements';
import type { Project, UIElement } from '../model/types';
import type { Runtime } from '../runtime/Runtime';
import { fillTemplate, getField, templatePlaceholders, toText } from '../runtime/values';

interface Props {
  el: UIElement;
  p: Project;
  /** Interactive when a runtime is given; a static picture otherwise. */
  rt?: Runtime | null;
  /** Rows for lists/tables in design mode. */
  sample?: any[];
}

function columnsOf(el: UIElement, p: Project, items: any[]): string[] {
  const explicit = String(el.props.columns ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (explicit.length) return explicit;
  const t = p.tables.find((x) => x.id === el.props.source);
  if (t) return t.fields.map((f) => f.name);
  const first = items.find((i) => i && typeof i === 'object');
  return first ? Object.keys(first).filter((k) => k !== 'id') : ['Wert'];
}

function cell(v: any): string {
  if (typeof v === 'boolean') return v ? '✓' : '○';
  return toText(v);
}

export function ElementView({ el, p, rt, sample }: Props) {
  const pr = el.props;
  const live = !!rt;
  const st = rt?.state(el.id) ?? {};
  const text = st.text ?? pr.text ?? '';
  const click = live ? () => void rt!.userClick(el.id) : undefined;
  const value = live ? rt!.readElement(el.id) : undefined;

  switch (el.type) {
    case 'heading':
      return (
        <div className="app-heading" onClick={click} style={{ fontSize: Number(pr.size) || 24, textAlign: pr.align, color: pr.color }}>
          {text}
        </div>
      );
    case 'text':
      return (
        <div className="app-text" onClick={click} style={{ fontSize: Number(pr.size) || 15, textAlign: pr.align, color: pr.color }}>
          {text}
        </div>
      );
    case 'button':
      return (
        <button className={`app-btn ${pr.variant ?? 'primary'}`} onClick={click} tabIndex={live ? 0 : -1}>
          {text}
        </button>
      );
    case 'input':
      return (
        <label className="app-field">
          {pr.label && <span>{pr.label}</span>}
          <input
            type={pr.inputType === 'number' ? 'text' : pr.inputType || 'text'}
            inputMode={pr.inputType === 'number' ? 'decimal' : undefined}
            placeholder={pr.placeholder}
            value={live ? toText(st.value ?? pr.value ?? '') : pr.value ?? ''}
            readOnly={!live}
            tabIndex={live ? 0 : -1}
            onChange={(e) => live && void rt!.userInput(el.id, e.target.value)}
          />
        </label>
      );
    case 'textarea':
      return (
        <label className="app-field grow">
          {pr.label && <span>{pr.label}</span>}
          <textarea
            placeholder={pr.placeholder}
            value={live ? toText(value) : pr.value ?? ''}
            readOnly={!live}
            tabIndex={live ? 0 : -1}
            onChange={(e) => live && void rt!.userInput(el.id, e.target.value)}
          />
        </label>
      );
    case 'checkbox':
      return (
        <label className="app-check">
          <input
            type="checkbox"
            checked={live ? !!value : !!pr.checked}
            readOnly={!live}
            tabIndex={live ? 0 : -1}
            onChange={(e) => live && void rt!.userInput(el.id, e.target.checked)}
          />
          <span>{pr.label}</span>
        </label>
      );
    case 'select': {
      const opts = selectOptions(el);
      return (
        <label className="app-field">
          {pr.label && <span>{pr.label}</span>}
          <select
            value={live ? toText(value) : pr.value || opts[0] || ''}
            disabled={!live}
            tabIndex={live ? 0 : -1}
            onChange={(e) => live && void rt!.userInput(el.id, e.target.value)}
          >
            {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </label>
      );
    }
    case 'list': {
      const items: any[] = live ? rt!.itemsOf(el) : sample ?? [];
      return (
        <div className="app-list">
          {items.length === 0 && <div className="app-empty">{pr.emptyText}</div>}
          {items.map((it, i) => (
            <div
              key={it?.id ?? i}
              className="app-list-item"
              onClick={live ? () => void rt!.userSelect(el.id, it, i) : undefined}
            >
              {fillTemplate(pr.itemTemplate, it)}
            </div>
          ))}
        </div>
      );
    }
    case 'table': {
      const items: any[] = live ? rt!.itemsOf(el) : sample ?? [];
      const cols = columnsOf(el, p, items);
      return (
        <div className="app-table">
          <table>
            <thead>
              <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={it?.id ?? i} onClick={live ? () => void rt!.userSelect(el.id, it, i) : undefined}>
                  {cols.map((c) => (
                    <td key={c}>{cell(it && typeof it === 'object' ? getField(it, c) : c === 'Wert' ? it : '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 && <div className="app-empty">{pr.emptyText}</div>}
        </div>
      );
    }
    case 'kpi':
      return (
        <div className="app-kpi" onClick={click} style={{ ['--kpi' as any]: pr.color }}>
          <div className="v">{text}</div>
          <div className="l">{pr.label}</div>
        </div>
      );
    case 'image':
      return pr.url ? (
        <img className="app-img" src={pr.url} alt={pr.label} onClick={click} draggable={false} />
      ) : (
        <div className="app-img placeholder" onClick={click}>
          <ImageIcon size={28} strokeWidth={1.5} />
          <span>{pr.label}</span>
        </div>
      );
    case 'box':
      return (
        <div
          className="app-box"
          onClick={click}
          style={{ background: pr.color, borderRadius: Number(pr.radius) || 0, border: pr.border ? '1px solid rgba(15,23,42,.12)' : 'none' }}
        />
      );
    case 'divider':
      return <div className="app-divider"><div style={{ background: pr.color }} /></div>;
    case 'note':
      return <div className="board-note" style={{ background: pr.color }}>{pr.text}</div>;
  }
  return null;
}

/** What a list or table shows on the board: real rows when bound to a table, placeholders otherwise. */
export function sampleRows(el: UIElement, rows: any[] | undefined): any[] {
  if (rows) return rows.slice(0, 30);
  const names = el.type === 'table'
    ? String(el.props.columns ?? '').split(',').map((s) => s.trim()).filter(Boolean)
    : templatePlaceholders(String(el.props.itemTemplate ?? ''));
  if (names.length) return [1, 2, 3].map((i) => Object.fromEntries(names.map((n) => [n, `${n} ${i}`])));
  return ['Eintrag 1', 'Eintrag 2', 'Eintrag 3'];
}
