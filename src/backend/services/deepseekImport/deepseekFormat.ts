import * as z from 'zod';

import { DeepseekImportError } from '@/shared/contracts/deepseekImport';

export const DEEPSEEK_IMPORT_LIMITS = {
  archiveBytes: 1024 * 1024 * 1024,
  expandedBytes: 1024 * 1024 * 1024,
  entries: 20_000,
  jsonBytes: 32 * 1024 * 1024,
  messages: 100_000,
} as const;

const timestamp = z.string().transform((value, ctx) => {
  const time = Date.parse(value);
  if (!Number.isSafeInteger(time) || time < 0) {
    ctx.addIssue({ code: 'custom', message: 'Invalid export timestamp' });
    return z.NEVER;
  }
  return time;
});
const sessionId = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_-]+$/);
const file = z.object({
  id: z.string().min(1),
  file_name: z.string().min(1),
  file_size: z.number().int().nonnegative().optional().default(0),
  is_image: z.boolean(),
  export_path: z.string().nullable(),
});
const source = z.object({
  url: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
});

const fragment = z.discriminatedUnion('type', [
  z.object({ type: z.literal('REQUEST'), content: z.string() }),
  z.object({ type: z.literal('RESPONSE'), content: z.string() }),
  z.object({ type: z.literal('THINK'), content: z.string() }),
  z.object({ type: z.literal('TEMPLATE_RESPONSE'), content: z.string() }),
  z.object({ type: z.literal('FILE'), files: z.array(file) }),
  z.object({ type: z.literal('TOOL_SEARCH'), results: z.array(source) }),
  z.object({
    type: z.literal('TOOL_OPEN'),
    url: z.string().nullable(),
    title: z.string().nullable().optional(),
  }),
  z.object({ type: z.literal('READ_LINK'), results: z.array(source) }),
]);
const fragmentTypes = new Set(fragment.options.map((option) => option.shape.type.value));
const envelope = z.looseObject({ type: z.string() }).transform((value, ctx) => {
  if (!fragmentTypes.has(value.type as z.infer<typeof fragment>['type'])) return null;
  const parsed = fragment.safeParse(value);
  if (!parsed.success) {
    ctx.addIssue({ code: 'custom', message: 'Invalid export fragment' });
    return z.NEVER;
  }
  return parsed.data;
});

export const deepseekIndexSchema = z
  .array(
    z.object({
      id: sessionId,
      inserted_at: timestamp,
      updated_at: timestamp,
    }),
  )
  .max(DEEPSEEK_IMPORT_LIMITS.entries);

export const deepseekConversationSchema = z.object({
  id: sessionId,
  title: z.string().nullable(),
  inserted_at: timestamp,
  current_message_id: z.number().int().nonnegative().nullable().optional(),
  messages: z
    .array(
      z.object({
        id: z.number().int().nonnegative(),
        parent_id: z.number().int().nonnegative().nullable(),
        role: z.enum(['USER', 'ASSISTANT']),
        status: z.string(),
        inserted_at: timestamp,
        fragments: z.array(envelope),
      }),
    )
    .max(DEEPSEEK_IMPORT_LIMITS.messages),
});

export type DeepseekConversation = z.infer<typeof deepseekConversationSchema>;
export type DeepseekFile = z.infer<typeof file>;

/** Parents precede their children in the official format; this also excludes cycles. */
export function validateDeepseekTree(conversation: DeepseekConversation): void {
  if (conversation.messages.length === 0) {
    // The official exporter uses 0 when an empty conversation has no selected message.
    if (conversation.current_message_id != null && conversation.current_message_id !== 0)
      throw new DeepseekImportError('invalid');
    return;
  }
  const messages = [...conversation.messages].sort((a, b) => a.id - b.id);
  const seen = new Map<number, DeepseekConversation['messages'][number]>();
  for (const message of messages) {
    const parent = message.parent_id === null ? undefined : seen.get(message.parent_id);
    if (
      seen.has(message.id) ||
      (message.parent_id === null
        ? message.role !== 'USER'
        : !parent || parent.role === message.role)
    )
      throw new DeepseekImportError('invalid');
    seen.set(message.id, message);
  }
  if (conversation.current_message_id != null && !seen.has(conversation.current_message_id)) {
    throw new DeepseekImportError('invalid');
  }
}
