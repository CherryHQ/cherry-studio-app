/**
 * Minimal Agent configuration source (reserved surface).
 *
 * The Agent entity's configuration model is not settled yet
 * (docs/references/agent/README.md open questions). Basic chat needs only
 * id/name/model/instructions, so the Host consumes this narrow source and the
 * production default maps it onto the existing assistants table. Tools are
 * deliberately absent because V1 executes tool-less turns.
 */

import { parseUniqueModelId, type UniqueModelId } from '@cherrystudio/universal/data/types/model';

import type { RuntimeModel } from '@/backend/ai/agent';
import { assistantService } from '@/backend/data/services/AssistantService';

export type AgentDefinition = {
  id: string;
  name: string;
  instructions: string;
  model: RuntimeModel;
};

export interface AgentDefinitionSource {
  getAgent(agentId: string): Promise<AgentDefinition | null>;
}

/** Production default: an Agent id is an assistant id for now. */
export function createAssistantAgentDefinitionSource(): AgentDefinitionSource {
  return {
    async getAgent(agentId: string): Promise<AgentDefinition | null> {
      let assistant;
      try {
        assistant = await assistantService.getById(agentId);
      } catch {
        return null;
      }
      if (!assistant?.modelId) {
        return null;
      }
      const { providerId, modelId } = parseUniqueModelId(assistant.modelId as UniqueModelId);
      return {
        id: assistant.id,
        name: assistant.name,
        instructions: assistant.prompt ?? '',
        model: { providerId, modelId },
      };
    },
  };
}
