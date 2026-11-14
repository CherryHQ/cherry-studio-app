import { isMap, isNode, parseDocument } from 'yaml';

import { AiContentLabelSchema, type AiContentLabel } from '@/shared/data/types/aiContent';
import { GENERATED_FILE_AUTHOR } from '@/shared/data/types/file';

const MAX_METADATA_CHARACTERS = 256 * 1024;
/** Elements that may appear in a head; any other element implicitly ends it. */
const HEAD_CONTENT = new Set([
  'base',
  'link',
  'meta',
  'noscript',
  'script',
  'style',
  'template',
  'title',
]);

/** An AI generation sets the application author; an AI edit keeps an author already present. */
export type AiContentAuthor = { name: string; replace: boolean };

/** The text carrier for a media type. iOS reports Markdown from Files as `text/x-markdown`. */
export function aiContentTextType(mediaType: string): 'text/markdown' | 'text/html' | undefined {
  const type = mediaType.split(';')[0].trim().toLowerCase();
  if (type === 'text/markdown' || type === 'text/x-markdown') return 'text/markdown';
  if (type === 'text/html') return 'text/html';
  return undefined;
}

function markdownHeader(text: string) {
  const opening = /^\uFEFF?---[ \t]*\r?\n/.exec(text);
  if (!opening) return undefined;
  const tail = text.slice(opening[0].length, MAX_METADATA_CHARACTERS);
  const closing = /^(?:---|\.\.\.)[ \t]*\r?$/m.exec(tail);
  if (!closing && text.length > MAX_METADATA_CHARACTERS)
    throw new Error('Oversized Markdown metadata');
  if (!closing) return undefined;
  const document = parseDocument(tail.slice(0, closing.index), { uniqueKeys: true });
  if (document.errors.length && isMap(document.contents))
    throw new Error(
      `The Markdown front matter is not valid YAML (${document.errors[0].message.split('\n')[0]}). ` +
        'Quote values that contain ": " or " #", remove duplicate keys, or start the file with ' +
        'a non-"---" line if it has no front matter, then save again.',
    );
  if (document.errors.length || (document.contents && !isMap(document.contents))) return undefined;
  const end = opening[0].length + closing.index + closing[0].length;
  return {
    document,
    bom: text.startsWith('\uFEFF') ? '\uFEFF' : '',
    body: text.slice(end).replace(/^\r?\n/, ''),
  };
}

/** Reading hides valid AIGC and the application author; raw reads and edits keep stored text. */
export function aiContentMarkdownBody(text: string): string {
  const header = markdownHeader(text);
  if (!header?.document.has('AIGC')) return text;
  const node = header.document.get('AIGC', true);
  if (!isNode(node) || !AiContentLabelSchema.safeParse(node.toJSON()).success) return text;
  header.document.delete('AIGC');
  if (header.document.get('author') === GENERATED_FILE_AUTHOR) header.document.delete('author');
  if (!isMap(header.document.contents) || !header.document.contents.items.length)
    return header.bom + header.body;
  return header.bom + '---\n' + header.document.toString() + '---\n' + header.body;
}

