import * as z from 'zod';

import type { PluginCredentialField } from '@/shared/data/types/plugin';

const secret = z.string().min(1).max(16_384);
export const FeishuApplicationSchema = z.object({
  appId: z
    .string()
    .regex(/^cli_[a-zA-Z0-9]+$/)
    .max(128),
  appSecret: secret,
});
export type FeishuApplication = z.infer<typeof FeishuApplicationSchema>;
export const FeishuTokensSchema = z.object({
  accessToken: secret,
  refreshToken: secret.optional(),
  expiresAt: z.number().finite(),
  refreshExpiresAt: z.number().finite(),
  scope: z.string().max(16_384),
});
export type FeishuTokens = z.infer<typeof FeishuTokensSchema>;

export const FEISHU_CREDENTIAL_FIELDS = [
  { id: 'appId', secret: false, maxLength: 128, pattern: '^cli_[a-zA-Z0-9]+$' },
  { id: 'appSecret', secret: true, maxLength: 4096, pattern: '^\\S+$' },
] as const satisfies readonly PluginCredentialField[];

export const FeishuUserCredentialSchema = z.object({
  version: z.literal(1),
  application: FeishuApplicationSchema,
  tokens: FeishuTokensSchema,
});
export type FeishuUserCredential = z.infer<typeof FeishuUserCredentialSchema>;
