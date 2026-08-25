/**
 * Minimal Agent configuration source.
 *
 * The Agent entity's configuration model is not settled yet
 * (docs/references/agent/README.md open questions). Basic chat needs only
 * id/name/model/instructions, so the Host consumes this narrow source. Tools
 * are deliberately absent because V1 executes tool-less turns.
 */

import { and, eq, isNull } from 'drizzle-orm';

import type { RuntimeModel } from '@/backend/ai/agent';
import { application } from '@/backend/core/application/Application';
import { agentTable } from '@/backend/data/db/schemas';
import { parseUniqueModelId, type UniqueModelId } from '@/shared/data/types/model';

export type AgentDefinition = {
  id: string;
  name: string;
  instructions: string;
  model: RuntimeModel;
};

export interface AgentDefinitionSource {
  getAgent(agentId: string): Promise<AgentDefinition | null>;
}

/** Production source: Agent definitions live in the `agent` table (AgentService CRUD). */
export function createAgentTableDefinitionSource(): AgentDefinitionSource {
  return {
    async getAgent(agentId: string): Promise<AgentDefinition | null> {
      // Resolved per call so the source holds no reference to a replaced host
      // generation (same rule as the data-service singletons).
      const db = application.get('DbService').getDb();
      const [agent] = await db
        .select()
        .from(agentTable)
        .where(and(eq(agentTable.id, agentId), isNull(agentTable.deletedAt)))
        .limit(1);
      if (!agent?.modelId) {
        return null;
      }
      const { providerId, modelId } = parseUniqueModelId(agent.modelId as UniqueModelId);
      return {
        id: agent.id,
        name: agent.name,
        instructions: agent.instructions,
        model: { providerId, modelId },
      };
    },
  };
}
