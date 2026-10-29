import type { ContextEdit, ContextView, EntryId, EntryRecord } from '@earendil-works/pi-durable';

import type { AgentReplyPartEdit } from '@/shared/contracts/agent';

import { readPiWebResult } from './PiWebResponse';

export const PI_REPLY_EDIT_KIND = 'cherry.reply-edit';
// Their text signatures carry the output item identity and phase, not a proof of the content.
const RESPONSES_APIS = new Set([
  'openai-responses',
  'azure-openai-responses',
  'openai-codex-responses',
]);

/** Preserve the original transcript's IDs and usage while presenting Cherry's explicit text edits. */
export function applyPiReplyEdits(entries: readonly EntryRecord[]): readonly EntryRecord[] {
  const edits = new Map<EntryId, ContextEdit>();
  for (const entry of entries)
    if (entry.kind === PI_REPLY_EDIT_KIND)
      for (const edit of entry.edits ?? []) edits.set(edit.target, edit);
  if (edits.size === 0) return entries;
  return entries.map((entry) => {
    const edit = edits.get(entry.id);
    if (!edit) return entry;
    const model =
      edit.action === 'replace'
        ? edit.messages.map((message, index) => {
            const original = entry.model?.[index];
            // Context overrides discard the obsolete size estimate, not the billed invocation receipt.
            return message.role === 'assistant' && original?.role === 'assistant'
              ? { ...message, usage: original.usage }
              : message;
          })
        : [];
    return { ...entry, model };
  });
}

/**
 * Text part IDs identify native content blocks of the answer's own turn. The current context, with
 * earlier edits applied, must still show each part's expected text. Compacted/imported answers and
 * provider web replay cannot safely be rewritten this way; those use the Cherry rebuild path.
 */
export function createPiReplyEdits(
  view: ContextView,
  turn: readonly EntryRecord[],
  parts: readonly AgentReplyPartEdit[],
): ContextEdit[] | undefined {
  const replacements = new Map<EntryId, Extract<ContextEdit, { action: 'replace' }>>();
  for (const part of parts) {
    const match = /^pi:(\d+):block:(\d+)$/.exec(part.id);
    if (!match) return undefined;
    const id = Number(match[1]) as EntryId;
    const index = Number(match[2]);
    const entryIndex = view.entries.findIndex((entry) => entry.id === id);
    if (entryIndex < 0 || !turn.some((entry) => entry.id === id)) return undefined;
    const messages = replacements.get(id)?.messages ?? view.contributions[entryIndex];
    const message = messages?.[0];
    if (messages?.length !== 1 || message?.role !== 'assistant' || readPiWebResult(message))
      return undefined;
    if (message.content[index]?.type !== 'text') return undefined;
    // Anthropic projects adjacent text/citation fragments into one visible part.
    let end = index + 1;
    if (message.api === 'anthropic-messages') while (message.content[end]?.type === 'text') end++;
    const current = message.content
      .slice(index, end)
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    if (current !== part.expectedText) return undefined;
    const content = [...message.content];
    const keepsIdentity = RESPONSES_APIS.has(message.api);
    for (let block = index; block < end; block++) {
      const original = message.content[block];
      // A replacement has no provider signature or citation payload claiming it was generated.
      content[block] = {
        type: 'text',
        text: block === index ? part.text : '',
        ...(keepsIdentity && original?.type === 'text' && original.textSignature
          ? { textSignature: original.textSignature }
          : {}),
      };
    }
    replacements.set(id, {
      target: id,
      action: 'replace',
      messages: [
        {
          ...message,
          content,
          // Pi uses the newest nonzero usage as a measured context size. Editing invalidates it;
          // estimate the changed content after the preceding unchanged measurement instead.
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
        },
      ],
    });
  }
  return replacements.size ? [...replacements.values()] : undefined;
}
