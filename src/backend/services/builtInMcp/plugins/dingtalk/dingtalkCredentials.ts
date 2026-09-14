import * as z from 'zod';

const secret = z
  .string()
  .min(1)
  .max(16_384)
  .regex(/^[^\r\n\0]+$/);
const identifier = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[^\s\u0000-\u001f]+$/);
export const DingtalkAccountSchema = z.object({
  corpId: identifier,
  corpName: z.string().max(256).optional(),
  userId: identifier.optional(),
  userName: z.string().max(256).optional(),
});
export const DingtalkTokensSchema = z.object({
  accessToken: secret,
  refreshToken: secret,
  expiresAt: z.number().int().positive(),
  refreshExpiresAt: z.number().int().positive(),
});
export const DingtalkUserCredentialSchema = z.object({
  version: z.literal(1),
  clientId: identifier,
  clientSecret: secret.optional(),
  tokens: DingtalkTokensSchema,
  account: DingtalkAccountSchema,
  rejected: z.boolean().optional(),
});
export type DingtalkAccount = z.infer<typeof DingtalkAccountSchema>;
export type DingtalkTokens = z.infer<typeof DingtalkTokensSchema>;
export type DingtalkUserCredential = z.infer<typeof DingtalkUserCredentialSchema>;

export function dingtalkAccountLabel(account: DingtalkAccount): string {
  const organization = account.corpName || account.corpId;
  const user = account.userName || account.userId;
  return user ? `${user} · ${organization}` : organization;
}

/** Unknown user identity cannot prove a same-account reconnection within an organization. */
export function isSameDingtalkAccount(left: DingtalkAccount, right: DingtalkAccount): boolean {
  return !!left.userId && left.corpId === right.corpId && left.userId === right.userId;
}
