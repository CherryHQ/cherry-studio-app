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

// Version 4 uses the official CLI gateway. Old MCP grants require reconnection.
export const WecomCredentialSchema = WecomBotSchema.extend({
  version: z.literal(4),
  kind: z.literal('bot'),
  token: secret,
});

export type WecomBot = z.infer<typeof WecomBotSchema>;
export type WecomCredential = z.infer<typeof WecomCredentialSchema>;

export function readWecomCredential(value: unknown): WecomCredential {
  const parsed = WecomCredentialSchema.safeParse(value);
  if (!parsed.success)
    throw new PluginError('authorization', 'Reconnect Wecom to authorize its current services.');
  return parsed.data;
}
