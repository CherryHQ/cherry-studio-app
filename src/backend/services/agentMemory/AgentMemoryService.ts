import { and, eq, isNull, ne } from 'drizzle-orm';

import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import type { DbService } from '@/backend/data/db/DbService';
import { agentTable } from '@/backend/data/db/schemas/agent';

import { createAgentMemory, type AgentMemoryOperations } from './createAgentMemory';
import { memoryContext } from './memoryContext';
import { memoryStorage } from './memoryStorage';
import { AgentMemoryError } from './memoryTypes';
import { migrateAgentInstructions } from './migrateAgentInstructions';

@Injectable('AgentMemoryService')
@ServicePhase(Phase.Gate)
@DependsOn(['DbService'])
export class AgentMemoryService extends BaseService {
  private readonly memory;

  constructor(private readonly db: DbService) {
    super();
    this.memory = createAgentMemory({
      storage: {
        ...memoryStorage,
        async replace(agentId, key, content) {
          await memoryStorage.replace(agentId, key, content);
          if (key === 'soul') publishDataApiChanges(['/agents', `/agents/${agentId}`]);
        },
      },
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
  soul = async (agentId: string, signal?: AbortSignal) =>
    (await this.memory.read(agentId, 'soul', signal)).content;
  hasPendingStorageWork = () => this.memory.hasPendingStorageWork();

  protected override async onInit() {
    const agents = await this.db
      .getDb()
      .select({ id: agentTable.id, instructions: agentTable.instructions })
      .from(agentTable)
      .where(ne(agentTable.instructions, ''));
    await migrateAgentInstructions({
      agents,
      storage: memoryStorage,
      signal: this.initializationSignal,
      clear: (agentId, instructions) =>
        this.db.withWriteTx(async (tx) => {
          await tx
            .update(agentTable)
            .set({ instructions: '' })
            .where(and(eq(agentTable.id, agentId), eq(agentTable.instructions, instructions)));
        }),
    });
  }

  protected override async onStop() {
    await this.memory.close();
  }
}
