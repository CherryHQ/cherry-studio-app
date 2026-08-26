/**
 * Minimal Agent configuration source.
 *
 * Per-Agent tool bindings are persisted separately, but their immutable Runtime
 * projection is follow-up work. Basic chat needs only id/name/model/instructions/
 * inference options, so the Host keeps this definition source narrow. The fixed
 * built-in catalog remains Host-owned and is not represented here.
 */

import { and, eq, isNull } from 'drizzle-orm';

import type { RuntimeModel, RuntimeOptions } from '@/backend/ai/agent';
import { application } from '@/backend/core/application/Application';
import { agentTable } from '@/backend/data/db/schemas';
import { parseUniqueModelId, type UniqueModelId } from '@/shared/data/types/model';

export type AgentDefinition = {
  id: string;
  name: string;
  instructions: string;
  model: RuntimeModel;
  options: RuntimeOptions;
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
        options: {
          ...(agent.settings.maxOutputTokens !== undefined
            ? { maxOutputTokens: agent.settings.maxOutputTokens }
            : {}),
          ...(agent.settings.reasoningEffort !== undefined
            ? { reasoningEffort: agent.settings.reasoningEffort }
            : {}),
          ...(agent.settings.temperature !== undefined
            ? { temperature: agent.settings.temperature }
            : {}),
        },
      };
    },
  };
}
