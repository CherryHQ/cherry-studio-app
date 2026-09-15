import { extensionRegistry } from '@cherrystudio/ai-core/provider';
import { isImageTransportDescriptorSupported } from '@cherrystudio/ai-runtime/image';
import { getAiSdkProviderId } from '@cherrystudio/ai-runtime/provider';

import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { isImageGenerationModel, isTextGenerationModel } from '@/shared/utils/modelPurpose';

/**
 * Conversation-serving support as answered by the bound Agent Runtime. The
 * provider layer stays runtime-agnostic: the composition root supplies the
 * implementation alongside the Runtime binding, so replacing the Runtime
 * replaces this answer with it.
 */
export interface LanguageServingSupport {
  supportsLanguageModel(provider: Provider, model: Model): boolean;
}

export interface SystemModelSupport {
  /**
   * Whether one configured model can be executed by at least one product
   * feature currently shipped on mobile. Conversation support is owned by the
   * bound Runtime; image generation remains an independent AI SDK capability,
   * so either path is sufficient to admit the model.
   */
  isModelSupportedBySystem(provider: Provider, model: Model): boolean;
  filterModelsSupportedBySystem(models: readonly Model[], providers: readonly Provider[]): Model[];
}

export function createSystemModelSupport(language: LanguageServingSupport): SystemModelSupport {
  const isModelSupportedBySystem = (provider: Provider, model: Model): boolean => {
    if (isImageGenerationModel(model) && isImageGenerationSupported(provider, model)) {
      return true;
    }

    return isTextGenerationModel(model) && language.supportsLanguageModel(provider, model);
  };

  return {
    filterModelsSupportedBySystem: (models, providers) => {
      const providersById = new Map(providers.map((provider) => [provider.id, provider]));

      return models.filter((model) => {
        const provider = providersById.get(model.providerId);
        return provider ? isModelSupportedBySystem(provider, model) : false;
      });
    },
    isModelSupportedBySystem,
  };
}

function isImageGenerationSupported(provider: Provider, model: Model): boolean {
  const extension = extensionRegistry.get(getAiSdkProviderId(provider, model));
  if (extension?.config.supportsImageGeneration !== true) return false;
  const providerId = provider.presetProviderId ?? provider.id;
  const modes = Object.values(model.imageGeneration?.modes ?? {});
  if (modes.length === 0) return isImageTransportDescriptorSupported(providerId, undefined);
  return modes.some((definition) =>
    isImageTransportDescriptorSupported(
      providerId,
      definition?.vendorTransport
        ? { ...definition.vendorTransport, id: model.apiModelId ?? model.modelId }
        : undefined,
    ),
  );
}
