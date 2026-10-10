import * as z from 'zod';

const token = z.string().min(1).max(16_384).regex(/^\S+$/);

/**
 * A native-app redirect target. Custom URL schemes are not accepted by
 * `z.url()`, so the shape is pinned by pattern instead.
 */
export const NativeRedirectSchema = z
  .string()
  .max(512)
  .regex(/^cherrystudio(?:-dev|-preview)?:\/\/plugins\/[a-z0-9._-]+\/callback$/);

export const McpOAuthTokensSchema = z.object({
  accessToken: token,
  refreshToken: token.optional(),
  tokenType: z.string().min(1).max(64),
  /** Epoch millis; absent for non-expiring tokens. */
  expiresAt: z.number().finite().optional(),
  refreshExpiresAt: z.number().finite().optional(),
});
export type McpOAuthTokens = z.infer<typeof McpOAuthTokensSchema>;

export const McpOAuthApplicationSchema = z.object({
  version: z.literal(1),
  clientId: token,
  clientSecret: token.optional(),
  authorizationEndpoint: z.string().url().max(2048),
  tokenEndpoint: z.string().url().max(2048),
  redirectUrl: NativeRedirectSchema,
});
export type McpOAuthApplication = z.infer<typeof McpOAuthApplicationSchema>;

export const McpOAuthCredentialSchema = z.object({
  version: z.literal(1),
  application: McpOAuthApplicationSchema,
  tokens: McpOAuthTokensSchema,
  account: z.object({ id: z.string().min(1).max(512), label: z.string().min(1).max(512) }),
  rejected: z.boolean().optional(),
});
export type McpOAuthCredential = z.infer<typeof McpOAuthCredentialSchema>;
