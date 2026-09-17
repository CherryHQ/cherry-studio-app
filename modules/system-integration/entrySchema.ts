import * as z from 'zod';

const base = {
  version: z.literal(1),
  id: z.uuid(),
  createdAt: z.number().finite().positive(),
};
const agentId = z.string().min(1).max(512).optional();
const text = z.string().max(131_072);
const file = z.strictObject({
  uri: z.string().startsWith('file://').max(4096),
  name: z.string().min(1).max(255),
  mediaType: z.string().max(255),
  size: z
    .number()
    .int()
    .nonnegative()
    .max(25 * 1024 * 1024),
});

/** Validation for a real native boundary; navigation strings never grant ask/reply capability. */
export const nativeSystemEntrySchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ ...base, kind: z.literal('chat.open'), agentId }),
    z.strictObject({ ...base, kind: z.literal('painting.open') }),
    z.strictObject({
      ...base,
      kind: z.literal('chat.ask'),
      agentId,
      text: text.min(1),
      replyExpected: z.literal(true),
    }),
    z.strictObject({
      ...base,
      kind: z.literal('share.receive'),
      text,
      files: z.array(file).max(10),
    }),
    z.strictObject({
      ...base,
      kind: z.literal('translation.translate'),
      text: text.min(1).max(16_000),
      targetLanguage: z.string().max(64).optional(),
    }),
  ])
  .superRefine((entry, context) => {
    if (entry.kind !== 'share.receive') return;
    if (!entry.text.trim() && entry.files.length === 0)
      context.addIssue({ code: 'custom', message: 'A share must contain text or files' });
    if (entry.files.reduce((total, attachment) => total + attachment.size, 0) > 50 * 1024 * 1024)
      context.addIssue({
        code: 'custom',
        message: 'Shared attachments exceed the total size limit',
      });
  });
