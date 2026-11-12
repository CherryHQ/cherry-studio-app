import { and, eq, isNull } from 'drizzle-orm';

import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import type { DbService } from '@/backend/data/db/DbService';
import { agentTable } from '@/backend/data/db/schemas/agent';

import { createAgentMemory, type AgentMemoryOperations } from './createAgentMemory';
import { memoryContext } from './memoryContext';
import { memoryStorage } from './memoryStorage';
import { AgentMemoryError } from './memoryTypes';

@Injectable('AgentMemoryService')
@ServicePhase(Phase.Gate)
@DependsOn(['DbService'])
export class AgentMemoryService extends BaseService {
  private readonly memory;

  constructor(db: DbService) {
    super();
    this.memory = createAgentMemory({
      storage: memoryStorage,
      assertAgent: async (id) => {
        const [agent] = await db
          .getDb()
          .select({ id: agentTable.id })
          .from(agentTable)
          .where(and(eq(agentTable.id, id), isNull(agentTable.deletedAt)))
          .limit(1);
        if (!agent) throw new AgentMemoryError('agent-unavailable');
      },
      assertWritable: () => storageMutationGate.assertWritable(),
    });
  }

  get operations(): AgentMemoryOperations {
    return this.memory;
  }

  context = async (agentId: string, signal?: AbortSignal) =>
    memoryContext(await this.memory.snapshot(agentId, signal));
  hasPendingStorageWork = () => this.memory.hasPendingStorageWork();

  protected override async onStop() {
    await this.memory.close();
  }
}
