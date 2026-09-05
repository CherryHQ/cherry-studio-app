import type { CherryMessagePart } from '@/shared/data/types/message';

import { isProviderWebSearchToolPart, isToolMessagePart } from './tools/toolPartState';

type MessageFilePart = Extract<CherryMessagePart, { type: 'file' }>;
export type MessageProcessItem = {
  index: number;
  part: CherryMessagePart;
};

export type MessageBodyItem = { kind: 'part'; index: number; part: CherryMessagePart };

export type PartitionedMessageParts = {
  /** The final result text, carrying its original index for citation resolution. */
  body: readonly MessageBodyItem[];
  /** Every file in the message, shown as one row after the body. */
  files: readonly MessageFilePart[];
  /** Every visible transcript part except the final result text. */
  process: readonly MessageProcessItem[];
};

/**
 * Splits a message into its timed process, final result text, and produced
 * files. Only the last visible text part remains in the article body; earlier
 * prose, reasoning, and tools all belong to the process disclosure.
 *
 * Files are lifted out of the stream and shown after the answer rather than at
 * the tool call that wrote them. A deliverable buried between two blocks of
 * prose is hard to find on a phone, and the position it was emitted at says
 * nothing a reader wants — it is the answer the file belongs to, not the step.
 *
 * The split keys on part type and never on a file's declared purpose: a
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
  const body: MessageBodyItem[] = [];
  const files: MessageFilePart[] = [];
  const process: MessageProcessItem[] = [];
  const resultTextIndex = findResultTextIndex(parts);

  parts.forEach((part, index) => {
    if (part.type === 'source-url') {
      return;
    }

    if (part.type === 'file') {
      files.push(part);
      return;
    }

    if (isInvisiblePart(part)) {
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

  return { body, files, process };
}

function findResultTextIndex(parts: readonly CherryMessagePart[]): number | undefined {
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = parts[index];
    if (!part) continue;
    if (
      part.type === 'source-url' ||
      part.type === 'file' ||
      part.type === 'data-error' ||
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
    (part.type === 'reasoning' && part.state !== 'streaming' && !part.text.trim()) ||
    part.type === 'step-start' ||
    part.type === 'source-document' ||
    part.type === 'data-video' ||
    (isToolMessagePart(part) && isProviderWebSearchToolPart(part))
  );
}
