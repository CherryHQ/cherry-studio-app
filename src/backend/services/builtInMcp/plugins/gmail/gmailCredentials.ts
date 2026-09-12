import * as z from 'zod';

export const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
const secret = z.string().min(1).max(16_384).regex(/^\S+$/);

/** The user owns this HTTPS page; it receives a code, never an access token or client secret. */
export const GmailCallbackPageSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.hash &&
      !url.search &&
      url.hostname.includes('.')
    );
  });
export const GmailApplicationSchema = z.object({
  version: z.literal(1),
  clientId: z
    .string()
    .max(256)
    .regex(/^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/),
  clientSecret: secret,
  oauthRedirectUrl: GmailCallbackPageSchema,
  redirectUrl: z.enum([
    'cherrystudio://plugins/gmail/callback',
    'cherrystudio-dev://plugins/gmail/callback',
    'cherrystudio-preview://plugins/gmail/callback',
  ]),
});
export type GmailApplication = z.infer<typeof GmailApplicationSchema>;

export const GmailTokensSchema = z.object({
  accessToken: secret,
  refreshToken: secret,
  expiresAt: z.number().finite(),
  refreshExpiresAt: z.number().finite().optional(),
  scope: z.literal(GMAIL_READ_SCOPE),
});
export type GmailTokens = z.infer<typeof GmailTokensSchema>;

export const GmailUserCredentialSchema = z.object({
  version: z.literal(1),
  application: GmailApplicationSchema,
  tokens: GmailTokensSchema,
  account: z.object({ id: z.email().max(320), label: z.email().max(320) }),
  rejected: z.boolean().optional(),
});
export type GmailUserCredential = z.infer<typeof GmailUserCredentialSchema>;
