/**
 * Minimal Agent configuration source.
 *
 * Tool bindings and the fixed built-in catalog are resolved separately from the
 * definition. Agent lookup owns the fixed mode boundary, model, instructions,
 * and interactive tool-approval preference.
 */

import { and, eq, isNull } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { agentTable } from '@/backend/data/db/schemas';
import { AgentProtocolError } from '@/shared/contracts/agent';
import type { AgentMode, AgentToolApprovalMode } from '@/shared/data/types/agent';
import { parseUniqueModelId, type UniqueModelId } from '@/shared/data/types/model';

import type { RuntimeModel, RuntimeOptions } from '../runtime';

export type AgentDefinition = {
  id: string;
  name: string;
  instructions: string;
  mode: AgentMode;
  model: RuntimeModel;
  options: RuntimeOptions;
  toolApprovalMode: AgentToolApprovalMode;
};

export interface AgentDefinitionSource {
  /** The fallback lets a Session use its own model even when the Agent has no default. */
  getAgent(
    agentId: string,
    fallbackModelId?: UniqueModelId | null,
  ): Promise<AgentDefinition | null>;
}

/** Production source: Agent definitions live in the `agent` table (AgentService CRUD). */
export function createAgentTableDefinitionSource(): AgentDefinitionSource {
  return {
    async getAgent(agentId, fallbackModelId) {
      // Resolved per call so the source holds no reference to a replaced host
      // generation (same rule as the data-service singletons).
      const db = application.get('DbService').getDb();
      const [agent] = await db
        .select()
        .from(agentTable)
        .where(and(eq(agentTable.id, agentId), isNull(agentTable.deletedAt)))
        .limit(1);
      if (!agent) {
        return null;
      }
      const configuredModel = agent.model ?? fallbackModelId;
      if (!configuredModel) {
        throw new AgentProtocolError({
          code: 'AGENT_MODEL_NOT_CONFIGURED',
          message: `Agent has no configured model: ${agentId}`,
          retryable: false,
        });
      }
      const { providerId, modelId } = parseUniqueModelId(configuredModel as UniqueModelId);
      return {
        id: agent.id,
        name: agent.name,
        instructions: agent.instructions,
        mode: agent.mode,
        model: { providerId, modelId },
        options: {},
        toolApprovalMode: agent.toolApprovalMode,
      };
    },
  };
}
