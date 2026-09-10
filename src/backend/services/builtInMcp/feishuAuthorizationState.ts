import * as z from 'zod';

import { FeishuApplicationSchema, FeishuTokensSchema } from './feishuOauth';

export const FeishuUserCredentialSchema = z.object({
  version: z.literal(1),
  application: FeishuApplicationSchema,
  tokens: FeishuTokensSchema,
});
export type FeishuUserCredential = z.infer<typeof FeishuUserCredentialSchema>;
