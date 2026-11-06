import { z } from 'zod';

export const MessageQuoteSchema = z.strictObject({
  id: z.string().refine((id) => id.trim().length > 0, 'Quote id must be nonempty.'),
  sourceMessageId: z.uuid(),
  text: z.string().refine((text) => text.trim().length > 0, 'Quote snapshot must be readable.'),
});
export type MessageQuote = z.infer<typeof MessageQuoteSchema>;
export const QuoteAuthorSchema = z.strictObject({
  role: z.literal('assistant'),
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
