import {
  AlignLeft, Gauge, Heading1, Image, List, Minus, MousePointerClick, Square, SquareCheck,
  SquareChevronDown, StickyNote, Table, TextCursorInput, Type, X, type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import type { ElementType } from '../model/types';

export const ELEMENT_ICONS: Record<ElementType, LucideIcon> = {
  heading: Heading1,
  text: Type,
  button: MousePointerClick,
  input: TextCursorInput,
  textarea: AlignLeft,
  checkbox: SquareCheck,
  select: SquareChevronDown,
  list: List,
  table: Table,
  kpi: Gauge,
  image: Image,
  box: Square,
  divider: Minus,
  note: StickyNote,
};

export function isTyping(): boolean {
  const a = document.activeElement as HTMLElement | null;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

/** A text input that keeps its own draft so the caret does not jump while the store updates. */
export function TextField(props: {
  value: string;
  onChange(v: string): void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  className?: string;
  autoFocus?: boolean;
  type?: string;
}) {
  const [draft, setDraft] = useState(props.value);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(props.value);
  }, [props.value, focused]);
  const common = {
    value: focused ? draft : props.value,
    placeholder: props.placeholder,
    className: props.className,
    autoFocus: props.autoFocus,
    onFocus: () => {
      setDraft(props.value);
      setFocused(true);
    },
    onBlur: () => setFocused(false),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(e.target.value);
      props.onChange(e.target.value);
    },
  };
  return props.multiline ? <textarea rows={props.rows ?? 3} {...common} /> : <input type={props.type ?? 'text'} {...common} />;
}

export function NumberField({ value, onChange, step }: { value: number; onChange(v: number): void; step?: number }) {
  return (
    <TextField
      value={String(value ?? 0)}
      onChange={(v) => {
        const n = Number(v.replace(',', '.'));
        if (Number.isFinite(n)) onChange(n);
      }}
      type={step ? 'number' : 'text'}
    />
  );
}

export function Modal(props: { title: string; onClose(): void; children: ReactNode; wide?: boolean; footer?: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [props.onClose]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`modal ${props.wide ? 'wide' : ''}`} role="dialog" aria-label={props.title}>
        <div className="modal-head">
          <h2>{props.title}</h2>
          <button className="icon-btn" onClick={props.onClose} title="Schließen"><X size={18} /></button>
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>
  );
}

let toastSeq = 0;
type ToastFn = (text: string) => void;
let pushToast: ToastFn = () => {};

/** Small editor notifications ("Link kopiert"). */
export function notify(text: string) {
  pushToast(text);
}

export function EditorToasts() {
  const [items, setItems] = useState<{ id: number; text: string }[]>([]);
  useEffect(() => {
    pushToast = (text) => {
      const id = ++toastSeq;
      setItems((l) => [...l, { id, text }]);
      setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 2600);
    };
    return () => {
      pushToast = () => {};
    };
  }, []);
  return (
    <div className="editor-toasts">
      {items.map((t) => <div key={t.id} className="editor-toast">{t.text}</div>)}
    </div>
  );
}

export function snap(v: number, grid = 4): number {
  return Math.round(v / grid) * grid;
}
