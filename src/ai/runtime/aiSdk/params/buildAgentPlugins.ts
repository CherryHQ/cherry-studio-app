import type { AiPlugin } from '@cherrystudio/ai-core';
import type { WebSearchPluginConfig } from '@cherrystudio/ai-core/built-in/plugins';
import { providerToolPlugin } from '@cherrystudio/ai-core/built-in/plugins';

import type { Model } from '@/shared/domain/model';
import type { Provider } from '@/shared/domain/provider';

import { isAnthropicModel } from '../../../utils/model';
import { SystemProviderIds } from '../../../utils/providerIds';
import { getReasoningTagName } from '../../../utils/reasoning';
import { createAnthropicCachePlugin } from './features/anthropicCache';
import { createGatewayUsageNormalizePlugin } from './features/gatewayUsageNormalize';
import { createOpenrouterReasoningPlugin } from './features/openrouterReasoning';
import {
  createReasoningExtractionPlugin,
  INLINE_REASONING_SDK_PROVIDER_IDS,
} from './features/reasoningExtraction';
import { createSimulateStreamingPlugin } from './features/simulateStreaming';

interface BuildAgentPluginsInput {
  aiSdkProviderId: string;
  model: Model;
  provider: Provider;
  streamOutput: boolean;
  webSearchPluginConfig?: WebSearchPluginConfig;
}

export function buildAgentPlugins(input: BuildAgentPluginsInput): AiPlugin[] {
  const { aiSdkProviderId, model, provider, streamOutput, webSearchPluginConfig } = input;
  const plugins: AiPlugin[] = [];

  if (
    isAnthropicModel(model) &&
    provider.settings.cacheControl?.enabled &&
    provider.settings.cacheControl.tokenThreshold
  ) {
    plugins.push(createAnthropicCachePlugin(provider));
  }

  if (provider.id === SystemProviderIds.openrouter) {
    plugins.push(createOpenrouterReasoningPlugin());
  }

  if (webSearchPluginConfig) {
    plugins.push(providerToolPlugin('webSearch', webSearchPluginConfig));
  }

  if (!streamOutput) {
    plugins.push(createSimulateStreamingPlugin());
  }

  if (aiSdkProviderId === SystemProviderIds.gateway) {
    plugins.push(createGatewayUsageNormalizePlugin());
  }

  if (INLINE_REASONING_SDK_PROVIDER_IDS.has(aiSdkProviderId)) {
    plugins.push(createReasoningExtractionPlugin({ tagName: getReasoningTagName(model.modelId) }));
  }

  return plugins;
}
