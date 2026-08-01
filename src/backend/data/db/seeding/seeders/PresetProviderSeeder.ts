import type { ProtoProviderConfig } from '@cherrystudio/provider-registry';
import { buildRuntimeEndpointConfigs, ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import type { ApiFeatures, AuthConfig } from '@cherrystudio/universal/data/types/provider';

import type { CacheService } from '@/backend/data/CacheService';
import { PinService } from '@/backend/data/services/PinService';
import { providerRegistryService } from '@/backend/data/services/ProviderRegistryService';
import { type CreateProviderInput, ProviderService } from '@/backend/data/services/ProviderService';

import type { DatabaseSeeder } from '../types';

const cherryAiProviderId = 'cherryai';

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
    developerRole: provider.apiFeatures.developerRole,
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
  constructor(private readonly cacheService: CacheService) {}

  readonly name = 'preset-provider';
  readonly description = 'Insert preset provider configurations';

  get version() {
    return `${providerRegistryService.getProvidersVersion()}+adapter-family.1+cherryai-enabled.1`;
  }

  async run(dbService: Parameters<DatabaseSeeder['run']>[0]) {
    const rows = providerRegistryService.loadProviders().map(toProviderInput);
    rows.push({
      authConfig: null,
      defaultChatEndpoint: ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS,
      endpointConfigs: {
        [ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS]: {
          baseUrl: 'https://api.cherry-ai.com',
        },
      },
      name: 'CherryAI',
      presetProviderId: cherryAiProviderId,
      providerId: cherryAiProviderId,
    });

    const providerService = new ProviderService(
      dbService,
      new PinService(dbService),
      this.cacheService,
    );
    await providerService.batchUpsert(rows);

    // CherryAI is Cherry's own built-in service rather than something the user
    // configures: it is hidden from the provider list (`hiddenProviderListIds`)
    // and exposes no Base URL or API key, so the "new providers start disabled
    // until a flow confirms usable models" rule baked into `toInsert` would
    // strand its free models forever. Desktop ships `CHERRYAI_PROVIDER` with
    // `enabled: true` unconditionally, so force it on here — this also repairs
    // installs seeded before this version, where `batchUpsert` deliberately
    // leaves an existing row's `isEnabled` alone.
    await providerService.update(cherryAiProviderId, { isEnabled: true });
  }
}
