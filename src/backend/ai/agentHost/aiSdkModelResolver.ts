/**
 * Production implementation of `AiSdkRuntimeDependencies.resolveModel`.
 *
 * This is the Host-owned data-feeding seam between the Runtime contract's
 * abstract `RuntimeModel` and a configured AI SDK language model. It reuses the
 * existing provider-construction logic (`provider/config.ts` + data services +
 * ai-core's plugin engine) without modifying it. The Runtime itself never
 * queries Cherry provider or model tables; only this resolver does.
 */

import { createExecutor } from '@cherrystudio/ai-core';
import type { AppProviderSettingsMap } from '@cherrystudio/ai-runtime/provider';
import type { UniqueModelId } from '@cherrystudio/universal/data/types/model';

import type {
  AiSdkModelResolution,
  AiSdkRuntimeDependencies,
  ResolvedLanguageModel,
  RuntimeModel,
} from '@/backend/ai/agent';
import { resolveProviderAiSdkConfig } from '@/backend/ai/provider/config';
import { modelService } from '@/backend/data/services/ModelService';
import { providerService } from '@/backend/data/services/ProviderService';

export function createAiSdkModelResolver(): AiSdkRuntimeDependencies {
  return {
    async resolveModel(model: RuntimeModel): Promise<AiSdkModelResolution> {
      const uniqueModelId = `${model.providerId}::${model.modelId}` as UniqueModelId;
      const [provider, modelRecord] = await Promise.all([
        providerService.getByProviderId(model.providerId),
        modelService.getById(uniqueModelId),
      ]);
      if (!modelRecord) {
        throw new Error(`Model is not configured: ${uniqueModelId}`);
      }
      const { config } = await resolveProviderAiSdkConfig(provider, modelRecord, {
        getAuthConfig: (providerId) => providerService.getAuthConfig(providerId),
        resolveApiKey: (providerId, override) =>
          providerService.resolveApiKey(providerId, override),
      });
      const executor = await createExecutor<AppProviderSettingsMap>(
        config.providerId,
        config.providerSettings,
      );
      const resolved = await executor.pluginEngine.resolveModel(
        modelRecord.apiModelId ?? modelRecord.modelId,
      );
      if (typeof resolved === 'string') {
        throw new Error('Model resolution returned an unresolved model id.');
      }
      // Reserved: reasoningEffort maps into provider-specific providerOptions
      // here once the reasoning catalog is threaded through the Host.
      return { model: resolved as ResolvedLanguageModel };
    },
  };
}