function* htmlTags(chunks: Iterable<string>) {
  let state: 'text' | 'opening' | 'name' | 'tag' | 'comment' | 'raw' = 'text';
  let position = 0;
  let start = 0;
  let tag = '';
  let name = '';
  let quote = '';
  let commentTail = '';
  let rawEnd = '';
  let rawMatch = 0;
  let templateDepth = 0;
  for (const chunk of chunks) {
    for (let index = 0; index < chunk.length; index++, position++) {
      const character = chunk[index];
      if (state === 'raw') {
        if (rawMatch < rawEnd.length) {
          rawMatch =
            character.toLowerCase() === rawEnd[rawMatch] ? rawMatch + 1 : character === '<' ? 1 : 0;
        } else if (character === '>') state = 'text';
        else if (!/\s/.test(character)) rawMatch = character === '<' ? 1 : 0;
        continue;
      }
      if (state === 'comment') {
        commentTail = (commentTail + character).slice(-3);
        if (commentTail === '-->') state = 'text';
        continue;
      }
      if (state === 'text') {
        if (character === '<') {
          state = 'opening';
          start = position;
          tag = '<';
        }
        continue;
      }
      if (state === 'opening') {
        tag += character;
        if (tag === '<!--') {
          state = 'comment';
          commentTail = '';
        } else if (/^<\/?[a-z]$/i.test(tag)) state = 'name';
        else if (!['</', '<!', '<!-'].includes(tag)) {
          state = character === '<' ? 'opening' : 'text';
          start = position;
          tag = '<';
        }
        continue;
      }
      if (state === 'name') {
        if (/[a-z0-9:-]/i.test(character)) {
          tag += character;
          if (tag.length > MAX_METADATA_CHARACTERS) throw new Error('Oversized HTML tag name');
          continue;
        }
        name = tag.replace(/^<\/?/, '').toLowerCase();
        state = 'tag';
        quote = '';
      }
      // Only metadata tags retain attributes. Scripts, styles and other large content stay bounded.
      if (name === 'meta') {
        tag += character;
        if (tag.length > MAX_METADATA_CHARACTERS) throw new Error('Oversized HTML metadata');
      }
      if (quote) {
        if (character === quote) quote = '';
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character !== '>') continue;
      const closing = tag.startsWith('</');
      state = 'text';
      if (!closing && ['script', 'style', 'textarea', 'title'].includes(name)) {
        // Raw-text closing tags terminate even inside JavaScript strings or comments.
        rawEnd = '</' + name;
        rawMatch = 0;
        state = 'raw';
      } else if (name === 'template') {
        templateDepth = Math.max(0, templateDepth + (closing ? -1 : 1));
      } else if (!templateDepth) {
        yield {
          text: name === 'meta' ? tag : '<' + (closing ? '/' : '') + name + '>',
          start,
          end: position + 1,
        };
      }
    }
  }
}

function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  for (const match of tag.matchAll(pattern))
    result[match[1].toLowerCase()] = decodeAttribute(match[2] ?? match[3] ?? match[4]);
  return result;
}

