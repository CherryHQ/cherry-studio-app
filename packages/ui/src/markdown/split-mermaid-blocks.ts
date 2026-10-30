import MarkdownIt, { type Env } from 'markdown-it';

// Parse block boundaries only; native Markdown still owns all ordinary text rendering.
const parser = new MarkdownIt({ html: true, linkify: false });

export type MermaidMarkdownPart =
  | { kind: 'markdown'; key: string; markdown: string }
  | { kind: 'mermaid'; key: string; markdown: string; source: string };

/** Extract only complete, top-level Mermaid fences without breaking nested Markdown containers. */
export function splitMermaidBlocks(markdown: string, isStreaming: boolean): MermaidMarkdownPart[] {
  const unchanged: MermaidMarkdownPart[] = [{ kind: 'markdown', key: '0', markdown }];
  if (!/^[ \t]*(?:`{3,}|~{3,})[ \t]*mermaid\b/im.test(markdown)) return unchanged;

  const environment: Env = {};
  const tokens = parser.parse(markdown, environment);
  const lines = markdown.split(/\r\n?|\n/);
  const lineStarts = [0];
  for (const match of markdown.matchAll(/\r\n?|\n/g)) {
    lineStarts.push(match.index + match[0].length);
  }

  const parts: MermaidMarkdownPart[] = [];
  let copiedUntil = 0;
  for (const token of tokens) {
    if (
      token.type !== 'fence' ||
      token.level !== 0 ||
      token.info.trim().split(/\s+/, 1)[0].toLowerCase() !== 'mermaid' ||
      !token.map
    ) {
      continue;
    }
    const [firstLine, endLine] = token.map;
    const closingLine = lines[endLine - 1];
    const closingFence = new RegExp(`^ {0,3}${token.markup[0]}{${token.markup.length},}[\\t ]*$`);
    const end = lineStarts[endLine] ?? markdown.length;
    if (
      endLine - firstLine < 2 ||
      !closingFence.test(closingLine) ||
      // A closing marker at the streaming tail can still become an ordinary code line.
      (isStreaming && end === markdown.length && !/[\r\n]$/.test(markdown))
    ) {
      continue;
    }
    const start = lineStarts[firstLine];
    if (start > copiedUntil) {
      parts.push({
        kind: 'markdown',
        key: String(copiedUntil),
        markdown: markdown.slice(copiedUntil, start),
      });
    }
    parts.push({
      kind: 'mermaid',
      key: String(start),
      markdown: markdown.slice(start, end),
      source: token.content,
    });
    copiedUntil = end;
  }
  if (!parts.length) return unchanged;
  if (copiedUntil < markdown.length) {
    parts.push({
      kind: 'markdown',
      key: String(copiedUntil),
      markdown: markdown.slice(copiedUntil),
    });
  }

  // References may be defined on the other side of a diagram. Prepend definitions so an
  // unfinished trailing code block cannot swallow them; the source itself remains unchanged.
  const references = Object.entries(environment.references ?? {})
    .map(([label, { href, title }]) => {
      const id = label.replace(/[\\[\]]/g, '\\$&');
      const url = href.replace(/</g, '%3C').replace(/>/g, '%3E');
      const caption = title
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/[\r\n]/g, ' ');
      return `[${id}]: <${url}> "${caption}"`;
    })
    .join('\n');
  return parts
    .filter((part) => part.kind === 'mermaid' || part.markdown.trim())
    .map((part) =>
      part.kind === 'markdown' && references
        ? { ...part, markdown: `${references}\n\n${part.markdown}` }
        : part,
    );
}
