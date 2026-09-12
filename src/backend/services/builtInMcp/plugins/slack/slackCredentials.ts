import * as z from 'zod';

export const SLACK_READ_SCOPES = [
  'search:read',
  'channels:read',
  'channels:history',
  'groups:read',
  'groups:history',
  'im:read',
  'im:history',
  'mpim:read',
  'mpim:history',
  'users:read',
] as const;
const secret = z.string().min(1).max(16_384).regex(/^\S+$/);
export const SlackScopeSchema = z
  .string()
  .max(4096)
  .refine((value) => {
    const scopes = value.split(',').map((scope) => scope.trim());
    return (
      scopes.length === SLACK_READ_SCOPES.length &&
      new Set(scopes).size === scopes.length &&
      SLACK_READ_SCOPES.every((scope) => scopes.includes(scope))
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
