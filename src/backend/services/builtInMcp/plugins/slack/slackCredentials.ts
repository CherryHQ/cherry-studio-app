import * as z from 'zod';

// User scopes supported by https://mcp.slack.com/.well-known/oauth-authorization-server
export const SLACK_REQUESTED_SCOPES = [
  'search:read.public',
  'search:read.private',
  'search:read.im',
  'search:read.mpim',
  'search:read.files',
  'search:read.users',
  'channels:read',
  'channels:history',
  'channels:write',
  'groups:read',
  'groups:history',
  'groups:write',
  'im:read',
  'im:history',
  'im:write',
  'mpim:read',
  'mpim:history',
  'mpim:write',
  'users:read',
  'users:read.email',
  'files:read',
  'chat:write',
  'emoji:read',
  'reactions:read',
  'reactions:write',
  'canvases:read',
  'canvases:write',
  'lists:read',
  'lists:write',
] as const;
const secret = z.string().min(1).max(16_384).regex(/^\S+$/);
export const SlackScopeSchema = z
  .string()
  .max(4096)
  .refine((value) => {
    const scopes = value.split(',').map((scope) => scope.trim());
    return (
      scopes.length === SLACK_REQUESTED_SCOPES.length &&
      new Set(scopes).size === scopes.length &&
      SLACK_REQUESTED_SCOPES.every((scope) => scopes.includes(scope))
    );
  });
export const SlackApplicationSchema = z.object({
  version: z.literal(1),
  clientId: z
    .string()
    .max(256)
    .regex(/^\d+\.\d+$/),
  redirectUrl: z.enum([
    'cherrystudio://plugins/slack/callback',
    'cherrystudio-dev://plugins/slack/callback',
    'cherrystudio-preview://plugins/slack/callback',
  ]),
});
export type SlackApplication = z.infer<typeof SlackApplicationSchema>;
export const SlackTokensSchema = z.object({
  accessToken: secret,
  refreshToken: secret,
  expiresAt: z.number().finite(),
  refreshExpiresAt: z.number().finite(),
  scope: SlackScopeSchema,
});
export type SlackTokens = z.infer<typeof SlackTokensSchema>;
export const SlackUserCredentialSchema = z.object({
  version: z.literal(1),
  application: SlackApplicationSchema,
  tokens: SlackTokensSchema,
  account: z.object({
    id: z
      .string()
      .max(256)
      .regex(/^[A-Z0-9]+:[A-Z0-9]+$/),
    label: z.string().min(1).max(512),
  }),
  rejected: z.boolean().optional(),
});
export type SlackUserCredential = z.infer<typeof SlackUserCredentialSchema>;
