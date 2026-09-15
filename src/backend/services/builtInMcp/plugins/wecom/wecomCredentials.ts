import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';

const secret = z
  .string()
  .min(1)
  .max(16_384)
  .regex(/^[^\x00-\x20\x7f]+$/);

export const WecomBotSchema = z.object({
  botId: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[^\x00-\x20\x7f]+$/),
  secret,
});

export const WecomCredentialSchema = WecomBotSchema.extend({
  version: z.literal(1),
  token: secret,
});

export type WecomBot = z.infer<typeof WecomBotSchema>;
export type WecomCredential = z.infer<typeof WecomCredentialSchema>;

export function readWecomCredential(value: unknown): WecomCredential {
  const parsed = WecomCredentialSchema.safeParse(value);
  if (!parsed.success) throw new PluginError('authorization', 'Wecom credentials are unavailable.');
  return parsed.data;
}
