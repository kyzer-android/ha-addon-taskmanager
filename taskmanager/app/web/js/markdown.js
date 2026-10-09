// Petit rendu Markdown → DOM (sans innerHTML) : titres, listes, tableaux, code, citations, liens.
import { h } from './dom.js';

const slugify = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Texte en ligne : `code`, **gras**, *italique*, [lien](url)
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/g;

export const inline = (text) => {
  const nodes = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (match[1]) nodes.push(h('code', { class: 'md-code' }, token.slice(1, -1)));
    else if (match[2]) nodes.push(h('strong', {}, inline(token.slice(2, -2))));
    else if (match[3]) nodes.push(h('em', {}, inline(token.slice(1, -1))));
    else {
      const [, label, url] = /\[([^\]]+)\]\(([^)\s]+)\)/.exec(token);
      nodes.push(/^https?:\/\//.test(url)
        ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, label)
        : label);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
};

const splitRow = (line) => line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
const isTableSep = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const listMatch = (line) => /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);

const copyButton = (getText) => h('button', {
  class: 'btn btn-secondary btn-small md-copy',
  onclick: async (event) => {
    const button = event.currentTarget;
    try {
      await navigator.clipboard.writeText(getText());
      button.textContent = 'Copié ✓';
    } catch (error) {
      button.textContent = 'Copie impossible';
    }
    setTimeout(() => { button.textContent = 'Copier'; }, 1800);
  },
}, 'Copier');

/** Retourne { nodes, toc } : les éléments DOM du document et la liste des titres (niveaux 2 et 3). */
export const renderMarkdown = (source) => {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const nodes = [];
  const toc = [];
  const used = new Set();
  let i = 0;

  const uniqueId = (text) => {
    let id = slugify(text) || 'section';
    let n = 2;
    while (used.has(id)) id = `${slugify(text)}-${n++}`;
    used.add(id);
    return id;
  };

  const parseList = (startIndent, ordered) => {
    const list = h(ordered ? 'ol' : 'ul', { class: 'md-list' });
    while (i < lines.length) {
      const m = listMatch(lines[i]);
      if (!m) break;
      const indent = m[1].length;
      if (indent < startIndent) break;
      if (indent > startIndent) {
        const nested = parseList(indent, /\d/.test(m[2]));
        (list.lastElementChild || list).append(nested);
        continue;
      }
      const item = h('li', {}, inline(m[3]));
      list.append(item);
      i += 1;
    }
    return list;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }

    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const code = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) { code.push(lines[i]); i += 1; }
      i += 1;
      const text = code.join('\n');
      nodes.push(h('div', { class: 'md-pre' },
        h('div', { class: 'md-pre-bar' }, h('span', {}, fence[1] || 'texte'), copyButton(() => text)),
        h('pre', {}, h('code', {}, text))));
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = uniqueId(text);
      if (level === 2 || level === 3) toc.push({ id, text, level });
      nodes.push(h(`h${Math.min(level + 1, 5)}`, { id, class: `md-h md-h${level}` }, inline(text)));
      i += 1;
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) { nodes.push(h('hr', { class: 'md-hr' })); i += 1; continue; }

    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const head = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(splitRow(lines[i])); i += 1; }
      nodes.push(h('div', { class: 'md-table-wrap' }, h('table', { class: 'md-table' },
        h('thead', {}, h('tr', {}, head.map((cell) => h('th', {}, inline(cell))))),
        h('tbody', {}, rows.map((row) => h('tr', {}, row.map((cell) => h('td', {}, inline(cell)))))))));
      continue;
    }

    if (line.startsWith('>')) {
      const quote = [];
      while (i < lines.length && lines[i].startsWith('>')) { quote.push(lines[i].replace(/^>\s?/, '')); i += 1; }
      nodes.push(h('blockquote', { class: 'md-quote' }, quote.map((q) => h('p', {}, inline(q)))));
      continue;
    }

    const list = listMatch(line);
    if (list) {
      nodes.push(parseList(list[1].length, /\d/.test(list[2])));
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|>|\s*(---+)\s*$)/.test(lines[i])
      && !listMatch(lines[i]) && !(lines[i].trim().startsWith('|') && isTableSep(lines[i + 1] || ''))) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    nodes.push(h('p', { class: 'md-p' }, inline(paragraph.join(' '))));
  }
  return { nodes, toc };
};
