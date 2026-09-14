import * as z from 'zod';

const token = z.string().min(1).max(16_384).regex(/^\S+$/);

/** OAuth endpoints must remain on Notion's MCP host, including restored registrations. */
export const NotionEndpointSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.origin === 'https://mcp.notion.com' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search
    );
  });

export const NotionApplicationSchema = z.object({
  version: z.literal(1),
  clientId: token,
  authorizationEndpoint: NotionEndpointSchema,
  tokenEndpoint: NotionEndpointSchema,
  redirectUrl: z.enum([
    'cherrystudio://plugins/notion/callback',
    'cherrystudio-dev://plugins/notion/callback',
    'cherrystudio-preview://plugins/notion/callback',
  ]),
});
export type NotionApplication = z.infer<typeof NotionApplicationSchema>;

export const NotionTokensSchema = z.object({
  accessToken: token,
  refreshToken: token,
  expiresAt: z.number().finite(),
  refreshExpiresAt: z.number().finite().optional(),
});
export type NotionTokens = z.infer<typeof NotionTokensSchema>;

export const NotionUserCredentialSchema = z.object({
  version: z.literal(1),
  application: NotionApplicationSchema,
  tokens: NotionTokensSchema,
  account: z.object({ id: z.string().min(1).max(256), label: z.string().min(1).max(512) }),
  rejected: z.boolean().optional(),
});
export type NotionUserCredential = z.infer<typeof NotionUserCredentialSchema>;
