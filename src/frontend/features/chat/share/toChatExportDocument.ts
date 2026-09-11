import { webSearchOutputSchema } from '@cherrystudio/universal/ai/builtinTools';

import {
  AgentToolResultSchema,
  type AgentMessagePart,
  type AgentMessageView,
} from '@/shared/contracts/agent';
import type { ExportBlock, ExportDocument } from '@/shared/contracts/documentExport';
import { FileEntryIdSchema } from '@/shared/data/types/file';

export type ChatExportOptions = {
  title: string;
  includeProcess: boolean;
  includeTimestamps: boolean;
  labels: {
    user: string;
    assistant: string;
    process: string;
    reasoning: string;
    timestamp: string;
    file: string;
    status: string;
    messageStatuses: Record<AgentMessageView['status'], string>;
  };
};

export function isChatMessageExportable(message: AgentMessageView) {
  return (
    message.role !== 'system' && message.status !== 'pending' && message.status !== 'streaming'
  );
}

export function toChatExportDocument(
  messages: readonly AgentMessageView[],
  options: ChatExportOptions,
): ExportDocument {
  if (
    !messages.length ||
    messages.length > 128 ||
    messages.some((message) => !isChatMessageExportable(message))
  )
    throw new Error('Invalid export selection');
  const assets: Record<string, NonNullable<ExportDocument['assets']>[string]> = {};
  const sections = messages.map((message) => {
    const sources = collectSources(message.parts);
    const blocks: ExportBlock[] = [];
    const process: ExportBlock[] = [];
    const resultIndex = finalTextIndex(message.parts);
    message.parts.forEach((part, index) => {
      if (part.type === 'text' && part.text.trim()) {
        const block: ExportBlock = {
          kind: 'markdown',
          source: replaceChatCitations(part.text, sources),
        };
        if (message.role === 'user' || index === resultIndex) blocks.push(block);
        else if (options.includeProcess) process.push(block);
      } else if (part.type === 'reasoning' && options.includeProcess && part.text.trim()) {
        process.push({
          kind: 'details',
          summary: options.labels.reasoning,
          blocks: [{ kind: 'markdown', source: part.text }],
        });
      } else if (part.type === 'tool' && options.includeProcess) {
        // Only the readable tool name is shared. Inputs, credentials and raw result envelopes stay private.
        process.push({ kind: 'details', summary: part.displayName, blocks: [] });
      }
    });
    if (process.length)
      blocks.unshift({ kind: 'details', summary: options.labels.process, blocks: process });
    for (const part of message.parts) {
      if (part.type !== 'file') continue;
      const name = part.name || options.labels.file;
      if (part.mediaType.startsWith('image/')) {
        const assetId = `${message.id}:${part.id}`;
        assets[assetId] = {
          kind: 'managed-file',
          fileEntryId: FileEntryIdSchema.parse(part.fileEntryId),
        };
        blocks.push({ kind: 'image', assetId, alt: name });
      } else blocks.push({ kind: 'attachment', name, mediaType: part.mediaType });
    }
    if (sources.size)
      blocks.push({
        kind: 'links',
        items: [...sources.values()].map((source, index) => ({
          label: `${index + 1}. ${source.title}`,
          url: source.url,
        })),
      });
    const metadata: { label: string; value: string }[] = [];
    if (options.includeTimestamps)
      metadata.push({ label: options.labels.timestamp, value: message.createdAt });
    if (message.status !== 'success')
      metadata.push({
        label: options.labels.status,
        value: options.labels.messageStatuses[message.status],
      });
    return {
      id: message.id,
      heading: message.role === 'user' ? options.labels.user : options.labels.assistant,
      metadata,
      blocks,
    };
  });
  return { title: options.title, sections, assets };
}

/** Match the article's final-answer boundary using persisted Agent parts, without UI projections. */
function finalTextIndex(parts: readonly AgentMessagePart[]): number | undefined {
  for (let index = parts.length - 1; index >= 0; index--) {
    const part = parts[index];
    if (
      part.type === 'file' ||
      part.type === 'error' ||
      ((part.type === 'text' || part.type === 'reasoning') && !part.text.trim())
    )
      continue;
    return part.type === 'text' ? index : undefined;
  }
  return undefined;
}

type CitationSource = { title: string; url: string };
function collectSources(parts: readonly AgentMessagePart[]): Map<string, CitationSource> {
  const sources = new Map<string, CitationSource>();
  for (const part of parts) {
    if (
      part.type !== 'tool' ||
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
