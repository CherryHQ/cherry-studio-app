import { generateSignature } from '@/backend/ai/provider/cherryai';
import { isManagedCherryAiProviderId } from '@/shared/data/presets/cherryai';
import type { Provider } from '@/shared/data/types/provider';

export type ProviderFetch = typeof globalThis.fetch;

export interface ProviderLanguageTransportPolicy {
  wrapFetch(baseFetch: ProviderFetch): ProviderFetch;
}

interface ProviderLanguageTransportPolicyRegistration {
  matches(provider: Provider): boolean;
  policy: ProviderLanguageTransportPolicy;
}

const CHERRY_AI_LANGUAGE_TRANSPORT_POLICY: ProviderLanguageTransportPolicy = {
  wrapFetch: (baseFetch) => async (input, init) => {
    const signature = generateSignature({
      method: 'POST',
      path: '/chat/completions',
      query: '',
      body: getJsonBody(init?.body),
    });
    return baseFetch(input, {
      ...init,
      headers: { ...init?.headers, ...signature },
    });
  },
};

const PROVIDER_LANGUAGE_TRANSPORT_POLICIES: readonly ProviderLanguageTransportPolicyRegistration[] =
  [
    {
      matches: (provider) =>
        isManagedCherryAiProviderId(provider.id) ||
        isManagedCherryAiProviderId(provider.presetProviderId ?? ''),
      policy: CHERRY_AI_LANGUAGE_TRANSPORT_POLICY,
    },
  ];

/** Resolve shared Provider-specific language HTTP behavior without selecting user credentials. */
export function resolveProviderLanguageTransportPolicy(
  provider: Provider,
): ProviderLanguageTransportPolicy | undefined {
  return PROVIDER_LANGUAGE_TRANSPORT_POLICIES.find((registration) => registration.matches(provider))
    ?.policy;
}

function getJsonBody(body: BodyInit | null | undefined): Record<string, unknown> | undefined {
  if (typeof body !== 'string') {
    return undefined;
  }

  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
