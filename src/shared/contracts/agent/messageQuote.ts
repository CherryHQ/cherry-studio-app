import { z } from 'zod';

import type { AgentMessageView } from './views';

export const MessageQuoteSchema = z.strictObject({
  id: z.string().refine((id) => id.trim().length > 0, 'Quote id must be nonempty.'),
  sourceMessageId: z.uuid(),
  text: z.string().refine((text) => text.trim().length > 0, 'Quote snapshot must be readable.'),
});
export type MessageQuote = z.infer<typeof MessageQuoteSchema>;
export const QuoteAuthorSchema = z.strictObject({
  role: z.enum(['user', 'assistant']),
  name: z.string().optional(),
});
export type QuoteAuthor = z.infer<typeof QuoteAuthorSchema>;
export const quoteFields = {
  quotes: z.tuple([MessageQuoteSchema]).optional(),
  quoteAuthor: QuoteAuthorSchema.optional(),
};
export type QuoteFields = { quotes?: [MessageQuote]; quoteAuthor?: QuoteAuthor };

export function hasQuotePair(part: QuoteFields): boolean {
  return Boolean(part.quotes) === Boolean(part.quoteAuthor);
}

/** Also used by display recovery: invalidate every ambiguous carrier, never choose a winner. */
export function invalidQuoteCarriers(parts: readonly unknown[], role = 'user'): number[] {
  const carriers: number[] = [];
  let firstText = -1;
  let hasAttachment = false;
  parts.forEach((part, index) => {
    if (!part || typeof part !== 'object') return;
    if ('type' in part && part.type === 'text' && firstText < 0) firstText = index;
    if ('type' in part && part.type === 'file') hasAttachment = true;
    if ('quotes' in part || 'quoteAuthor' in part) carriers.push(index);
  });
  return carriers.filter((index) => {
    const part = parts[index] as { type?: string; text?: string };
    return (
      role !== 'user' ||
      carriers.length !== 1 ||
      index !== firstText ||
      part.type !== 'text' ||
      (!part.text?.trim() && !hasAttachment)
    );
  });
}

/** Original authored Markdown and readable file descriptors only; no nested quote expansion. */
export function messageQuoteSnapshot(message: AgentMessageView): string | undefined {
  if (message.role !== 'user' && message.role !== 'assistant') return undefined;
  if (
    message.status !== 'success' ||
    message.parts.some(
      (part) =>
        (part.type === 'data-error' && part.data.code === 'MESSAGE_UNREADABLE') ||
        ((part.type === 'text' || part.type === 'reasoning') && part.state !== 'done'),
    )
  )
    return undefined;
  const text = message.parts
    .flatMap((part) => {
      if (part.type === 'text') return [part.text];
      if (part.type === 'file') return [`[${part.filename ?? part.mediaType} (${part.mediaType})]`];
      return [];
    })
    .join('\n\n');
  return text.trim() ? text : undefined;
}
