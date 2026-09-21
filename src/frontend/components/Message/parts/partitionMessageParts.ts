import type { CherryMessagePart } from '@/shared/data/types/message';

import { isProviderWebSearchToolPart, isToolMessagePart } from './tools/toolPartState';

type MessageFilePart = Extract<CherryMessagePart, { type: 'file' }>;
export type MessageProcessItem = {
  index: number;
  part: CherryMessagePart;
};

export type MessageBodyItem = { kind: 'part'; index: number; part: CherryMessagePart };

export type PartitionedMessageParts = {
  /** Turn-boundary compaction markers stay visible before the process disclosure. */
  boundaries: readonly MessageBodyItem[];
  /** Images and final result text in transcript order, retaining their original indices. */
  body: readonly MessageBodyItem[];
  /** Non-image files, shown as one row after the body. */
  files: readonly MessageFilePart[];
  /** Intermediate prose, reasoning, and tools. */
  process: readonly MessageProcessItem[];
};

/**
 * Splits a message into its timed process, illustrated answer, and downloadable
 * files. The last visible text part and images remain in the article body;
 * earlier prose, reasoning, and tools belong to the process disclosure.
 *
 * Images retain their position relative to the answer: a tool can produce an
 * image before the model explains it. Other files collect after the answer.
 *
 * The split keys on part and media type, never on a file's declared purpose: a
 * transcript replayed from a peer that has no purpose field of its own must lay
 * out identically to a locally produced one. Nothing is lost by ignoring it,
 * because only assistant messages reach here with files at all — the user row
 * lifts its own attachments out before rendering the bubble.
 *
 * Source parts drop out too; `SourceGroup` collects them separately.
 *
 * Provider-owned invisible parts do not create an empty process row. Source
 * and file parts remain dedicated result affordances outside this split.
 */
export function partitionMessageParts(
  parts: readonly CherryMessagePart[],
): PartitionedMessageParts {
  const boundaries: MessageBodyItem[] = [];
  const body: MessageBodyItem[] = [];
  const files: MessageFilePart[] = [];
  const process: MessageProcessItem[] = [];
  const resultTextIndex = findResultTextIndex(parts);

  parts.forEach((part, index) => {
    if (part.type === 'source-url') {
      return;
    }

    if (part.type === 'file') {
      if (part.mediaType.toLowerCase().startsWith('image/')) {
        body.push({ index, kind: 'part', part });
      } else {
        files.push(part);
      }
      return;
    }

    if (isInvisiblePart(part)) {
      return;
    }

    if (part.type === 'data-compaction-anchor' && part.data.phase !== 'in-loop') {
      boundaries.push({ index, kind: 'part', part });
      return;
    }

    // A transcript failure is the outcome, not hidden execution process. Keep
    // it inline even when reasoning or partial answer text came before it.
    if (part.type === 'data-error') {
      body.push({ index, kind: 'part', part });
      return;
    }

    if (index !== resultTextIndex) {
      process.push({ index, part });
      return;
    }

    body.push({ index, kind: 'part', part });
  });

  return { boundaries, body, files, process };
}

function findResultTextIndex(parts: readonly CherryMessagePart[]): number | undefined {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part) continue;
    if (
      part.type === 'source-url' ||
      part.type === 'file' ||
      part.type === 'data-error' ||
      part.type === 'data-compaction-anchor' ||
      isInvisiblePart(part)
    ) {
      continue;
    }

    if (part.type === 'text' && part.text.trim()) {
      return index;
    }

    return undefined;
  }

  return undefined;
}

function isInvisiblePart(part: CherryMessagePart) {
  return (
    ((part.type === 'reasoning' || part.type === 'text') &&
      part.state !== 'streaming' &&
      !part.text.trim()) ||
    part.type === 'step-start' ||
    part.type === 'source-document' ||
    part.type === 'data-video' ||
    (part.type === 'data-compaction-anchor' && part.data.status === 'skipped') ||
    (isToolMessagePart(part) && isProviderWebSearchToolPart(part))
  );
}
