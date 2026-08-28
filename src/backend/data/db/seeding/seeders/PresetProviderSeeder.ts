import type { ProtoProviderConfig } from '@cherrystudio/provider-registry';
import { buildRuntimeEndpointConfigs, ENDPOINT_TYPE } from '@cherrystudio/provider-registry';

import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import { type CreateProviderInput, providerService } from '@/backend/data/services/ProviderService';
import type { ApiFeatures, AuthConfig } from '@/shared/data/types/provider';

import type { DatabaseSeeder } from '../types';

function getSeedDefaultChatEndpoint(
  providerId: string,
  presetDefault: ProtoProviderConfig['defaultChatEndpoint'],
) {
  if (providerId === 'vertexai') {
    return ENDPOINT_TYPE.GOOGLE_GENERATE_CONTENT;
  }

  if (providerId === 'azure-openai') {
    return ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS;
  }

  return presetDefault ?? null;
}

function getSeedAuthConfig(providerId: string): AuthConfig | null {
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

function toApiFeatures(provider: ProtoProviderConfig): ApiFeatures | null {
  if (!provider.apiFeatures) {
    return null;
  }

  return {
    arrayContent: provider.apiFeatures.arrayContent,
    reportsActualCost: provider.apiFeatures.reportsActualCost,
    serviceTier: provider.apiFeatures.serviceTier,
    streamOptions: provider.apiFeatures.streamOptions,
    verbosity: provider.apiFeatures.verbosity,
  };
}

function toProviderInput(provider: ProtoProviderConfig): CreateProviderInput {
  return {
    apiFeatures: toApiFeatures(provider),
    authConfig: getSeedAuthConfig(provider.id),
    defaultChatEndpoint: getSeedDefaultChatEndpoint(provider.id, provider.defaultChatEndpoint),
    endpointConfigs: buildRuntimeEndpointConfigs(provider.endpointConfigs),
    name: provider.name,
    presetProviderId: provider.presetProviderId ?? provider.id,
    providerId: provider.id,
  };
}

export class PresetProviderSeeder implements DatabaseSeeder {
  readonly name = 'preset-provider';
  readonly description = 'Insert preset provider configurations';

  get version() {
    return `${providerRegistryService.getProvidersVersion()}+adapter-family.1`;
  }

  async run(_dbService: Parameters<DatabaseSeeder['run']>[0]) {
    const rows = providerRegistryService.loadProviders().map(toProviderInput);
    await providerService.batchUpsert(rows);
  }
}
