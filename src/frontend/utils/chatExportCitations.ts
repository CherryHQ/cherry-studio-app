import { AgentToolResultSchema, type AgentMessagePart } from '@/shared/contracts/agent';
import type { CherryMessagePart } from '@/shared/data/types/message';

import {
  citableToolName,
  collectCitationSources,
  resolveMessageCitations,
  toolCitationSources,
  type CitationSource,
} from './messageCitations';

export type ExportCitationSource = { title: string; url?: string };

/** Adapt saved local parts without exposing tool execution records in the export. */
export function collectChatExportSources(
  parts: readonly AgentMessagePart[],
): Map<string, ExportCitationSource> {
  const candidates = parts.flatMap<CitationSource>((part) => {
    if (part.type === 'source-url')
      return [{ id: part.sourceId, title: part.title ?? part.url, url: part.url }];
    if (part.type !== 'dynamic-tool' || part.state !== 'output-available') return [];
    const toolName =
      part.toolRef.source === 'builtin'
        ? citableToolName(part.toolRef.capabilityId, part.input, true)
        : part.toolRef.source === 'mcp'
          ? citableToolName(part.toolName, part.input, false)
          : undefined;
    if (!toolName) return [];
    const output = AgentToolResultSchema.safeParse(part.output);
    if (!output.success) return [];
    const value = output.data.value;
    const details =
      value && typeof value === 'object' && !Array.isArray(value) ? value.details : undefined;
    const payload =
      details && typeof details === 'object' && !Array.isArray(details) && 'results' in details
        ? details.results
        : value;
    return toolCitationSources(toolName, payload);
  });
  return new Map(
    [...collectCitationSources([], candidates)].map(([id, source]) => [
      id,
      {
        title: source.title,
        ...(source.url ? { url: new URL(source.url).href } : {}),
      },
    ]),
  );
}

/** Portable links use the same source validation, numbering and code exclusion as the message. */
export function replaceChatCitations(
  source: string,
  sources: ReadonlyMap<string, ExportCitationSource>,
  preferredNumbers?: ReadonlyMap<string, number>,
  parts: readonly CherryMessagePart[] = [],
): string {
  const numbers =
    preferredNumbers ?? new Map([...sources.keys()].map((id, index) => [id, index + 1]));
  const translationParts: CherryMessagePart[] = [
    ...parts.filter((part) => part.type !== 'text'),
    { type: 'text', text: source },
  ];
  return (
    resolveMessageCitations(
      translationParts,
      [...sources].map(([id, item]) => ({ ...item, id })),
      'export',
      numbers,
    ).textByPartIndex.get(translationParts.length - 1)?.markdown ?? source
  );
}
