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

/** The official service owns its MCP paths; category is separate configuration metadata. */
function parseMcpUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    if (
      url.origin === 'https://qyapi.weixin.qq.com' &&
      url.pathname.startsWith('/mcp/') &&
      url.pathname.length > '/mcp/'.length &&
      !url.username &&
      !url.password &&
      !url.hash
    )
      return url;
  } catch {}
  return undefined;
}

/** Only known imported paths imply reviewed categories. Other imports receive neutral names. */
function inferMcpCategory(value: string): string | undefined {
  const path = parseMcpUrl(value)?.pathname;
  // Enterprise endpoint: https://github.com/WecomTeam/wecom-cli/issues/64
  const category = path === '/mcp/robot-doc' ? 'doc' : path?.match(/^\/mcp\/bot\/([^/]+)$/)?.[1];
  return WecomCategorySchema.safeParse(category).success ? category : undefined;
}

export const WecomMcpUrlSchema = z
  .string()
  .trim()
  .max(8192)
  .refine((value) => !!parseMcpUrl(value));
export const WecomMcpConnectionSchema = z.object({
  category: WecomCategorySchema,
  url: WecomMcpUrlSchema,
});
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
      connections: servers.map(({ url }, index) => ({
        category: inferMcpCategory(url) ?? `service_${index + 1}`,
        url,
      })),
    });
  } catch {
    throw new PluginError('request', 'Paste an official Wecom MCP URL or JSON configuration.');
  }
}
