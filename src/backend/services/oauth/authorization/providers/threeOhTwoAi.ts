import * as z from 'zod';

import type { WebviewApiKeyOAuthDefinition } from '../adapters/WebviewApiKeyOAuthAdapter';

const ThreeOhTwoMessageSchema = z.object({
  data: z.object({ apikey: z.string().min(1) }),
});

export const threeOhTwoAiOAuthDefinition: WebviewApiKeyOAuthDefinition = {
  allowedOrigins: ['https://dash.302.ai', 'https://302.ai'],
  authorizationUrl: () => 'https://dash.302.ai/sso/login?app=cherry-ai.com&name=Cherry%20Studio',
  decode: (payload) => ThreeOhTwoMessageSchema.safeParse(payload).data?.data.apikey,
  providerId: '302ai',
};
