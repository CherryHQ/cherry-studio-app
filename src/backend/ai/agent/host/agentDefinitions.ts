/**
 * Minimal Agent configuration source.
 *
 * Tool bindings and the fixed built-in catalog are resolved separately from the
 * definition. Agent lookup owns the fixed mode boundary, model, instructions,
 * capability preferences and interactive tool-approval preference.
 */

import { and, eq, isNull } from 'drizzle-orm';

import { application } from '@/backend/core/application/Application';
import { agentTable } from '@/backend/data/db/schemas';
import { AgentProtocolError } from '@/shared/contracts/agent';
import type { AgentMode, AgentToolApprovalMode } from '@/shared/data/types/agent';
import {
  type AgentCapability,
  sanitizeDisabledAgentCapabilities,
} from '@/shared/data/types/agentCapability';
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
  /** Capability-group deny-list; a group absent from the list is enabled. */
  disabledCapabilities: readonly AgentCapability[];
};

export interface AgentDefinitionSource {
  /** Returns null only for missing Agents; rejects unconfigured models with a protocol error. */
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
      if (!agent) {
        return null;
      }
      if (!agent.model) {
        throw new AgentProtocolError({
          code: 'AGENT_MODEL_NOT_CONFIGURED',
          message: `Agent has no configured model: ${agentId}`,
          retryable: false,
        });
      }
      const { providerId, modelId } = parseUniqueModelId(agent.model as UniqueModelId);
      return {
        id: agent.id,
        name: agent.name,
        instructions: agent.instructions,
        mode: agent.mode,
        model: { providerId, modelId },
        options: {},
        toolApprovalMode: agent.toolApprovalMode,
        disabledCapabilities: sanitizeDisabledAgentCapabilities(agent.disabledCapabilities),
      };
    },
  };
}
