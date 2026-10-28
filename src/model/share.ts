import { normalizeProject } from './project';
import type { ShareBundle } from './types';

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

/** Project (+ optional data) → compact string for a link: JSON, deflated, base64url. */
export async function encodeBundle(b: ShareBundle): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(b));
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeBundle(s: string): Promise<ShareBundle> {
  const raw = await pipe(fromBase64Url(s), new DecompressionStream('deflate-raw'));
  return parseBundle(new TextDecoder().decode(raw));
}

/** Accepts both a bundle ({project, data}) and a bare project. */
export function parseBundle(json: string): ShareBundle {
  const obj = JSON.parse(json);
  if (obj && obj.project) return { project: normalizeProject(obj.project), data: obj.data };
  return { project: normalizeProject(obj) };
}

export function appBase(): string {
  return location.href.split('#')[0];
}

export async function shareLink(kind: 'share' | 'play', b: ShareBundle): Promise<string> {
  return `${appBase()}#${kind}=${await encodeBundle(b)}`;
}

export function download(filename: string, content: string, mime: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function fileSafe(name: string): string {
  return name.replace(/[^\p{L}\p{N}\-_ ]+/gu, '').trim().replace(/\s+/g, '-') || 'app';
}

// The single-file build captures its own HTML at startup (main.tsx). Exporting an app then
// means: that HTML plus the project as embedded JSON, which makes it open straight in the player.
// Kept as a DOM clone, not a string: the inlined bundle itself contains "</head>" and "<title>"
// in string literals, so text search-and-replace would cut the script apart.
let selfDoc: HTMLElement | null = null;

export function captureSelf() {
  if (!import.meta.env.PROD) return;
  const doc = document.documentElement.cloneNode(true) as HTMLElement;
  doc.querySelector('#aquist-embed')?.remove();
  const root = doc.querySelector('#root');
  if (root) root.innerHTML = '';
  selfDoc = doc;
}

export function canExportStandalone(): boolean {
  return selfDoc !== null;
}

export function standaloneHtml(b: ShareBundle): string {
  if (!selfDoc) throw new Error('Nur in der gebauten Version verfügbar');
  const doc = selfDoc.cloneNode(true) as HTMLElement;
  const title = doc.querySelector('title');
  if (title) title.textContent = b.project.name;
  const embed = document.createElement('script');
  embed.id = 'aquist-embed';
  embed.type = 'application/json';
  // "<" escaped so the JSON can never close its own script tag.
  embed.textContent = JSON.stringify(b).replace(/</g, '\\u003c');
  doc.querySelector('body')!.appendChild(embed);
  return `<!doctype html>\n${doc.outerHTML}`;
}

export function readEmbedded(): ShareBundle | null {
  const el = document.getElementById('aquist-embed');
  if (!el?.textContent) return null;
  try {
    return parseBundle(el.textContent);
  } catch {
    return null;
  }
}
