import { AgentIdSchema } from '@/shared/data/types/agent';

import type { MemoryStorage } from './createAgentMemory';
import { AGENT_MEMORY_DOCUMENT_BYTES, AgentMemoryError } from './memoryTypes';

/** The legacy column is cleared only after its complete contents are confirmed on disk. */
export async function migrateAgentInstructions(deps: {
  agents: readonly { id: string; instructions: string }[];
  storage: MemoryStorage;
  clear(agentId: string, instructions: string): Promise<void>;
  signal?: AbortSignal;
}): Promise<void> {
  for (const agent of deps.agents) {
    if (!agent.instructions) continue;
    deps.signal?.throwIfAborted();
    AgentIdSchema.parse(agent.id);
    if (new TextEncoder().encode(agent.instructions).length > AGENT_MEMORY_DOCUMENT_BYTES)
      throw new AgentMemoryError('too-large');
    await deps.storage.replace(agent.id, 'soul', agent.instructions);
    if ((await deps.storage.read(agent.id, 'soul')) !== agent.instructions)
      throw new AgentMemoryError('unavailable');
    deps.signal?.throwIfAborted();
    await deps.clear(agent.id, agent.instructions);
  }
}
