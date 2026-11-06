import type { MessageQuote } from '@/shared/contracts/agent';

import { isMentionEscaped, readMentionLabel } from '../components/ChatInput/utils/mentionLabels';

const QUOTE_MENTION_PATTERN = /\[((?:\\.|[^\]\\\n])+)\]\(quote:\/\/([^\s)]+)\)/g;

export function createQuoteMentionLabel(text: string): string {
  const characters = Array.from(text.replace(/\s+/g, ' ').trim());
  const excerpt = characters.slice(0, 32).join('');
  return `“${excerpt}${characters.length > 32 ? '…' : ''}”`;
}

export function createQuoteMention(quote: MessageQuote): string {
  const label = (quote.reference?.label ?? createQuoteMentionLabel(quote.text)).replace(
    /[\\[\]]/g,
    '\\$&',
  );
  return `[${label}](quote://${quote.id})`;
}

/** Keeps only references still present in the native editor, including repeated occurrences. */
export function readQuoteMentions(draft: string, available: readonly MessageQuote[] = []) {
  const byId = new Map(available.map((quote) => [quote.id, quote]));
  const quotes: MessageQuote[] = [];
  const removed: { end: number; length: number }[] = [];
  let text = '';
  let cursor = 0;
  for (const match of draft.matchAll(QUOTE_MENTION_PATTERN)) {
    if (isMentionEscaped(draft, match.index)) continue;
    const [source, rawLabel, id] = match;
    const label = readMentionLabel(rawLabel);
    if (!label) continue;
    text += draft.slice(cursor, match.index);
    const quote = byId.get(id);
    if (quote) quotes.push({ ...quote, reference: { label, offset: text.length } });
    text += label;
    cursor = match.index + source.length;
    removed.push({ end: cursor, length: source.length - label.length });
  }
  return {
    quotes,
    text: text + draft.slice(cursor),
    shift: (offset: number) =>
      offset - removed.reduce((sum, item) => sum + (item.end <= offset ? item.length : 0), 0),
  };
}

/** Restores recorded inline ranges; older quotes are inserted before the request. */
export function restoreQuoteMentions(text: string, quotes: readonly MessageQuote[] = []): string {
  let draft = text;
  for (const quote of [...quotes].sort(
    (left, right) => (right.reference?.offset ?? -1) - (left.reference?.offset ?? -1),
  )) {
    const reference = quote.reference;
    if (!reference) {
      draft = `${createQuoteMention(quote)}\n${draft}`;
    } else if (
      draft.slice(reference.offset, reference.offset + reference.label.length) === reference.label
    ) {
      draft = `${draft.slice(0, reference.offset)}${createQuoteMention(quote)}${draft.slice(reference.offset + reference.label.length)}`;
    }
  }
  return draft;
}
