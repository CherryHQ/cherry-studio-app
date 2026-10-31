import type { AgentMessagePart, AgentReplyPartEdit } from '@/shared/contracts/agent';

/** Visible prose is editable; reasoning, files and tool receipts record what happened. */
export function editableReplyParts(parts: readonly AgentMessagePart[]) {
  return parts.filter(
    (part): part is AgentMessagePart & { type: 'text'; id: string; text: string } =>
      part.type === 'text' && part.text.trim().length > 0,
  );
}

/**
 * Applies the edits in place, keeping every part identity. Undefined when an edit names a part
 * that is not editable or whose text no longer matches what the reader edited.
 */
export function applyReplyEdits(
  parts: readonly AgentMessagePart[],
  edits: readonly AgentReplyPartEdit[],
): AgentMessagePart[] | undefined {
  const editable = new Map(editableReplyParts(parts).map((part) => [part.id, part.text]));
  if (edits.some((edit) => editable.get(edit.id) !== edit.expectedText)) return undefined;
  const replacements = new Map(edits.map((edit) => [edit.id, edit.text]));
  return parts.map((part) => {
    const text = part.type === 'text' ? replacements.get(part.id) : undefined;
    return text === undefined ? part : { ...part, text };
  });
}
