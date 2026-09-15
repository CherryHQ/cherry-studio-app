import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';

const secret = z
  .string()
  .min(1)
  .max(16_384)
  .regex(/^[^\r\n\0]+$/);
export const WecomCategorySchema = z
  .string()
  .max(64)
  .regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/);

/** Official permission pages export /mcp/bot/<category> URLs with private query credentials. */
function parseMcpUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    const category = url.pathname.match(/^\/mcp\/bot\/([^/]+)$/)?.[1];
    if (
      url.origin === 'https://qyapi.weixin.qq.com' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      WecomCategorySchema.safeParse(category).success
    )
      return url;
  } catch {}
  return undefined;
}

export const WecomMcpUrlSchema = z
  .string()
  .trim()
  .max(8192)
  .refine((value) => !!parseMcpUrl(value));
export const WecomMcpConnectionSchema = z
  .object({
    category: WecomCategorySchema,
    url: WecomMcpUrlSchema,
  })
  .refine(({ category, url }) => new URL(url).pathname === `/mcp/bot/${category}`);
const ConnectionsSchema = z
  .array(WecomMcpConnectionSchema)
  .min(1)
  .max(32)
  .refine(
    (connections) =>
      new Set(connections.map(({ category }) => category)).size === connections.length,
  );
export type WecomMcpConnection = z.infer<typeof WecomMcpConnectionSchema>;

export const WecomBotSchema = z.object({
  botId: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[^\x00-\x1f\x7f]+$/),
  secret,
});
export const WecomBotCredentialSchema = WecomBotSchema.extend({
  version: z.literal(3),
  kind: z.literal('bot'),
  configId: z.string().min(1),
  connections: ConnectionsSchema,
});
const ImportedCredentialSchema = z.object({
  version: z.literal(3),
  kind: z.literal('mcp'),
  connections: ConnectionsSchema,
});
export const WecomCredentialSchema = z.discriminatedUnion('kind', [
  WecomBotCredentialSchema,
  ImportedCredentialSchema,
]);
export type WecomBot = z.infer<typeof WecomBotSchema>;
export type WecomBotCredential = z.infer<typeof WecomBotCredentialSchema>;
export type WecomCredential = z.infer<typeof WecomCredentialSchema>;

export function readWecomCredential(value: unknown): WecomCredential {
  const parsed = WecomCredentialSchema.safeParse(value);
  if (!parsed.success)
    throw new PluginError('authorization', 'Reconnect Wecom to authorize official MCP access.');
  return parsed.data;
}

/** Accept the official URL or JSON export; never execute commands or accept custom hosts/headers. */
export function importWecomMcpConfig(value: string): WecomCredential {
  try {
    const text = value.trim();
    const config: unknown = text.startsWith('{') ? JSON.parse(text) : { url: text };
    const ServerSchema = z.strictObject({
      type: z.enum(['streamable-http', 'http']).optional(),
      url: WecomMcpUrlSchema,
    });
    const servers = z
      .union([
        z
          .strictObject({ mcpServers: z.record(z.string(), ServerSchema) })
          .transform(({ mcpServers }) => Object.values(mcpServers)),
        ServerSchema.transform((server) => [server]),
      ])
      .parse(config);
    return ImportedCredentialSchema.parse({
      version: 3,
      kind: 'mcp',
      connections: servers.map(({ url }) => ({
        category: new URL(url).pathname.split('/').at(-1),
        url,
      })),
    });
  } catch {
    throw new PluginError('request', 'Paste an official Wecom MCP URL or JSON configuration.');
  }
}
