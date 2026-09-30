import type { ProviderAccountIdentity } from '@/shared/contracts/providerAccounts';

/** Only these presets have a mobile implementation; catalog OAuth flags alone grant no support. */
const PI_OAUTH_PROVIDERS = {
  copilot: 'github-copilot',
  'openai-codex': 'openai-codex',
  'kimi-coding': 'kimi-coding',
  grok: 'xai',
  openrouter: 'openrouter',
} as const;

export type PiOAuthProviderId = (typeof PI_OAUTH_PROVIDERS)[keyof typeof PI_OAUTH_PROVIDERS];

export function getPiOAuthProviderId(
  provider: ProviderAccountIdentity,
): PiOAuthProviderId | undefined {
  const presetId = provider.presetProviderId ?? provider.id;
  return Object.hasOwn(PI_OAUTH_PROVIDERS, presetId)
    ? PI_OAUTH_PROVIDERS[presetId as keyof typeof PI_OAUTH_PROVIDERS]
    : undefined;
}
