import MarkdownIt from 'markdown-it';

import { replaceInlineTextRanges } from './replaceInlineTextRanges';

const parser = new MarkdownIt({ html: true, linkify: false }).disable('html_inline');
const HTTP_SCHEME = /^https?:\/\//i;
const URL_HOST = /^(?:[^/?#]*@)?(\[[\da-f:.]+\]|[\p{L}\p{M}\p{N}-]+(?:\.[\p{L}\p{M}\p{N}-]+)*)/iu;
const CJK_TEXT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const URL_TRAILING_PUNCTUATION = /[.,;:!?]/;
const URL_OPENERS = { ')': '(', ']': '[', '}': '{' } as const;

// Closing a block ends a spoken line; table cells only need a gap between them.
const LINE_ENDS = new Set([
  'paragraph_close',
  'heading_close',
  'list_item_close',
  'blockquote_close',
  'tr_close',
  'fence',
  'code_block',
  'html_block',
]);
const CELL_ENDS = new Set(['th_close', 'td_close']);

function bareUrlRanges(text: string) {
  const ranges: { start: number; end: number }[] = [];
  for (const match of text.matchAll(
    /\bhttps?:\/\/[^\s"'<>\x60\p{C}。，！？；：、（）【】《》「」『』“”‘’]+/giu,
  )) {
    const url = match[0];
    const addressStart = url.indexOf('/') + 2;
    let end = url.length;
    const hostMatch = URL_HOST.exec(url.slice(addressStart));
    if (hostMatch) {
      const host = hostMatch[1];
      const lastLabel = host.slice(host.lastIndexOf('.') + 1);
      const cjkInLabel = lastLabel.search(CJK_TEXT);
      // Keep prose glued to an ASCII top-level label, or to the tail of an ASCII URL.
      if (cjkInLabel > 0 && /^[a-z\d-]+$/i.test(lastLabel.slice(0, cjkInLabel))) {
        end = addressStart + hostMatch[0].length - lastLabel.length + cjkInLabel;
      } else if (/^[\x00-\x7f]+$/.test(host)) {
        const cjkStart = url.search(CJK_TEXT);
        if (cjkStart !== -1) end = cjkStart;
      }
    }
    const balance = { '(': 0, '[': 0, '{': 0 };
    for (const char of url.slice(0, end)) {
      if (char === '(' || char === '[' || char === '{') balance[char] += 1;
      const opener = URL_OPENERS[char as keyof typeof URL_OPENERS];
      if (opener) balance[opener] -= 1;
    }
    while (end > addressStart) {
      const char = url[end - 1];
      const opener = URL_OPENERS[char as keyof typeof URL_OPENERS];
      if (opener && balance[opener] < 0) balance[opener] += 1;
      else if (!URL_TRAILING_PUNCTUATION.test(char)) break;
      end -= 1;
    }
    if (end > addressStart) ranges.push({ start: match.index, end: match.index + end });
  }
  return ranges;
}

const BLANK_LINE = /^[ \t]*(?:>[ \t]*)*\n/gm;
const TEX_SIGNAL = /[\\^_={}+<>]/;
const BLOCK_PREFIX = /^(?: {0,3}>[ \t]?)* {0,3}$/;

function isOnlyOnLine(text: string, index: number) {
  const start = index === 0 ? 0 : text.lastIndexOf('\n', index - 1) + 1;
  const newline = text.indexOf('\n', index + 2);
  const end = newline === -1 ? text.length : newline;
  return BLOCK_PREFIX.test(text.slice(start, index)) && /^[ \t]*$/.test(text.slice(index + 2, end));
}

function findCodeSpanEnd(text: string, start: number, length: number, limit: number) {
  const backticks = /\x60+/g;
  backticks.lastIndex = start;
  for (let run = backticks.exec(text); run && run.index < limit; run = backticks.exec(text)) {
    if (run[0].length === length) return backticks.lastIndex;
  }
  return -1;
}

function omitProseFormulas(text: string) {
  const ranges: { start: number; end: number }[] = [];
  const syntax = /\x60+|\\[^\n]|\${2,}|^[ \t]*(?:>[ \t]*)*\n/gm;
  const blankLine = new RegExp(BLANK_LINE);
  let paragraphEnd = -1;
  let blockDollar: { start: number; paragraphEnd: number } | undefined;
  let inlineDollar: number | undefined;
  const inline: number[] = [];
  const brackets: { start: number; paragraphEnd: number; isBlock: boolean }[] = [];

  for (let match = syntax.exec(text); match; match = syntax.exec(text)) {
    const { index } = match;
    const delimiter = match[0];
    if (index >= paragraphEnd) {
      blankLine.lastIndex = index;
      paragraphEnd = blankLine.exec(text)?.index ?? text.length;
      inline.length = 0;
      inlineDollar = undefined;
    }
    if (delimiter.charCodeAt(0) === 96) {
      const codeEnd = findCodeSpanEnd(text, syntax.lastIndex, delimiter.length, paragraphEnd);
      if (codeEnd !== -1) syntax.lastIndex = codeEnd;
    } else if (delimiter === '$$') {
      if (isOnlyOnLine(text, index)) {
        if (blockDollar !== undefined) {
          ranges.push({ start: blockDollar.start, end: index + 2 });
          blockDollar = undefined;
          inlineDollar = undefined;
        } else if (inlineDollar !== undefined) {
          ranges.push({ start: inlineDollar, end: index + 2 });
          inlineDollar = undefined;
        } else {
          blockDollar = { start: index, paragraphEnd };
        }
      } else if (inlineDollar !== undefined) {
        ranges.push({ start: inlineDollar, end: index + 2 });
        inlineDollar = undefined;
      } else if (blockDollar !== undefined && blockDollar.paragraphEnd === paragraphEnd) {
        ranges.push({ start: blockDollar.start, end: index + 2 });
        blockDollar = undefined;
      } else {
        inlineDollar = index;
      }
    } else if (delimiter === '\\(') {
      inline.push(index);
    } else if (delimiter === '\\)') {
      const start = inline.pop();
      if (start !== undefined && text.slice(start + 2, index).trim())
        ranges.push({ start, end: index + 2 });
    } else if (delimiter === '\\[') {
      brackets.push({ start: index, paragraphEnd, isBlock: isOnlyOnLine(text, index) });
    } else if (delimiter === '\\]') {
      const open = brackets.pop();
      if (
        open &&
        ((open.isBlock && isOnlyOnLine(text, index)) ||
          (open.paragraphEnd === paragraphEnd &&
            TEX_SIGNAL.test(text.slice(open.start + 2, index))))
      ) {
        ranges.push({ start: open.start, end: index + 2 });
      }
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  let end = 0;
  return replaceInlineTextRanges(
    text,
    ranges.filter((range) => {
      if (range.start < end) return false;
      end = range.end;
      return true;
    }),
  );
}

function omitFormulas(markdown: string) {
  if (!/\$\$|\\[([]/.test(markdown)) return markdown;
  const source = markdown.replace(/\r\n?/g, '\n');
  const blocks: ReturnType<typeof parser.parse> = [];
  // Reuse Markdown's block boundaries before parsing the cleaned inline content.
  parser.block.parse(source, parser, {}, blocks);
  const lines = source.split('\n');
  const result: string[] = [];
  let start = 0;
  for (const { type, map } of blocks) {
    if (!map || (type !== 'fence' && type !== 'code_block' && type !== 'html_block')) continue;
    result.push(
      omitProseFormulas(lines.slice(start, map[0]).join('\n')),
      lines.slice(map[0], map[1]).join('\n'),
    );
    start = map[1];
  }
  if (start < lines.length) result.push(omitProseFormulas(lines.slice(start).join('\n')));
  return result.join('\n');
}

/** Read Markdown prose, leaving code blocks, images, link destinations and formulas silent. */
export function speakableText(markdown: string): string {
  const lines: string[] = [];
  let line = '';
  let omitted: { start: number; end: number }[] = [];
  const endLine = () => {
    const text = replaceInlineTextRanges(line, omitted, '}').replace(/\s+/g, ' ').trim();
    if (text) lines.push(text);
    line = '';
    omitted = [];
  };

  for (const token of parser.parse(omitFormulas(markdown), {})) {
    if (token.type === 'inline') {
      let linkDepth = 0;
      let isOmittingAutolink = false;
      for (const child of token.children ?? []) {
        if (isOmittingAutolink) {
          if (child.type === 'link_close') isOmittingAutolink = false;
          continue;
        }
        if (child.type === 'link_open') {
          const href = child.attrGet('href');
          if (
            linkDepth === 0 &&
            child.markup === 'autolink' &&
            typeof href === 'string' &&
            HTTP_SCHEME.test(href)
          ) {
            omitted.push({ start: line.length, end: line.length });
            isOmittingAutolink = true;
          } else {
            linkDepth += 1;
          }
        } else if (child.type === 'link_close') {
          linkDepth -= 1;
        } else if (child.type === 'text' || child.type === 'code_inline') {
          if (child.type === 'text' && linkDepth === 0) {
            for (const range of bareUrlRanges(child.content))
              omitted.push({ start: line.length + range.start, end: line.length + range.end });
          }
          line += child.content;
        } else if (child.type === 'softbreak' || child.type === 'hardbreak') {
          line += ' ';
        }
      }
    } else if (CELL_ENDS.has(token.type)) {
      line += ' ';
    } else if (LINE_ENDS.has(token.type)) {
      endLine();
    }
  }
  endLine();
  return lines.join('\n');
}
