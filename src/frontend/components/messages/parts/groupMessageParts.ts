import type { CherryMessagePart } from '@/shared/data/types/message';

type MessageFilePart = Extract<CherryMessagePart, { type: 'file' }>;

/** One slot in the ordered part stream: a single part, or a run of files. */
export type MessagePartGroup =
  | { index: number; kind: 'part'; part: CherryMessagePart }
  | { index: number; kind: 'files'; parts: readonly MessageFilePart[] };

/**
 * Collapses adjacent file parts into runs, preserving transcript order.
 *
 * Grouping keys on adjacency and never on a file's declared purpose: a
 * transcript replayed from a peer that has no purpose field of its own must lay
 * out identically to a locally produced one. Position is left alone for the
 * same reason — a file the model emitted mid-answer stays where it happened,
 * which is also where the tool call that produced it is.
 *
 * Source parts drop out here because `SourceGroup` collects them separately;
 * removing them first also keeps a run intact when one interrupts it.
 */
export function groupMessageParts(
  parts: readonly CherryMessagePart[],
): readonly MessagePartGroup[] {
  const groups: (
    | { index: number; kind: 'part'; part: CherryMessagePart }
    | { index: number; kind: 'files'; parts: MessageFilePart[] }
  )[] = [];

  parts.forEach((part, index) => {
    if (part.type === 'source-url') {
      return;
    }

    if (part.type !== 'file') {
      groups.push({ index, kind: 'part', part });
      return;
    }

    const open = groups.at(-1);
    if (open?.kind === 'files') {
      open.parts.push(part);
      return;
    }

    groups.push({ index, kind: 'files', parts: [part] });
  });

  return groups;
}
