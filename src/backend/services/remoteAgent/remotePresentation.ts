import type { AgentPart } from '@cherrystudio/remote-protocol/agent';

import { AgentMessagePartSchema } from '@/shared/contracts/agent';
import type { RemoteMessagePart } from '@/shared/contracts/remoteAgent';

type PresentationPart = Extract<RemoteMessagePart, { kind: 'presentation' }>['part'];

export function isPresentationData(part: AgentPart): part is Extract<AgentPart, { kind: 'data' }> {
  return (
    part.kind === 'data' &&
    ['source-url', 'data-compaction-anchor', 'data-search-suggestions'].includes(part.name)
  );
}

/** Desktop envelopes may include transport metadata; only the shared content fields survive. */
export function readPresentationPart(part: AgentPart): PresentationPart | undefined {
  if (part.kind !== 'data' || !isPresentationData(part) || !('text' in part.content)) return;
  let value: unknown;
  try {
    value = JSON.parse(part.content.text);
  } catch {
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const record = value as Record<string, unknown>;
  const fields =
    part.name === 'source-url'
      ? { sourceId: record.sourceId, url: record.url, title: record.title }
      : { data: record.data };
  const parsed = AgentMessagePartSchema.safeParse({ id: part.partId, type: part.name, ...fields });
  if (
    parsed.success &&
    (parsed.data.type === 'source-url' ||
      parsed.data.type === 'data-compaction-anchor' ||
      parsed.data.type === 'data-search-suggestions')
  )
    return parsed.data;
}
