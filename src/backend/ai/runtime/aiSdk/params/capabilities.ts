import type { WebSearchPluginConfig } from '@cherrystudio/ai-core/built-in/plugins';
import { extensionRegistry } from '@cherrystudio/ai-core/provider';
import type { AppProviderId } from '@cherrystudio/ai-runtime/provider';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import {
  isAnthropicModel,
  isGeminiModel,
  isGrokModel,
  isOpenAIModel,
  isOpenRouterBuiltInWebSearchModel,
  isWebSearchModel,
} from '@cherrystudio/universal/utils/model';

import type { PreferenceService } from '@/backend/data/PreferenceService';

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

export interface ResolveCapabilitiesOptions {
  /** Caller-supplied external web search provider id. When set, disables built-in web search. */
  webSearchProviderId?: string;
}

export function resolveCapabilities(
  model: Model,
  provider: Provider,
  assistant: Assistant,
  aiSdkProviderId: string,
  preference: Pick<PreferenceService, 'getMultipleRawCached'>,
  options: ResolveCapabilitiesOptions = {},
): ResolvedCapabilities {
  // The descriptor says whether the model exposes reasoning. The per-request resolver decides
  // whether `default`, `none`, or an effort emits anything for this invocation.
  const enableReasoning = Boolean(model.reasoning);
  const hasExternalSearch = !!options.webSearchProviderId;
  const enableWebSearch =
    !hasExternalSearch &&
    ((!!assistant.settings?.enableWebSearch && isWebSearchModel(model)) ||
      isOpenRouterBuiltInWebSearchModel(model) ||
      model.id.includes('sonar'));
  // Ordinary chat never requests provider-native image output. Image generation
  // belongs to the separate tool/job flow, which mobile does not expose yet.
  const enableGenerateImage = false;
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
