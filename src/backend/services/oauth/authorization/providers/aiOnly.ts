import * as z from 'zod';

import type { WebviewApiKeyOAuthDefinition } from '../adapters/WebviewApiKeyOAuthAdapter';

const SecretKeyArraySchema = z.array(z.object({ secretKey: z.string().min(1) })).min(1);

export const aiOnlyOAuthDefinition: WebviewApiKeyOAuthDefinition = {
  allowedOrigins: ['https://maas.aiionly.com', 'https://aiionly.com'],
  authorizationUrl: () =>
    'https://maas.aiionly.com/login?inviteCode=1755481173663DrZBBOC0&cherryCode=01',
  decode: (payload) => SecretKeyArraySchema.safeParse(payload).data?.[0]?.secretKey,
  providerId: 'aionly',
};
