import * as z from 'zod';

import { FeishuApplicationSchema, FeishuTokensSchema } from './feishuOauth';

export const FeishuUserCredentialSchema = z.object({
  version: z.literal(1),
  application: FeishuApplicationSchema,
  tokens: FeishuTokensSchema,
});
export type FeishuUserCredential = z.infer<typeof FeishuUserCredentialSchema>;

export const FeishuWaitingSchema = z.object({
  status: z.literal('waiting'),
  id: z.string().uuid(),
  stage: z.enum(['registration', 'user']),
  deviceCode: z.string().min(1).max(16_384),
  userCode: z.string().min(1).max(512),
  verificationUrl: z.string().max(4096),
  expiresAt: z.number().finite(),
  intervalMs: z.number().positive(),
  nextPollAt: z.number().finite(),
});

export const FeishuAuthorizationStateSchema = z.object({
  version: z.literal(1),
  application: FeishuApplicationSchema.optional(),
  pending: z
    .discriminatedUnion('status', [
      FeishuWaitingSchema,
      z.object({
        status: z.literal('ready'),
        id: z.string().uuid(),
        credential: FeishuUserCredentialSchema,
      }),
      z.object({
        status: z.enum(['expired', 'denied', 'unsupported-account']),
        id: z.string().uuid(),
      }),
    ])
    .optional(),
});
export type FeishuAuthorizationStoredState = z.infer<typeof FeishuAuthorizationStateSchema>;
