import type { CherryMessagePart } from '@/shared/data/types/message';

import {
  isProviderWebSearchToolPart,
  isToolMessagePart,
  type ToolMessagePart,
} from './tools/toolPartState';

type MessageFilePart = Extract<CherryMessagePart, { type: 'file' }>;

export type MessageBodyToolItem = { index: number; part: ToolMessagePart };

export type MessageBodyItem =
  | { kind: 'part'; index: number; part: CherryMessagePart }
  | { kind: 'tool-group'; index: number; items: readonly MessageBodyToolItem[] };

export type PartitionedMessageParts = {
  /** Everything rendered in transcript order, carrying its original index. */
  body: readonly MessageBodyItem[];
  /** Every file in the message, shown as one row after the body. */
  files: readonly MessageFilePart[];
};

/**
 * Splits a message into its ordered body and the files it produced, and folds
 * runs of consecutive tool calls into one `tool-group` item.
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
 * Tool grouping rules:
 * - Only runs of two or more visible tool calls group; a lone call keeps its
 *   own row, whose title already says everything a group summary would.
 * - Provider-executed web searches render nothing, so they neither count
 *   toward a group nor split one; outside a group they pass through unchanged.
 * - Source and file parts are lifted out of the stream anyway, so they do not
 *   split a run they happen to interleave with. Any other part type does.
 */
export function partitionMessageParts(
  parts: readonly CherryMessagePart[],
): PartitionedMessageParts {
  const body: MessageBodyItem[] = [];
  const files: MessageFilePart[] = [];
  let run: MessageBodyToolItem[] = [];

  const flushRun = () => {
    if (run.length === 0) {
      return;
    }
    const visible = run.filter((item) => !isProviderWebSearchToolPart(item.part));
    if (visible.length >= 2) {
      body.push({ index: visible[0].index, items: visible, kind: 'tool-group' });
    } else {
      for (const item of run) {
        body.push({ kind: 'part', ...item });
      }
    }
    run = [];
  };

  parts.forEach((part, index) => {
    if (part.type === 'source-url') {
      return;
    }

    if (part.type === 'file') {
      files.push(part);
      return;
    }

    if (isToolMessagePart(part)) {
      run.push({ index, part });
      return;
    }

    flushRun();
    body.push({ index, kind: 'part', part });
  });
  flushRun();

  return { body, files };
}
