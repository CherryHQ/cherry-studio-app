import { createCodeBlockMarkdown } from '@cherrystudio/ui/markdown';
import MarkdownIt from 'markdown-it';

import type {
  ExportBlock,
  ExportDocument,
  ExportPresentation,
} from '@/shared/contracts/documentExport';
import { stripMarkdownFormatting } from '@/shared/utils/markdownFormatting';

/** Select before resolving images or typesetting. Complete formats keep the original snapshot. */
export function prepareImageCard(
  document: ExportDocument,
  presentation: Pick<ExportPresentation, 'width' | 'typography'>,
) {
  const budget = document.sections.length > 1 ? 3400 : 1500;
  const parser = new MarkdownIt({ html: false, breaks: true, maxNesting: 20 });
  const { base, sm, lg, xl } = presentation.typography;
  const width = presentation.width - 48;
  let remaining = budget - 48;
  let isExcerpt = false;
  const sections: ExportDocument['sections'][number][] = [];

  const textHeight = (text: string, fontSize = base.fontSize, lineHeight = base.lineHeight + 2) => {
    let lines = 1;
    let used = 0;
    for (const character of text) {
      const advance =
        character === '\t' ? fontSize * 2 : fontSize * (/^[\x20-\x7e]$/.test(character) ? 0.62 : 1);
      if (character === '\n') {
        lines++;
        used = 0;
      } else {
        if (used + advance > width) {
          lines++;
          used = 0;
        }
        used += advance;
      }
    }
    return lines * lineHeight;
  };
  const markdownHeight = (source: string) => {
    let height = 0;
    for (const token of parser.parse(source, {})) {
      if (token.type === 'inline') {
        height += textHeight(token.content) + 12;
        height += (token.children?.filter((child) => child.type === 'image').length ?? 0) * 320;
      } else if (token.type === 'fence' || token.type === 'code_block') {
        height += textHeight(token.content, sm.fontSize, sm.lineHeight) + 64;
      } else if (token.type === 'heading_open') {
        height += token.tag === 'h1' ? xl.lineHeight : lg.lineHeight;
      } else if (token.type === 'tr_open' || token.type === 'list_item_open') height += 16;
      else if (token.type === 'hr') height += 24;
    }
    return Math.ceil(height * 1.1);
  };
  const takeText = (text: string, fontSize = base.fontSize, lineHeight = base.lineHeight + 2) => {
    // Binary search only the final visible paragraph/code block, never the whole document.
    let low = 0;
    let high = text.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (textHeight(text.slice(0, middle) + '…', fontSize, lineHeight) + 12 <= remaining)
        low = middle;
      else high = middle - 1;
    }
    const end = /[\uD800-\uDBFF]$/.test(text.slice(0, low)) ? low - 1 : low;
    remaining = 0;
    isExcerpt = true;
    return text.slice(0, end).trimEnd() + '…';
  };
  const takeMarkdown = (source: string): ExportBlock[] => {
    const lines = source.split('\n');
    const blocks: ExportBlock[] = [];
    const environment: { references?: Record<string, { href: string; title: string }> } = {};
    const tokens = parser.parse(source, environment);
    let retainedEnd = 0;
    for (const token of tokens) {
      if (token.level !== 0 || !token.map || token.nesting === -1) continue;
      const chunk = lines.slice(token.map[0], token.map[1]).join('\n');
      const cost = markdownHeight(chunk);
      if (cost <= remaining) {
        retainedEnd = token.map[1];
        remaining -= cost;
        continue;
      }
      isExcerpt = true;
      if (remaining < base.lineHeight * 2) break;
      if (token.type === 'fence' || token.type === 'code_block') {
        remaining = Math.max(0, remaining - 64);
        const text = takeText(token.content, sm.fontSize, sm.lineHeight);
        blocks.push({
          kind: 'markdown',
          source: createCodeBlockMarkdown(text, token.info.trim().split(/\s+/)[0]),
        });
      } else if (
        token.type === 'bullet_list_open' ||
        token.type === 'ordered_list_open' ||
        token.type === 'table_open'
      ) {
        // Keep whole items/rows, including the table header and complete nested code fences.
        let end = 0;
        for (const child of parser.parse(chunk, {})) {
          if (
            !child.map ||
            !((child.type === 'list_item_open' && child.level === 1) || child.type === 'tr_open')
          )
            continue;
          const candidate = chunk.split('\n').slice(0, child.map[1]).join('\n');
          if (markdownHeight(candidate) > remaining) break;
          end = child.map[1];
        }
        if (end) retainedEnd = token.map[0] + end;
        else blocks.push({ kind: 'text', text: takeText(stripMarkdownFormatting(chunk)) });
      } else {
        const text = stripMarkdownFormatting(chunk);
        if (text) blocks.push({ kind: 'text', text: takeText(text) });
      }
      break;
    }
    if (!isExcerpt) return [{ kind: 'markdown', source }];
    if (retainedEnd) {
      // Reference definitions can follow the omitted tail; retain their original destinations.
      const references = Object.entries(environment.references ?? {})
        .map(
          ([name, reference]) =>
            `[${name.replace(/[[\]\\]/g, '\\$&')}]: <${reference.href}>${reference.title ? ` "${reference.title.replace(/["\\]/g, '\\$&')}"` : ''}`,
        )
        .join('\n');
      blocks.unshift({
        kind: 'markdown',
        source: lines.slice(0, retainedEnd).join('\n') + (references ? '\n\n' + references : ''),
      });
    }
    return blocks;
  };
  const takeBlocks = (input: readonly ExportBlock[]): ExportBlock[] => {
    const blocks: ExportBlock[] = [];
    for (const block of input) {
      if (isExcerpt) break;
      if (block.kind === 'markdown') blocks.push(...takeMarkdown(block.source));
      else if (block.kind === 'text') {
        const cost = textHeight(block.text) + 16;
        if (cost <= remaining) {
          blocks.push(block);
          remaining -= cost;
        } else if (remaining >= base.lineHeight * 2)
          blocks.push({ kind: 'text', text: takeText(block.text) });
        else isExcerpt = true;
      } else if (block.kind === 'details') {
        remaining -= 56;
        blocks.push({ ...block, blocks: takeBlocks(block.blocks) });
      } else {
        const cost = block.kind === 'image' ? 336 : 96;
        if (cost > remaining) isExcerpt = true;
        else {
          blocks.push(block);
          remaining -= cost;
        }
      }
    }
    return blocks;
  };
  for (const section of document.sections) {
    if (isExcerpt) break;
    const overhead = 32 + (section.heading ? 34 : 0) + (section.metadata?.length ?? 0) * 32;
    if (remaining < overhead + base.lineHeight * 2) {
      isExcerpt = true;
      break;
    }
    remaining -= overhead;
    sections.push({ ...section, blocks: takeBlocks(section.blocks) });
  }
  return { document: { ...document, sections }, isExcerpt, maxHeight: Math.ceil(budget * 1.1) };
}
