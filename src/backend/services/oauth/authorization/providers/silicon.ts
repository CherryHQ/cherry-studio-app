import * as z from 'zod';

import type { WebviewApiKeyOAuthDefinition } from '../adapters/WebviewApiKeyOAuthAdapter';

const SecretKeyArraySchema = z.array(z.object({ secretKey: z.string().min(1) })).min(1);
const SILICON_CLIENT_ID = 'SFaJLLq0y6CAMoyDm81aMu';

export const siliconOAuthDefinition: WebviewApiKeyOAuthDefinition = {
  allowedOrigins: ['https://account.siliconflow.cn', 'https://cloud.siliconflow.cn'],
  authorizationUrl: () => `https://account.siliconflow.cn/oauth?client_id=${SILICON_CLIENT_ID}`,
  decode: (payload) => SecretKeyArraySchema.safeParse(payload).data?.[0]?.secretKey,
  providerId: 'silicon',
};
