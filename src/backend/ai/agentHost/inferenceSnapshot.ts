import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import type { RuntimeModel, RuntimeOptions, RuntimeTool } from '@/backend/ai/agent';
import { modelService } from '@/backend/data/services/ModelService';
import { providerService } from '@/backend/data/services/ProviderService';
import {
  AgentInferenceSnapshotV1Schema,
  type AgentInferenceSnapshotV1,
} from '@/shared/contracts/agent';
import { createUniqueModelId } from '@/shared/data/types/model';

export type AgentInferenceModelSnapshot = AgentInferenceSnapshotV1['model'];
export type AgentInferenceModelResolver = (
  model: RuntimeModel,
) => Promise<AgentInferenceModelSnapshot>;
export type AgentModelToolSupportResolver = (model: RuntimeModel) => Promise<boolean>;

/** Resolves public model facts only; provider credentials never cross this boundary. */
export const resolveAgentInferenceModel: AgentInferenceModelResolver = async (runtimeModel) => {
  const uniqueModelId = createUniqueModelId(runtimeModel.providerId, runtimeModel.modelId);
  const [model] = await Promise.all([
    modelService.getById(uniqueModelId),
    providerService.getByProviderId(runtimeModel.providerId),
  ]);
  if (!model) {
    throw new Error('The selected model is unavailable.');
  }

  return {
    uniqueModelId,
    providerId: runtimeModel.providerId,
    modelId: runtimeModel.modelId,
    ...(model.apiModelId !== undefined ? { apiModelId: model.apiModelId } : {}),
    name: model.name,
  };
};

/** Admission-time public capability check; no credentials are resolved here. */
export const resolveAgentModelToolSupport: AgentModelToolSupportResolver = async (runtimeModel) => {
  const model = await modelService.getById(
    createUniqueModelId(runtimeModel.providerId, runtimeModel.modelId),
  );
  return model?.capabilities.includes(MODEL_CAPABILITY.FUNCTION_CALL) ?? false;
};

/**
 * Copies only the versioned allowlist shared with persistence. Runtime-only
 * schemas, callbacks, endpoints, headers, and credentials are intentionally
 * unreachable from the returned value.
 */
export function createAgentInferenceSnapshot(input: {
  model: AgentInferenceModelSnapshot;
  options: RuntimeOptions;
  tools: readonly RuntimeTool[];
}): AgentInferenceSnapshotV1 {
  return AgentInferenceSnapshotV1Schema.parse({
    version: 1,
    model: input.model,
    ...(input.options.reasoningEffort !== undefined
      ? { reasoningEffort: input.options.reasoningEffort }
      : {}),
    parameters: {
      ...(input.options.temperature !== undefined
        ? { temperature: input.options.temperature }
        : {}),
      ...(input.options.maxOutputTokens !== undefined
        ? { maxOutputTokens: input.options.maxOutputTokens }
        : {}),
    },
    tools: input.tools.map((tool) => ({
      ref: tool.ref,
      providerName: tool.providerName,
      displayName: tool.displayName,
      approval: tool.approval,
    })),
  });
}
