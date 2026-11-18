import * as z from 'zod';

export const DEEPSEEK_IMPORT_LIMITS = {
  archiveBytes: 1024 * 1024 * 1024,
  expandedBytes: 1024 * 1024 * 1024,
  entries: 65_535,
  jsonBytes: 32 * 1024 * 1024,
} as const;

/** ISO text or epoch seconds/milliseconds; anything else falls back to a neighbouring time. */
const timestamp = z
  .unknown()
  .transform((value) => {
    const time =
      typeof value === 'number'
        ? value < 1e12
          ? value * 1000
          : value
        : typeof value === 'string'
          ? Date.parse(value)
          : NaN;
    // 8.64e15 ms is the largest time a JavaScript Date can represent.
    return time >= 0 && time <= 8.64e15 ? Math.round(time) : undefined;
  })
  .optional();
const idText = z.union([z.string().min(1), z.number()]).transform(String);
const optionalText = z.string().nullable().optional().catch(null);
const file = z.object({
  id: idText.catch(''),
  file_name: z.string().catch(''),
  is_image: z.boolean().catch(false),
  export_path: optionalText,
});
const source = z.object({ url: optionalText, title: optionalText });
function validItems<T extends z.ZodType>(items: unknown[], item: T): z.output<T>[] {
  return items.flatMap((value) => {
    const parsed = item.safeParse(value);
    return parsed.success ? [parsed.data as z.output<T>] : [];
  });
}

const list = <T extends z.ZodType>(item: T) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((items) => validItems(items, item));

const fragment = z.discriminatedUnion('type', [
  z.object({ type: z.literal('REQUEST'), content: z.string().catch('') }),
  z.object({ type: z.literal('RESPONSE'), content: z.string().catch('') }),
  z.object({ type: z.literal('THINK'), content: z.string().catch('') }),
  z.object({ type: z.literal('TEMPLATE_RESPONSE'), content: z.string().catch('') }),
  z.object({ type: z.literal('FILE'), files: list(file) }),
  z.object({ type: z.literal('TOOL_SEARCH'), results: list(source) }),
  z.object({ type: z.literal('TOOL_OPEN'), url: optionalText, title: optionalText }),
  z.object({ type: z.literal('READ_LINK'), results: list(source) }),
]);

const message = z.object({
  id: z.number().int().nonnegative(),
  parent_id: z.number().int().nonnegative().nullable().catch(null),
  role: z
    .string()
    .transform((value) => value.toUpperCase())
    .pipe(z.enum(['USER', 'ASSISTANT'])),
  status: z.string().catch('FINISHED'),
  inserted_at: timestamp,
  fragments: list(fragment),
});

/** Unreadable index rows are dropped; conversation files found in the archive are imported too. */
export const deepseekIndexSchema = list(
  z.object({ id: idText, inserted_at: timestamp, updated_at: timestamp }),
);

/** Lenient: malformed messages and fragments are dropped instead of rejecting the conversation. */
export const deepseekConversationSchema = z.object({
  title: optionalText,
  inserted_at: timestamp,
  current_message_id: z.number().int().nullable().optional().catch(null),
  messages: z.array(z.unknown()).transform((items, context) => {
    const parsed = validItems(items, message);
    if (items.length > 0 && parsed.length === 0) {
      context.addIssue({ code: 'custom', message: 'No readable messages' });
      return z.NEVER;
    }
    return parsed;
  }),
});

export type DeepseekConversation = z.infer<typeof deepseekConversationSchema>;
export type DeepseekMessage = DeepseekConversation['messages'][number];
export type DeepseekFile = z.infer<typeof file>;

/**
 * Repairs the tree into the alternating question/answer shape the transcript requires. Parents
 * that are missing or appear later become roots, a same-role parent is replaced by its nearest
 * opposite-role ancestor, and duplicate IDs keep their first message. An answer with no question
 * above it has nowhere to attach and is dropped; its children re-attach to the nearest kept
 * ancestor. Returns messages in ID order and the selected message after repair.
 */
export function repairDeepseekTree(conversation: DeepseekConversation): {
  messages: DeepseekMessage[];
  selectedId: number | undefined;
} {
  const kept = new Map<number, DeepseekMessage>();
  // Every seen ID resolves to itself or, when dropped, to the kept ancestor that replaces it.
  const resolved = new Map<number, number | null>();
  for (const original of [...conversation.messages].sort((a, b) => a.id - b.id)) {
    if (resolved.has(original.id)) continue;
    let parent = original.parent_id === null ? null : (resolved.get(original.parent_id) ?? null);
    while (parent !== null && kept.get(parent)!.role === original.role)
      parent = kept.get(parent)!.parent_id;
    if (original.role === 'ASSISTANT' && parent === null) {
      resolved.set(original.id, null);
      continue;
    }
    resolved.set(original.id, original.id);
    kept.set(original.id, { ...original, parent_id: parent });
  }
  const messages = [...kept.values()];
  const selected =
    conversation.current_message_id == null
      ? undefined
      : resolved.get(conversation.current_message_id);
  return { messages, selectedId: selected ?? messages.at(-1)?.id };
}
