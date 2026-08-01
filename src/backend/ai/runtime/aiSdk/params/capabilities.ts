import type { WebSearchPluginConfig } from '@cherrystudio/ai-core/built-in/plugins';
import { extensionRegistry } from '@cherrystudio/ai-core/provider';

import type { PreferenceService } from '@/backend/data/PreferenceService';
import type { Assistant } from '@/shared/data/types/assistant';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import {
  isAnthropicModel,
  isForcedNativeWebSearchModel,
  isGeminiModel,
  isGrokModel,
  isOpenAIModel,
} from '@/shared/utils/model';

import type { AppProviderId } from '../../../types';
import { SystemProviderIds } from '../../../utils/providerIds';
import {
  buildProviderBuiltinWebSearchConfig,
  type CherryWebSearchConfig,
} from '../../../utils/websearch';

export interface ResolvedCapabilities {
  enableReasoning: boolean;
  enableWebSearch: boolean;
  enableUrlContext: boolean;
  enableGenerateImage: boolean;
  streamOutput: boolean;
  webSearchPluginConfig?: WebSearchPluginConfig;
}

export function resolveCapabilities(
  model: Model,
  provider: Provider,
  assistant: Assistant,
  aiSdkProviderId: string,
  preference: Pick<PreferenceService, 'getMultipleRawCached'>,
  options: { webSearchProviderId?: string } = {},
): ResolvedCapabilities {
  const enableReasoning = Boolean(
    model.reasoning && assistant.settings?.reasoning_effort !== undefined,
  );
  const enableWebSearch = Boolean(
    !options.webSearchProviderId &&
    ((assistant.settings?.enableWebSearch && model.capabilities.includes('web-search')) ||
      isForcedNativeWebSearchModel(model)),
  );
  const enableGenerateImage = model.capabilities.includes('image-generation');
  const streamOutput = assistant.settings.streamOutput !== false;

  const webSearchPluginConfig = enableWebSearch
    ? resolveWebSearchPluginConfig(model, provider, aiSdkProviderId, preference)
    : undefined;

  return {
    enableReasoning,
    enableWebSearch,
    enableUrlContext: false,
    enableGenerateImage,
    streamOutput,
    webSearchPluginConfig,
  };
}

function resolveWebSearchPluginConfig(
  model: Model,
  provider: Provider,
  aiSdkProviderId: string,
  preference: Pick<PreferenceService, 'getMultipleRawCached'>,
): WebSearchPluginConfig | undefined {
  const webSearchPreferences = preference.getMultipleRawCached([
    'chat.web_search.max_results',
    'chat.web_search.exclude_domains',
  ]);
  const webSearchConfig: CherryWebSearchConfig = {
    maxResults: webSearchPreferences['chat.web_search.max_results'],
    excludeDomains: webSearchPreferences['chat.web_search.exclude_domains'],
  };

  if (extensionRegistry.has(aiSdkProviderId)) {
    return buildProviderBuiltinWebSearchConfig(aiSdkProviderId, webSearchConfig, model);
  }

  if (
    provider.id === SystemProviderIds.gateway ||
    provider.presetProviderId === SystemProviderIds.gateway
  ) {
    const gatewayProviderId = mapVertexAIGatewayModelToProviderId(model);
    if (gatewayProviderId) {
      return buildProviderBuiltinWebSearchConfig(gatewayProviderId, webSearchConfig, model);
    }
  }

  return undefined;
}

function mapVertexAIGatewayModelToProviderId(model: Model): AppProviderId | undefined {
  if (isAnthropicModel(model)) return 'anthropic';
  if (isGeminiModel(model)) return 'google';
  if (isGrokModel(model)) return 'xai';
  if (isOpenAIModel(model)) return 'openai';
  return undefined;
}
