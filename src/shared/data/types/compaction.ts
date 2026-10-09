import * as z from 'zod';

import type { CompactionAnchorData } from './uiParts';

/** Serialized fields follow Desktop's CompactionAnchorData. */
export const CompactionAnchorDataSchema: z.ZodType<CompactionAnchorData> = z.strictObject({
  status: z.enum(['compacting', 'done', 'skipped']),
  phase: z.enum(['turn-start', 'in-loop', 'agent-session']),
  trigger: z.enum(['manual', 'auto']).optional(),
  startedAt: z.iso.datetime().optional(),
  completedAt: z.iso.datetime().optional(),
  preTokens: z.number().nonnegative().optional(),
  postTokens: z.number().nonnegative().optional(),
  durationMs: z.number().nonnegative().optional(),
  foldedCount: z.number().int().nonnegative().optional(),
});
