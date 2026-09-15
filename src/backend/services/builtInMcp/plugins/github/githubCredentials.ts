import * as z from 'zod';

import { GithubApplicationSchema, GithubTokensSchema } from './githubOauth';

export const GithubTokenCredentialSchema = z.object({
  version: z.literal(1),
  token: z.string().min(1).max(4096),
});
export const GithubUserCredentialSchema = z.object({
  version: z.literal(1),
  application: GithubApplicationSchema,
  tokens: GithubTokensSchema,
  account: z.object({ id: z.string().regex(/^[0-9]+$/), login: z.string().min(1).max(100) }),
  rejected: z.boolean().optional(),
});
export type GithubUserCredential = z.infer<typeof GithubUserCredentialSchema>;
