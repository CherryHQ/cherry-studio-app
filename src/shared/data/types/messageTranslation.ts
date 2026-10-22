import * as z from 'zod';

import { APP_LANGUAGES } from '@/shared/utils/languages';

export const MessageTranslationResultSchema = z.strictObject({
  content: z.string().refine((content) => content.trim().length > 0, 'Empty translation'),
  createdAt: z.number().int().nonnegative(),
});

/** Reading aids stored beside parts in the owning message's data column. */
export const MessageTranslationsSchema = z.strictObject({
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  results: z.partialRecord(
    z.enum(APP_LANGUAGES.map(({ value }) => value)),
    MessageTranslationResultSchema,
  ),
});
export type MessageTranslations = z.infer<typeof MessageTranslationsSchema>;

/** Unreadable reading aids must not hide the original message. */
export function readMessageTranslations(value: unknown): MessageTranslations | undefined {
  const parsed = MessageTranslationsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
