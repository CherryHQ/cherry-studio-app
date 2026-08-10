import {
  createSignatureGenerator,
  SignatureClient,
  type SignatureHeaders,
  type SignatureOptions,
} from '@cherrystudio/ai-runtime/provider';

export { SignatureClient };
export type { SignatureHeaders, SignatureOptions };

export const generateSignature = createSignatureGenerator(
  process.env.EXPO_PUBLIC_CHERRYAI_CLIENT_SECRET ?? '',
);
