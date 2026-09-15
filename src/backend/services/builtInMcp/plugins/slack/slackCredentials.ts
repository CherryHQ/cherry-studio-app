import * as z from 'zod';

/** A manually supplied user token; bot, app-level and rotating tokens use other prefixes. */
export const SLACK_USER_TOKEN_PATTERN = '^xoxp-\\S+$';

export const SlackTokenCredentialSchema = z.object({
  version: z.literal(1),
  token: z.string().max(16_384).regex(new RegExp(SLACK_USER_TOKEN_PATTERN)),
});
