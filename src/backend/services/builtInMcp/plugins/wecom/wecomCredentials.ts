import * as z from 'zod';

import { PluginError } from '@/shared/contracts/plugins';

const HeadersSchema = z
  .record(
    z.string(),
    z
      .string()
      .min(1)
      .max(8192)
      .regex(/^[^\r\n\0]+$/),
  )
  .refine((headers) => {
    const names = Object.keys(headers).map((key) => key.toLowerCase());
    return (
      new Set(names).size === names.length && names.every((key) => ['authorization'].includes(key))
    );
  });
export const WecomEndpointSchema = z
  .string()
  .url()
  .max(8192)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.origin === 'https://qyapi.weixin.qq.com' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      /^\/mcp\/[A-Za-z0-9/_-]+$/.test(url.pathname)
    );
  });
const ConnectionSchema = z.strictObject({
  url: WecomEndpointSchema,
  type: z.enum(['http', 'streamable-http', 'streamableHttp', 'streamableHTTP']).optional(),
  headers: HeadersSchema.optional(),
});
export const WecomCredentialSchema = z
  .strictObject({
    version: z.literal(1),
    connections: z.array(ConnectionSchema).min(1).max(3),
  })
  .refine(
    (value) =>
      new Set(value.connections.map((connection) => connection.url)).size ===
      value.connections.length,
  );
export type WecomConnection = z.infer<typeof ConnectionSchema>;

/** Imports official HTTPS connection data only; never accepts executable MCP configuration. */
export function parseWecomConfig(raw: string) {
  try {
    if (raw.length > 16_384) throw new Error('Too large');
    const value: unknown = raw.trim().startsWith('https://')
      ? { url: raw.trim() }
      : JSON.parse(raw);
    const group = z
      .strictObject({ mcpServers: z.record(z.string(), ConnectionSchema) })
      .safeParse(value);
    const connections = group.success
      ? Object.values(group.data.mcpServers)
      : [ConnectionSchema.parse(value)];
    const parsed = WecomCredentialSchema.parse({ version: 1, connections });
    return {
      version: 1 as const,
      connections: parsed.connections.map((connection) => ({
        url: new URL(connection.url).href,
        ...(connection.headers
          ? {
              headers: Object.fromEntries(
                Object.entries(connection.headers).map(([key, value]) => [
                  key.toLowerCase(),
                  value,
                ]),
              ),
            }
          : {}),
      })),
    };
  } catch {
    throw new PluginError(
      'request',
      'Enter an official Wecom MCP URL or JSON containing up to three supported services.',
    );
  }
}
