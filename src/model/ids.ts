export function uid(prefix = ''): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += Math.floor(Math.random() * 36).toString(36);
  return prefix ? `${prefix}_${s}` : s;
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
