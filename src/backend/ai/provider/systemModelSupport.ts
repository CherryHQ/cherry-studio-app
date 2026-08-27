import { extensionRegistry } from '@cherrystudio/ai-core/provider';
import { getAiSdkProviderId } from '@cherrystudio/ai-runtime/provider';

import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { isImageGenerationModel, isTextGenerationModel } from '@/shared/utils/modelPurpose';

import { resolveLanguageServingPlan } from './languageServingPlan';

/**
 * Whether one configured model can be executed by at least one product feature
 * currently shipped on mobile.
 *
 * Conversation support is owned by Pi. Image generation remains an independent
 * AI SDK capability, so either path is sufficient to admit the model.
 */
export function isModelSupportedBySystem(provider: Provider, model: Model): boolean {
  if (isImageGenerationModel(model) && isImageGenerationSupported(provider, model)) {
    return true;
  }

  return (
    isTextGenerationModel(model) &&
    resolveLanguageServingPlan(provider, model).bindings.pi.status === 'supported'
  );
}

export function filterModelsSupportedBySystem(
  models: readonly Model[],
  providers: readonly Provider[],
): Model[] {
  const providersById = new Map(providers.map((provider) => [provider.id, provider]));

  return models.filter((model) => {
    const provider = providersById.get(model.providerId);
    return provider ? isModelSupportedBySystem(provider, model) : false;
  });
}

function isImageGenerationSupported(provider: Provider, model: Model): boolean {
  const extension = extensionRegistry.get(getAiSdkProviderId(provider, model));
  return extension?.config.supportsImageGeneration === true;
}
