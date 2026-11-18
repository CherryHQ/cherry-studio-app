import * as z from 'zod';

export const MemoryCandidateSchema = z.strictObject({
  text: z.string().trim().min(1).max(1000),
  subject: z.string().trim().min(1).max(200),
  scope: z.enum(['personal', 'project', 'customer', 'uncertain']),
  kind: z.enum([
    'preference',
    'personal_fact',
    'decision',
    'constraint',
    'experience',
    'uncertain',
  ]),
  conditions: z.string().max(500),
  time: z.string().max(200),
  usefulness: z.string().trim().min(1).max(500),
  action: z.enum(['add', 'exists', 'conflict', 'insufficient', 'omit', 'out_of_scope']),
  reason: z.string().trim().min(1).max(500),
  evidence: z
    .array(
      z.strictObject({
        messageId: z.string().min(1),
        version: z.string().min(1),
        quote: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(12),
  existing: z
    .array(
      z.strictObject({
        path: z.string().min(1),
        version: z.string().nullable(),
        quote: z.string().min(1).max(2000),
      }),
    )
    .max(10),
});

export type MemoryCandidate = z.infer<typeof MemoryCandidateSchema>;
