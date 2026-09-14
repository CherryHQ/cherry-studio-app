import * as z from 'zod';

export const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

/** Google owns renewal credentials; only the short-lived access token crosses the native bridge. */
export const GmailTokensSchema = z.object({
  accessToken: z.string().min(1).max(16_384).regex(/^\S+$/),
  scope: z.literal(GMAIL_READ_SCOPE),
});
export type GmailTokens = z.infer<typeof GmailTokensSchema>;

export const GmailUserCredentialSchema = z.object({
  version: z.literal(1),
  tokens: GmailTokensSchema,
  account: z.object({ id: z.email().max(320), label: z.email().max(320) }),
  rejected: z.boolean().optional(),
});
export type GmailUserCredential = z.infer<typeof GmailUserCredentialSchema>;
