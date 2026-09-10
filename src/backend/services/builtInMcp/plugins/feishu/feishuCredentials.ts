import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';
import type { PluginCredentialField } from '@/shared/data/types/plugin';
import { createPluginCredentialsSchema } from '@/shared/utils/pluginCredentials';

import type { PluginCredential } from '../../authorization/pluginCredential';

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

const FeishuAppCredentialsSchema = createPluginCredentialsSchema(FEISHU_CREDENTIAL_FIELDS).extend({
  version: z.literal(1),
});

export function parseFeishuAppCredentials(credential: PluginCredential) {
  try {
    return FeishuAppCredentialsSchema.parse(credential);
  } catch {
    throw new PluginError('authorization', 'The Feishu application credentials are invalid.');
  }
}

export const FeishuUserCredentialSchema = z.object({
  version: z.literal(1),
  application: FeishuApplicationSchema,
  tokens: FeishuTokensSchema,
});
export type FeishuUserCredential = z.infer<typeof FeishuUserCredentialSchema>;
