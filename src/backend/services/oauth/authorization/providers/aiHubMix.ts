import { AES, CBC, CipherParams, Hex, Pkcs7, Utf8 } from 'crypto-es';
import * as z from 'zod';

import { OAuthServiceError } from '@/shared/oauth';

import type { WebviewApiKeyOAuthDefinition } from '../adapters/WebviewApiKeyOAuthAdapter';

const AiHubMixMessageSchema = z.object({
  data: z.object({ encryptedData: z.string().min(1), iv: z.string().min(1) }),
  key: z.literal('cherry_studio_oauth_callback'),
});
const AiHubMixDecryptedSchema = z.object({
  api_keys: z.array(z.object({ value: z.string().min(1) })).min(1),
});

export function createAiHubMixOAuthDefinition(
  secret: string | undefined,
): WebviewApiKeyOAuthDefinition {
  return {
    allowedOrigins: ['https://console.inferera.com'],
    authorizationUrl: (language) =>
      `https://console.inferera.com/token?client_id=cherry_studio_oauth&lang=${encodeURIComponent(language)}&aff=SJyh`,
    ...(secret ? {} : { configurationIssue: 'missing-aihubmix-secret' as const }),
    decode: (payload) => {
      const message = AiHubMixMessageSchema.safeParse(payload);
      if (!message.success) return undefined;
      if (!secret) {
        throw new OAuthServiceError(
          'AiHubMix OAuth is unavailable in this build',
          undefined,
          'OAuthProviderNotConfigured',
        );
      }

      try {
        const plaintext = AES.decrypt(
          new CipherParams({ ciphertext: Hex.parse(message.data.data.encryptedData) }),
          Utf8.parse(secret),
          { iv: Hex.parse(message.data.data.iv), mode: CBC, padding: Pkcs7 },
        ).toString(Utf8);
        return AiHubMixDecryptedSchema.parse(JSON.parse(plaintext)).api_keys[0].value;
      } catch (error) {
        throw new OAuthServiceError(
          'AiHubMix OAuth response could not be decrypted',
          error,
          'InvalidWebviewMessage',
        );
      }
    },
    providerId: 'aihubmix',
  };
}
