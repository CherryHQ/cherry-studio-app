import { isMap, isNode, parseDocument } from 'yaml';

import { AiContentLabelSchema, type AiContentLabel } from '@/shared/data/types/aiContent';

const MAX_METADATA_CHARACTERS = 256 * 1024;

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
    throw new Error('Conflicting or invalid Markdown metadata');
  if (document.errors.length || (document.contents && !isMap(document.contents))) return undefined;
  const end = opening[0].length + closing.index + closing[0].length;
  return {
    document,
    bom: text.startsWith('\uFEFF') ? '\uFEFF' : '',
    body: text.slice(end).replace(/^\r?\n/, ''),
  };
}

/** Only the reading projection omits AIGC; raw reads and exact edits keep stored coordinates. */
export function aiContentMarkdownBody(text: string): string {
  const header = markdownHeader(text);
  if (!header?.document.has('AIGC')) return text;
  const node = header.document.get('AIGC', true);
  if (!isNode(node) || !AiContentLabelSchema.safeParse(node.toJSON()).success) return text;
  header.document.delete('AIGC');
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

function htmlMetadata(text: string) {
  const tags = Array.from(htmlTags([text]));
  const head = tags.find((tag) => /^<head\b/i.test(tag.text));
  const end = head && tags.find((tag) => tag.start >= head.end && /^<\/head\b/i.test(tag.text));
  const metadata =
    head && end
      ? tags.filter(
          (tag) =>
            tag.start >= head.end &&
            tag.end <= end.start &&
            /^<meta\b/i.test(tag.text) &&
            attributes(tag.text).name?.toLowerCase() === 'aigc',
        )
      : [];
  return { tags, head, end, metadata };
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
    if (/^<\/head\b/i.test(tag.text)) return label;
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
  if (mediaType === 'text/markdown') {
    const header = markdownHeader(text);
    const node = header?.document.get('AIGC', true);
    if (node === undefined) return null;
    if (!isNode(node)) throw new Error('Invalid AIGC Markdown metadata');
    return AiContentLabelSchema.parse(node.toJSON());
  }
  if (mediaType === 'text/html') return readAiContentHtml([text]);
  return null;
}

/** Null removes the AIGC declaration while preserving other metadata and content. */
export function writeAiContentText(
  text: string,
  mediaType: string,
  input: AiContentLabel | null,
): string {
  const label = input === null ? null : AiContentLabelSchema.parse(input);
  if (label) readAiContentText(text, mediaType);
  if (mediaType === 'text/markdown') {
    const header = markdownHeader(text);
    if (!label) {
      if (!header?.document.has('AIGC')) return text;
      header.document.delete('AIGC');
      return !isMap(header.document.contents) || !header.document.contents.items.length
        ? header.bom + header.body
        : header.bom + '---\n' + header.document.toString() + '---\n' + header.body;
    }
    const document = header?.document ?? parseDocument('{}');
    document.set('AIGC', label);
    const bom = header?.bom ?? (text.startsWith('\uFEFF') ? '\uFEFF' : '');
    const body = header?.body ?? text.slice(bom.length);
    return bom + '---\n' + document.toString() + '---\n' + body;
  }
  if (mediaType === 'text/html') {
    const value = JSON.stringify(label)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const meta = label ? '<meta name="AIGC" content="' + value + '">' : '';
    const { tags, head, end, metadata } = htmlMetadata(text);
    if (!label && !metadata.length) return text;
    if (head && !end) throw new Error('Unclosed HTML head');
    if (head && end) {
      let body = text.slice(head.end, end.start);
      for (const tag of metadata.toReversed()) {
        const start = tag.start - head.end;
        body = body.slice(0, start) + body.slice(tag.end - head.end);
      }
      return text.slice(0, head.end) + meta + body + text.slice(end.start);
    }
    const html = tags.find((tag) => /^<html\b/i.test(tag.text));
    if (html) return text.slice(0, html.end) + '<head>' + meta + '</head>' + text.slice(html.end);
    const doctype = /^\s*<!doctype[^>]*>/i.exec(text);
    const start = doctype?.[0].length ?? 0;
    return text.slice(0, start) + '<head>' + meta + '</head>' + text.slice(start);
  }
  return text;
}
