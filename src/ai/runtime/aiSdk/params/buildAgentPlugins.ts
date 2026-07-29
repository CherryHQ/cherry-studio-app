import type { AiPlugin } from '@cherrystudio/ai-core';
import type { WebSearchPluginConfig } from '@cherrystudio/ai-core/built-in/plugins';
import { providerToolPlugin } from '@cherrystudio/ai-core/built-in/plugins';

import type { Model } from '@/data/types/model';
import type { Provider } from '@/data/types/provider';

import { isAnthropicModel } from '../../../utils/model';
import { SystemProviderIds } from '../../../utils/providerIds';
import { getReasoningTagName } from '../../../utils/reasoning';
import { createAnthropicCachePlugin } from '../plugins/anthropicCache';
import { createGatewayUsageNormalizePlugin } from '../plugins/gatewayUsageNormalize';
import { createOpenrouterReasoningPlugin } from '../plugins/openrouterReasoning';
import {
  createReasoningExtractionPlugin,
  INLINE_REASONING_SDK_PROVIDER_IDS,
} from '../plugins/reasoningExtraction';
import { createSimulateStreamingPlugin } from '../plugins/simulateStreaming';

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
