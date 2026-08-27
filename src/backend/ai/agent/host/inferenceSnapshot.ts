import { modelService } from '@/backend/data/services/ModelService';
import {
  AgentInferenceSnapshotV1Schema,
  type AgentInferenceSnapshotV1,
} from '@/shared/contracts/agent';
import { createUniqueModelId } from '@/shared/data/types/model';

import type { RuntimeModel, RuntimeOptions, RuntimeTool } from '../runtime';

export type AgentInferenceModelSnapshot = AgentInferenceSnapshotV1['model'];
export type AgentInferenceModelResolver = (
  model: RuntimeModel,
) => Promise<AgentInferenceModelSnapshot>;

/** Resolves public model facts only; provider credentials never cross this boundary. */
export const resolveAgentInferenceModel: AgentInferenceModelResolver = async (runtimeModel) => {
  const uniqueModelId = createUniqueModelId(runtimeModel.providerId, runtimeModel.modelId);
  const model = await modelService.getById(uniqueModelId);
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
