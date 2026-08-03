import type { AiPlugin } from '@cherrystudio/ai-core';
import type { WebSearchPluginConfig } from '@cherrystudio/ai-core/built-in/plugins';
import { providerToolPlugin } from '@cherrystudio/ai-core/built-in/plugins';
import { ENDPOINT_TYPE } from '@cherrystudio/provider-registry';
import { resolveAnthropicCacheSettings } from '@cherrystudio/universal/ai/anthropicCache';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { EndpointType, Model } from '@cherrystudio/universal/data/types/model';
import type { Provider } from '@cherrystudio/universal/data/types/provider';
import { isDeepSeekModel, isGemini3Model } from '@cherrystudio/universal/utils/model';

import { SystemProviderIds } from '../../../utils/providerIds';
import { getReasoningTagName } from '../../../utils/reasoning';
import type { ResolvedReasoningInvocation } from '../../../utils/reasoningSerializers';
import { createAnthropicCachePlugin } from './features/anthropicCache';
import { createDeepseekDsmlParserPlugin } from './features/deepseekDsmlParserPlugin';
import { createGatewayUsageNormalizePlugin } from './features/gatewayUsageNormalize';
import { createNoThinkPlugin } from './features/noThink';
import { createOpenrouterReasoningPlugin } from './features/openrouterReasoning';
import { createQwenThinkingPlugin, shouldApplyQwenThinking } from './features/qwenThinking';
import { createReasoningExtractionPlugin } from './features/reasoningExtraction';
import { createSimulateStreamingPlugin } from './features/simulateStreaming';
import { createSkipGeminiThoughtSignaturePlugin } from './features/skipGeminiThoughtSignature';

interface BuildAgentPluginsInput {
  aiSdkProviderId: string;
  assistant?: Assistant;
  endpointType: EndpointType | undefined;
  hasMcpTools: boolean;
  hasReasoningSelectionSource: boolean;
  model: Model;
  provider: Provider;
  reasoning: ResolvedReasoningInvocation;
  streamOutput: boolean;
  webSearchPluginConfig?: WebSearchPluginConfig;
}

export function buildAgentPlugins(input: BuildAgentPluginsInput): AiPlugin[] {
  const {
    aiSdkProviderId,
    assistant,
    endpointType,
    model,
    provider,
    reasoning,
    streamOutput,
    webSearchPluginConfig,
  } = input;
  const plugins: AiPlugin[] = [];

  if (aiSdkProviderId === SystemProviderIds.gateway) {
    plugins.push(createGatewayUsageNormalizePlugin());
  }

  if (isDeepSeekModel(model)) {
    plugins.push(createDeepseekDsmlParserPlugin());
  }

  if (endpointType === ENDPOINT_TYPE.OPENAI_CHAT_COMPLETIONS) {
    plugins.push(
      createReasoningExtractionPlugin({ tagName: getReasoningTagName(model.id.toLowerCase()) }),
    );
  }

  if (!streamOutput) {
    plugins.push(createSimulateStreamingPlugin());
  }

  if (
    endpointType === ENDPOINT_TYPE.ANTHROPIC_MESSAGES &&
    resolveAnthropicCacheSettings(provider).enabled
  ) {
    plugins.push(createAnthropicCachePlugin(provider, assistant));
  }

  if (provider.id === SystemProviderIds.openrouter) {
    plugins.push(createOpenrouterReasoningPlugin());
  }

  if (provider.id === 'ovms' && input.hasMcpTools) {
    plugins.push(createNoThinkPlugin());
  }

  if (shouldApplyQwenThinking(input)) {
    plugins.push(createQwenThinkingPlugin(reasoning.kind !== 'off'));
  }

  if (isGemini3Model(model)) {
    plugins.push(createSkipGeminiThoughtSignaturePlugin());
  }

  if (webSearchPluginConfig) {
    plugins.push(providerToolPlugin('webSearch', webSearchPluginConfig));
  }

  return plugins;
}
