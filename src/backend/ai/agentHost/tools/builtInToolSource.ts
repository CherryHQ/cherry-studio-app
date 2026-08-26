/**
 * The Host's built-in tool catalog, resolved once per turn.
 *
 * Snapshot resolution in miniature (agent-tools-and-resources.md): the Host asks
 * for the tools a turn may use, and the source projects only what the selected
 * model can actually call. There are no per-Agent bindings yet, so the catalog
 * is the same for every Agent.
 */

import { MODEL_CAPABILITY } from '@cherrystudio/provider-registry';

import type { RuntimeModel, RuntimeTool } from '@/backend/ai/agent';
import { modelService } from '@/backend/data/services/ModelService';
import { fileContent } from '@/backend/services/file/fileContent';
import { createUniqueModelId } from '@/shared/data/types/model';

import { createWriteFileTool } from './writeFileTool';

export type AgentToolSource = {
  /** The tools this turn may use; empty when the model cannot call any. */
  getTools(model: RuntimeModel): Promise<readonly RuntimeTool[]>;
};

export function createBuiltInToolSource(): AgentToolSource {
  // Stateless tools: one instance serves every turn.
  const tools: readonly RuntimeTool[] = [createWriteFileTool(fileContent)];

  return {
    async getTools(model) {
      const configured = await modelService.getById(
        createUniqueModelId(model.providerId, model.modelId),
      );
      // Handing tools to a model that cannot call them fails the whole turn, so
      // an unknown or incapable model gets none.
      return configured?.capabilities.includes(MODEL_CAPABILITY.FUNCTION_CALL) ? tools : [];
    },
  };
}
