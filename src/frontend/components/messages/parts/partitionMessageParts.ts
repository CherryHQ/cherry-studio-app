import type { CherryMessagePart } from '@/shared/data/types/message';

type MessageFilePart = Extract<CherryMessagePart, { type: 'file' }>;

export type PartitionedMessageParts = {
  /** Everything rendered in transcript order, carrying its original index. */
  body: readonly { index: number; part: CherryMessagePart }[];
  /** Every file in the message, shown as one row after the body. */
  files: readonly MessageFilePart[];
};

/**
 * Splits a message into its ordered body and the files it produced.
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
 */
export function partitionMessageParts(
  parts: readonly CherryMessagePart[],
): PartitionedMessageParts {
  const body: { index: number; part: CherryMessagePart }[] = [];
  const files: MessageFilePart[] = [];

  parts.forEach((part, index) => {
    if (part.type === 'source-url') {
      return;
    }

    if (part.type === 'file') {
      files.push(part);
      return;
    }

    body.push({ index, part });
  });

  return { body, files };
}
