import { webSearchOutputSchema } from '@cherrystudio/universal/ai/builtinTools';

import { AgentToolResultSchema, type AgentMessagePart } from '@/shared/contracts/agent';

type CitationSource = { title: string; url: string };
export function collectChatExportSources(
  parts: readonly AgentMessagePart[],
): Map<string, CitationSource> {
  const sources = new Map<string, CitationSource>();
  for (const part of parts) {
    if (part.type === 'source-url') {
      try {
        const url = new URL(part.url);
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password)
          sources.set(part.sourceId, { title: part.title ?? part.url, url: url.href });
      } catch {
        /* Invalid remote sources are not exported as links. */
      }
      continue;
    }
    if (
      part.type !== 'dynamic-tool' ||
      part.toolRef.source !== 'builtin' ||
      !['web_search', 'web_fetch'].includes(part.toolRef.capabilityId)
    )
      continue;
    const output = AgentToolResultSchema.safeParse(part.output);
    if (!output.success) continue;
    const value = output.data.value;
    const details =
      value && typeof value === 'object' && !Array.isArray(value) ? value.details : undefined;
    const results =
      details && typeof details === 'object' && !Array.isArray(details) ? details.results : value;
    const parsed = webSearchOutputSchema.safeParse(results);
    if (!parsed.success) continue;
    for (const item of parsed.data) {
      try {
        const url = new URL(item.url);
        if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password)
          sources.set(String(item.id), { title: item.title, url: url.href });
      } catch {
        /* Invalid references remain visible as their original citation markers. */
      }
    }
  }
  return sources;
}

/** Preserve code fences (including tilde/long fences), indented code and inline code verbatim. */
export function replaceChatCitations(
  source: string,
  sources: ReadonlyMap<string, CitationSource>,
): string {
  const numbers = new Map([...sources.keys()].map((id, index) => [id, index + 1]));
  let fence: { character: string; count: number } | undefined;
  let offset = 0;
  let inlineEnd = -1;
  return source
    .split(/(?<=\n)/)
    .map((line) => {
      const start = offset;
      offset += line.length;
      if (inlineEnd <= start) {
        const content = line
          .replace(/^( {0,3}>[ \t]?)+/, '')
          .replace(/^ {0,3}(?:[-+*]|\d+[.)])[ \t]+/, '');
        const delimiter = /^ {0,3}(`{3,}|~{3,})/.exec(content);
        if (fence) {
          if (
            delimiter &&
            delimiter[1][0] === fence.character &&
            delimiter[1].length >= fence.count &&
            content.slice(delimiter[0].length).trim() === ''
          )
            fence = undefined;
          return line;
        }
        if (delimiter) {
          fence = { character: delimiter[1][0], count: delimiter[1].length };
          return line;
        }
        if (/^( {4}|\t)/.test(content)) return line;
      }
      let position = Math.max(0, Math.min(line.length, inlineEnd - start));
      let result = line.slice(0, position);
      while (position < line.length) {
        if (line.charCodeAt(position) === 92) {
          result += line.slice(position, position + 2);
          position += 2;
          continue;
        }
        if (line[position] === '`') {
          const run = /^`+/.exec(line.slice(position))![0];
          const delimiters = /`+/g;
          delimiters.lastIndex = start + position + run.length;
          let closing: RegExpExecArray | null;
          while ((closing = delimiters.exec(source)) && closing[0].length !== run.length) {
            /* Only an equally long delimiter closes inline code. */
          }
          if (closing) {
            inlineEnd = closing.index + run.length;
            const end = Math.min(line.length, inlineEnd - start);
            result += line.slice(position, end);
            position = end;
            continue;
          }
          result += run;
          position += run.length;
          continue;
        }
        const marker = /^\[cite:([\w-]+)\]/.exec(line.slice(position));
        const item = marker ? sources.get(marker[1]) : undefined;
        if (marker && item) {
          result += `[${numbers.get(marker[1])}](<${item.url}>)`;
          position += marker[0].length;
        } else result += line[position++];
      }
      return result;
    })
    .join('');
}
