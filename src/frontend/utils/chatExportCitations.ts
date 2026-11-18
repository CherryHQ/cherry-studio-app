import { AgentToolResultSchema, type AgentMessagePart } from '@/shared/contracts/agent';

import {
  collectCitationSources,
  resolveMessageCitations,
  toolCitationSources,
  type CitationSource,
} from './messageCitations';

type ExportCitationSource = { title: string; url: string };

/** Adapt saved local parts without exposing tool execution records in the export. */
export function collectChatExportSources(
  parts: readonly AgentMessagePart[],
): Map<string, ExportCitationSource> {
  const candidates = parts.flatMap<CitationSource>((part) => {
    if (part.type === 'source-url')
      return [{ id: part.sourceId, title: part.title ?? part.url, url: part.url }];
    if (
      part.type !== 'dynamic-tool' ||
      part.state !== 'output-available' ||
      part.toolRef.source !== 'builtin' ||
      !['web_search', 'web_fetch'].includes(part.toolRef.capabilityId)
    )
      return [];
    const output = AgentToolResultSchema.safeParse(part.output);
    if (!output.success) return [];
    const value = output.data.value;
    const details =
      value && typeof value === 'object' && !Array.isArray(value) ? value.details : undefined;
    return toolCitationSources(
      part.toolRef.capabilityId,
      details && typeof details === 'object' && !Array.isArray(details) ? details.results : value,
    );
  });
  return new Map(
    [...collectCitationSources([], candidates)].flatMap(([id, source]) =>
      source.url ? [[id, { title: source.title, url: new URL(source.url).href }] as const] : [],
    ),
  );
}

/** Preserve source-list numbering while using the shared portable citation and code rules. */
export function replaceChatCitations(
  source: string,
  sources: ReadonlyMap<string, ExportCitationSource>,
): string {
  const numbers = new Map([...sources.keys()].map((id, index) => [id, index + 1]));
  return (
    resolveMessageCitations(
      [{ type: 'text', text: source }],
      [...sources].map(([id, item]) => ({ ...item, id })),
      'export',
      numbers,
    ).textByPartIndex.get(0)?.markdown ?? source
  );
}
