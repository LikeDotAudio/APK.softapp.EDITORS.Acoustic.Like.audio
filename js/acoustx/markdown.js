// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

/**
 * THE HELP FILE'S MARKDOWN
 *
 * Just enough Markdown for Documentation/ — the kind those chapters use:
 * headings, paragraphs, bullet and numbered lists, pipe tables, `code`,
 * **bold**, *italic*, [links](…), and TeX math, $inline$ and $$display$$.
 * Math is left as <span class="math" data-tex> / <div class="math display">
 * holding the TeX source, for KaTeX to typeset when it is to hand and to
 * read as TeX when it is not. Everything else is escaped, so a chapter can
 * never inject markup. Pure: string in, HTML string out.
 */

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A heading's anchor, the way GitHub makes one: lower case, punctuation gone, spaces to dashes. */
export function slug(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s/g, '-');
}

/** Inline spans: math and code first (their insides are literal), then links, bold, italic. */
function inline(text) {
  const keep = [];
  const stash = (html) => `\u0000${keep.push(html) - 1}\u0000`;
  let s = text
    .replace(/\$\$([^$]+)\$\$/g, (_, tex) => stash(`<span class="math" data-tex="${esc(tex)}">${esc(tex)}</span>`))
    .replace(/\$([^$\n]+?)\$/g, (_, tex) => stash(`<span class="math" data-tex="${esc(tex)}">${esc(tex)}</span>`))
    .replace(/`([^`]+)`/g, (_, code) => stash(`<code>${esc(code)}</code>`));
  s = esc(s)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => `<a href="${href}" data-href="${href}">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<i>$2</i>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => keep[+i]);
}

const cells = (line) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    // a \| inside a cell (TeX's \lvert written as \|) is not a column break
    .split(/(?<!\\)\|/)
    .map((c) => c.trim());

export function renderMarkdown(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  const isTableRule = (l) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // display math: $$ on its own line(s), or $$ … $$ on one line
    if (line.trim().startsWith('$$')) {
      let tex = line.trim().slice(2);
      if (tex.endsWith('$$') && tex.length >= 2) tex = tex.slice(0, -2);
      else {
        i++;
        while (i < lines.length && !lines[i].trim().endsWith('$$')) tex += `\n${lines[i++]}`;
        if (i < lines.length) tex += `\n${lines[i].trim().slice(0, -2)}`;
      }
      out.push(`<div class="math display" data-tex="${esc(tex.trim())}">${esc(tex.trim())}</div>`);
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const n = h[1].length;
      out.push(`<h${n} id="${slug(h[2])}">${inline(h[2])}</h${n}>`);
      i++;
      continue;
    }
    if (line.trim().startsWith('```')) {
      const code = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      i++;
      continue;
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableRule(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(cells(lines[i++]));
      out.push(`<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/;
    if (li.test(line)) {
      const ordered = /\d+\./.test(li.exec(line)[2]);
      const items = [];
      while (i < lines.length && (li.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        const m = li.exec(lines[i]);
        if (m && m[1].length < 2) items.push(m[3]);
        else items[items.length - 1] += ` ${lines[i].trim().replace(/^([-*]|\d+\.)\s+/, '— ')}`;
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);
      continue;
    }
    const para = [line.trim()];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*([-*]|\d+\.)\s|\s*\||\s*\$\$|```)/.test(lines[i])) para.push(lines[i++].trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}
