import { isNull } from 'drizzle-orm';

import {
  type AgentSettings,
  type AssistantRow,
  type InsertAgentRow,
  agentTable,
  assistantTable,
} from '@/backend/data/db/schemas';

import { hashObject } from '../hashObject';
import type { DatabaseSeeder } from '../types';

/**
 * One-time copy of live assistants into the agent table, reusing their ids
 * (docs/references/agent/agent-persistence.md rollout step 4). The projection
 * that served Agent ids from the assistant table already treated assistant ids
 * as Agent ids, so reusing them keeps every existing Session reference valid.
 *
 * The copy is append-only: assistants stay untouched and authoritative for
 * Chat, and assistants created after this seed ran are deliberately not
 * agents. Re-running skips ids that already exist as agents.
 */
export class AgentFromAssistantSeeder implements DatabaseSeeder {
  readonly name = 'agentFromAssistant';
  readonly description = 'Copy live assistants into the agent table, reusing their ids';
  readonly version = hashObject({
    copy: 'live assistants -> agent rows: id/name/description/prompt/modelId/orderKey/timestamps',
    settings: 'respect enable flags; carry only concrete minimal..high reasoning efforts',
    skip: 'agent ids that already exist (append-only)',
  });

  async run(dbService: Parameters<DatabaseSeeder['run']>[0]) {
    await dbService.withWriteTx(async (tx) => {
      const assistants = await tx
        .select()
        .from(assistantTable)
        .where(isNull(assistantTable.deletedAt));
      if (assistants.length === 0) {
        return;
      }
      await tx
        .insert(agentTable)
        .values(assistants.map(toAgentRow))
        .onConflictDoNothing({ target: agentTable.id });
    });
  }
}

function toAgentRow(assistant: AssistantRow): InsertAgentRow {
  return {
    id: assistant.id,
    name: assistant.name,
    description: assistant.description,
    instructions: assistant.prompt,
    // No avatar: the emoji stays a Chat concept; agents render the default
    // avatar until the Agent avatar workflow lands.
    modelId: assistant.modelId,
    settings: toAgentSettings(assistant.settings),
    orderKey: assistant.orderKey,
    createdAt: assistant.createdAt,
    updatedAt: assistant.updatedAt,
  };
}

function toAgentSettings(settings: AssistantRow['settings']): AgentSettings {
  const result: AgentSettings = {};
  if (settings.enableTemperature) {
    result.temperature = settings.temperature;
  }
  if (settings.enableMaxTokens) {
    result.maxOutputTokens = settings.maxTokens;
  }
  const effort = settings.reasoning_effort;
  if (effort === 'minimal' || effort === 'low' || effort === 'medium' || effort === 'high') {
    result.reasoningEffort = effort;
  }
  return result;
}
