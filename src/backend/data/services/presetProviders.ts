import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import type { MobileProviderConfig } from '@/backend/data/services/mobileProviderCatalog';
import type { ApiFeatures, AuthConfig } from '@/shared/data/types/provider';

import {
  buildRuntimeEndpointConfigs,
  projectLegacyApiFeatures,
} from './providerRegistryProjection';
import type { CreateProviderInput } from './ProviderService';

/**
 * The small provider set installed into a fresh database after the registry download.
 * Other downloaded presets can be imported from the provider catalog screen.
 */
export const RECOMMENDED_PRESET_PROVIDER_IDS: readonly string[] = [
  'cherryin',
  'silicon',
  'aihubmix',
  'zhipu',
  'deepseek',
  'openrouter',
  'anthropic',
  'openai',
  'gemini',
];

const recommendedPresetProviderIds = new Set(RECOMMENDED_PRESET_PROVIDER_IDS);

export function isRecommendedPresetProvider(providerId: string): boolean {
  return recommendedPresetProviderIds.has(providerId);
}

function getDefaultChatEndpoint(
  providerId: string,
  presetDefault: MobileProviderConfig['defaultChatEndpoint'],
) {
  if (providerId === 'vertexai') {
    return ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT;
  }

  if (providerId === 'azure-openai') {
    return ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;
  }

  return presetDefault ?? null;
}

function getAuthConfig(providerId: string): AuthConfig | null {
  if (providerId === 'vertexai') {
    return { location: '', project: '', type: 'iam-gcp' };
  }

  if (providerId === 'azure-openai') {
    return { apiVersion: '', type: 'iam-azure' };
  }

  if (providerId === 'aws-bedrock') {
    return { region: '', type: 'iam-aws' };
  }

  return null;
}

function toApiFeatures(provider: MobileProviderConfig): ApiFeatures | null {
  return projectLegacyApiFeatures(provider);
}

export function createPresetProviderInput(provider: MobileProviderConfig): CreateProviderInput {
  return {
    apiFeatures: toApiFeatures(provider),
    authConfig: getAuthConfig(provider.id),
    defaultChatEndpoint: getDefaultChatEndpoint(provider.id, provider.defaultChatEndpoint),
    endpointConfigs: buildRuntimeEndpointConfigs(provider.endpointConfigs),
    name: provider.name,
    presetProviderId: provider.presetProviderId ?? provider.id,
    providerId: provider.id,
  };
}
