import { CHERRYIN_PROVIDER_ID } from '../CherryInOAuthConfig';
import type {
  OAuthRuntimeProviderRepository,
  OAuthRuntimeService,
} from '../runtime/OAuthRuntimeService';
import type { OAuthRuntimeProviderDefinition, OAuthTokenStore } from '../runtime/types';
import { BlockedOAuthAdapter } from './adapters/BlockedOAuthAdapter';
import { CopilotOAuthAdapter } from './adapters/CopilotOAuthAdapter';
import { PkceSessionOAuthAdapter } from './adapters/PkceSessionOAuthAdapter';
import { PpioOAuthAdapter } from './adapters/PpioOAuthAdapter';
import { WebviewApiKeyOAuthAdapter } from './adapters/WebviewApiKeyOAuthAdapter';
import { OAuthApiKeyStore } from './OAuthApiKeyStore';
import { toOAuthFlowRegistry, type OAuthFlowRegistry } from './OAuthFlowRegistry';
import { createAiHubMixOAuthDefinition } from './providers/aiHubMix';
import { aiOnlyOAuthDefinition } from './providers/aiOnly';
import { siliconOAuthDefinition } from './providers/silicon';
import { threeOhTwoAiOAuthDefinition } from './providers/threeOhTwoAi';

export type OAuthRuntimeSecrets = {
  aihubmix?: string;
  ppio?: string;
};

export function createOAuthFlowRegistry(input: {
  apiKeys: OAuthApiKeyStore;
  definitions: Record<string, OAuthRuntimeProviderDefinition>;
  fetch: typeof globalThis.fetch;
  providers: OAuthRuntimeProviderRepository;
  runtime: OAuthRuntimeService;
  secrets?: OAuthRuntimeSecrets;
  tokenStore: OAuthTokenStore;
}): { copilot: CopilotOAuthAdapter; registry: OAuthFlowRegistry } {
  const cherryin = input.definitions[CHERRYIN_PROVIDER_ID];
  if (!cherryin) throw new Error('CherryIN OAuth definition is missing');

  const secrets = input.secrets ?? {
    aihubmix: process.env.EXPO_PUBLIC_AIHUBMIX_SECRET,
    ppio: process.env.EXPO_PUBLIC_PPIO_APP_SECRET,
  };
  const copilot = new CopilotOAuthAdapter(input.fetch, input.tokenStore, input.providers);
  const webviewDefinitions = [
    threeOhTwoAiOAuthDefinition,
    createAiHubMixOAuthDefinition(secrets.aihubmix),
    aiOnlyOAuthDefinition,
    siliconOAuthDefinition,
  ];

  const adapters = [
    new PkceSessionOAuthAdapter(cherryin, input.runtime),
    copilot,
    new PpioOAuthAdapter(input.fetch, secrets.ppio, input.apiKeys, input.providers),
    ...webviewDefinitions.map(
      (definition) => new WebviewApiKeyOAuthAdapter(definition, input.apiKeys, input.providers),
    ),
    new BlockedOAuthAdapter('grok-cli'),
    new BlockedOAuthAdapter('openai-codex'),
  ];

  return {
    copilot,
    registry: toOAuthFlowRegistry(adapters),
  };
}
