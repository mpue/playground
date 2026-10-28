function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
}

/**
 * Just enough Markdown for the app description: headings, paragraphs, quotes, tables and
 * nested lists (three spaces per level, as describeProject writes them).
 */
export function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  const stack: { indent: number; tag: 'ol' | 'ul' }[] = [];
  const closeLists = (indent: number) => {
    while (stack.length && stack[stack.length - 1].indent >= indent) out.push(`</li></${stack.pop()!.tag}>`);
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const li = /^( *)(\d+\.|-) (.*)$/.exec(line);
    if (li) {
      const indent = li[1].length;
      const tag = li[2] === '-' ? 'ul' : 'ol';
      const top = stack[stack.length - 1];
      if (!top || indent > top.indent) {
        out.push(`<${tag}><li>`);
        stack.push({ indent, tag });
      } else {
        closeLists(indent + 1);
        const cur = stack[stack.length - 1];
        if (cur && cur.indent === indent && cur.tag === tag) out.push('</li><li>');
        else {
          if (cur && cur.indent === indent) out.push(`</li></${stack.pop()!.tag}>`);
          out.push(`<${tag}><li>`);
          stack.push({ indent, tag });
        }
      }
      out.push(inline(li[3]));
      i++;
      continue;
    }
    closeLists(0);
    if (/^#{1,4} /.test(line)) {
      const n = line.indexOf(' ');
      out.push(`<h${n}>${inline(line.slice(n + 1))}</h${n}>`);
    } else if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        rows.push(lines[i].split('|').slice(1, -1).map((c) => c.trim()));
        i++;
      }
      const body = rows.filter((r) => !r.every((c) => /^-+$/.test(c)));
      out.push('<table><thead><tr>' + body[0].map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
      for (const r of body.slice(1)) out.push('<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
      out.push('</tbody></table>');
      continue;
    } else if (line.startsWith('> ')) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        q.push(inline(lines[i].slice(2).replace(/ {2}$/, '')));
        i++;
      }
      out.push(`<blockquote>${q.join('<br>')}</blockquote>`);
      continue;
    } else if (line.trim()) {
      out.push(`<p>${inline(line)}</p>`);
    }
    i++;
  }
  closeLists(0);
  return out.join('\n');
}