function decodeAttribute(value: string): string {
  return value.replace(/&(?:quot|apos|amp|lt|gt|#\d+|#x[\da-f]+);/gi, (entity) => {
    if (entity[1] === '#') {
      const code =
        entity[2].toLowerCase() === 'x'
          ? parseInt(entity.slice(3, -1), 16)
          : parseInt(entity.slice(2, -1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    }
    return (
      (
        { '&quot;': '"', '&apos;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>' } as Record<
          string,
          string
        >
      )[entity.toLowerCase()] ?? entity
    );
  });
}

function endsHead(tag: { text: string }) {
  const name = /^<\/?([a-z0-9:-]+)/i.exec(tag.text)?.[1].toLowerCase() ?? '';
  return name === 'head' ? tag.text.startsWith('</') : !HEAD_CONTENT.has(name);
}

function htmlMetadata(text: string) {
  const tags = Array.from(htmlTags([text]));
  const head = tags.find((tag) => /^<head\b/i.test(tag.text));
  // `</head>` may be omitted; the first non-head element (usually `<body>`) then closes it.
  const end = head && tags.find((tag) => tag.start >= head.end && endsHead(tag))?.start;
  const metas =
    head && end !== undefined
      ? tags.flatMap((tag) => {
          if (tag.start < head.end || tag.end > end || !/^<meta\b/i.test(tag.text)) return [];
          const name = attributes(tag.text).name?.toLowerCase();
          return name === 'aigc' || name === 'author' ? [{ ...tag, name }] : [];
        })
      : [];
  return { tags, head, end, metas };
}

/** Inspect the complete head without retaining script/style bodies or loading the document body. */
export function readAiContentHtml(chunks: Iterable<string>): AiContentLabel | null {
  let inHead = false;
  let label: AiContentLabel | null = null;
  for (const tag of htmlTags(chunks)) {
    if (!inHead) {
      if (/^<head\b/i.test(tag.text)) inHead = true;
      else if (/^<body\b/i.test(tag.text)) return null;
      continue;
    }
    if (endsHead(tag)) return label;
    if (!/^<meta\b/i.test(tag.text)) continue;
    const values = attributes(tag.text);
    if (values.name?.toLowerCase() !== 'aigc') continue;
    if (!values.content || values.content.length > MAX_METADATA_CHARACTERS)
      throw new Error('Invalid AIGC HTML metadata');
    const next = AiContentLabelSchema.parse(JSON.parse(values.content));
    if (label && JSON.stringify(label) !== JSON.stringify(next))
      throw new Error('Conflicting AIGC HTML metadata');
    label = next;
  }
  return null;
}

/** Read the declared carrier, never labels embedded in prose, scripts, or arbitrary JSON. */
export function readAiContentText(text: string, mediaType: string): AiContentLabel | null {
  const type = aiContentTextType(mediaType);
  if (type === 'text/markdown') {
    const header = markdownHeader(text);
    const node = header?.document.get('AIGC', true);
    if (node === undefined) return null;
    if (!isNode(node)) throw new Error('Invalid AIGC Markdown metadata');
    return AiContentLabelSchema.parse(node.toJSON());
  }
  if (type === 'text/html') return readAiContentHtml([text]);
  return null;
}

/** Null removes only AIGC. AI producers may also set the file-property author. */
export function writeAiContentText(
  text: string,
  mediaType: string,
  input: AiContentLabel | null,
  author?: AiContentAuthor,
): string {
  const label = input === null ? null : AiContentLabelSchema.parse(input);
  const type = aiContentTextType(mediaType);
  if (label) readAiContentText(text, mediaType);
  if (type === 'text/markdown') {
    const header = markdownHeader(text);
    if (!label) {
      if (!header?.document.has('AIGC')) return text;
      header.document.delete('AIGC');
      return !isMap(header.document.contents) || !header.document.contents.items.length
        ? header.bom + header.body
        : header.bom + '---\n' + header.document.toString() + '---\n' + header.body;
    }
    const document = header?.document ?? parseDocument('{}');
    if (author && (author.replace || !document.has('author'))) {
      document.set('author', author.name);
      if (isMap(document.contents)) document.contents.flow = false;
    }
    document.set('AIGC', label);
    const bom = header?.bom ?? (text.startsWith('\uFEFF') ? '\uFEFF' : '');
    const body = header?.body ?? text.slice(bom.length);
    return bom + '---\n' + document.toString() + '---\n' + body;
  }
  if (type === 'text/html') {
    const attribute = (value: string) =>
      value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    const { tags, head, end, metas } = htmlMetadata(text);
    const writeAuthor =
      label !== null && author && (author.replace || !metas.some((tag) => tag.name === 'author'));
    const removed = metas.filter((tag) => tag.name === 'aigc' || writeAuthor);
    const meta = label
      ? '<meta name="AIGC" content="' +
        attribute(JSON.stringify(label)) +
        '">' +
        (writeAuthor ? '<meta name="author" content="' + attribute(author.name) + '">' : '')
      : '';
    if (!label && !removed.length) return text;
    if (head && end === undefined) throw new Error('Unclosed HTML head');
    if (head && end !== undefined) {
      let body = text.slice(head.end, end);
      for (const tag of removed.toReversed()) {
        const start = tag.start - head.end;
        body = body.slice(0, start) + body.slice(tag.end - head.end);
      }
      return text.slice(0, head.end) + meta + body + text.slice(end);
    }
    const html = tags.find((tag) => /^<html\b/i.test(tag.text));
    if (html) return text.slice(0, html.end) + '<head>' + meta + '</head>' + text.slice(html.end);
    const doctype = /^\s*<!doctype[^>]*>/i.exec(text);
    const start = doctype?.[0].length ?? 0;
    return text.slice(0, start) + '<head>' + meta + '</head>' + text.slice(start);
  }
  return text;
}
