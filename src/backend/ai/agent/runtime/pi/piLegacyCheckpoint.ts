import { z } from 'zod';

/** Reader for the former core engine's summary. New summaries belong to Pi Durable. */
export const PI_CONTEXT_CHECKPOINT_KIND = 'pi-context-compaction';
const LegacyCheckpointSchema = z.object({
  kind: z.literal(PI_CONTEXT_CHECKPOINT_KIND),
  summary: z.string().min(1),
  tokensBefore: z.number().finite().nonnegative(),
  resume: z
    .object({
      turnId: z.string().min(1),
      messageOffset: z.number().int().nonnegative(),
      replayKind: z.string().optional(),
    })
    .optional(),
});

export type PiCheckpointPayload = z.infer<typeof LegacyCheckpointSchema>;

export function parseCheckpointPayload(value: unknown): PiCheckpointPayload | null {
  const result = LegacyCheckpointSchema.safeParse(value);
  return result.success ? result.data : null;
}
