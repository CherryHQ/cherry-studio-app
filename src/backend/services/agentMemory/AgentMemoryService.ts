import {
  createAgentMemory,
  AGENT_MEMORY_INSTRUCTION_KEY,
  AgentMemoryError,
  MemoryService,
  memoryContext,
  managedMemoryContext,
  type ManagedMemoryEntry,
  memoryScopeKey,
  MemoryError,
  type MemoryScope,
} from '@cherrystudio/memory';
import { and, eq, isNull, ne } from 'drizzle-orm';

import { BaseService, DependsOn, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { publishDataApiChanges } from '@/backend/data/dataApiChanges';
import type { DbService } from '@/backend/data/db/DbService';
import { agentTable, monotonicUpdateTimestamp } from '@/backend/data/db/schemas';
import { sha256HexOfText } from '@/shared/utils/sha256';

import { managedMemoryPlatform } from './managedMemoryStorage';
import { createMemoryAuthority, type MemoryCaller } from './memoryAuthority';
import { MemoryHistory } from './memoryHistory';
import type { MemoryMaintenanceRuntime } from './memoryMaintenance';
import { memoryStorage } from './memoryStorage';
import { migrateAgentInstructions } from './migrateAgentInstructions';

@Injectable('AgentMemoryService')
@ServicePhase(Phase.Gate)
@DependsOn(['DbService'])
export class AgentMemoryService extends BaseService {
  private readonly memory;
  private readonly managed;
  private readonly history: MemoryHistory;
  private maintenance?: MemoryMaintenanceRuntime;

  constructor(private readonly db: DbService) {
    super();
    this.history = new MemoryHistory(db);
    this.managed = new MemoryService({
      platform: managedMemoryPlatform,
      roots: (scope) => ({
        active: memoryScopeKey(scope),
        backup: 'backups/' + memoryScopeKey(scope),
      }),
      changed: (scope, source, result) => this.maintenance?.changed(scope, source, result),
    });
    this.memory = createAgentMemory({
      hash: sha256HexOfText,
      storage: {
        ...memoryStorage,
        async replace(agentId, key, content) {
          await memoryStorage.replace(agentId, key, content);
          if (key === 'soul') publishDataApiChanges(['/agents', `/agents/${agentId}`]);
        },
      },
      bootstrap: {
        async read(agentId) {
          const [agent] = await db
            .getDb()
            .select({ completed: agentTable.bootstrapCompleted })
            .from(agentTable)
            .where(and(eq(agentTable.id, agentId), isNull(agentTable.deletedAt)))
            .limit(1);
          if (!agent) throw new AgentMemoryError('agent-unavailable');
          return agent.completed;
        },
        async write(agentId, completed) {
          await db.withWriteTx(async (tx) => {
            const [agent] = await tx
              .update(agentTable)
              .set({
                bootstrapCompleted: completed,
                updatedAt: monotonicUpdateTimestamp(agentTable.updatedAt),
              })
              .where(and(eq(agentTable.id, agentId), isNull(agentTable.deletedAt)))
              .returning({ id: agentTable.id });
            if (!agent) throw new AgentMemoryError('agent-unavailable');
          });
          publishDataApiChanges(['/agents', `/agents/${agentId}`]);
        },
      },
      assertAgent: async (id) => {
        const agent = await this.identityAgent(id);
        if (agent.managedRemoteId !== null) throw new AgentMemoryError('unavailable');
      },
      assertWritable: () => storageMutationGate.assertWritable(),
    });
  }

  get operations() {
    return {
      ...this.memory,
      openManaged: this.openManaged,
      assertSafe: this.assertSafe,
      recall: this.recall,
      resolveCaller: this.resolveCaller,
    };
  }

  openManaged = (caller: MemoryCaller, kind: 'private' | 'shared', signal?: AbortSignal) => {
    const scope: MemoryScope = kind === 'shared' ? { kind } : { kind, agentId: caller.agentId };
    return this.managed.open(createMemoryAuthority(this.db, caller, scope, signal));
  };

  /** Fingerprints guard old model context even when shared injection was switched off. */
  assertSafe = async (caller: MemoryCaller, signal?: AbortSignal) => {
    const protections = new Map<string, string | null>();
    for (const scope of [
      { kind: 'shared' },
      { kind: 'private', agentId: caller.agentId },
    ] as const) {
      const authority = createMemoryAuthority(this.db, caller, scope, signal, true);
      const assertHistory = authority.assertHistory;
      authority.assertHistory = async (protection) => {
        protections.set(memoryScopeKey(scope), protection);
        await assertHistory?.(protection);
      };
      const session = this.managed.open(authority);
      try {
        await session.assertRuntimeSafe();
      } finally {
        session.dispose();
      }
    }
    return protections;
  };

  recall = async (
    caller: MemoryCaller,
    input: { query?: string; conversationId?: string; messageId?: string },
    signal: AbortSignal,
  ) => {
    const protections = await this.assertSafe(caller, signal);
    const result = await this.history.search(
      caller,
      input,
      async (sessionId) => {
        const shared = this.history.matchesProtection(
          sessionId,
          { kind: 'shared' },
          protections.get('shared') ?? null,
        );
        const privateScope = { kind: 'private', agentId: caller.agentId } as const;
        return (
          shared &&
          this.history.matchesProtection(
            sessionId,
            privateScope,
            protections.get(memoryScopeKey(privateScope)) ?? null,
          )
        );
      },
      signal,
    );
    await this.assertSafe(caller, signal);
    return result;
  };

  resolveCaller = (agentId: string, replyId: string): MemoryCaller | undefined => {
    const row = this.db.getSqlite().getFirstSync<{
      session_id: string;
      parent_id: string;
      turn_id: string;
      prior: string | null;
    }>("SELECT r.session_id,r.parent_id,r.turn_id,q.parent_id AS prior FROM agent_session_message r JOIN agent_session s ON s.id = r.session_id JOIN agent_session_message q ON q.id = r.parent_id WHERE r.id = ? AND s.agent_id = ? AND r.role = 'assistant' AND q.role = 'user'", replyId, agentId);
    return row
      ? {
          agentId,
          sessionId: row.session_id,
          userMessageId: row.parent_id,
          turnId: row.turn_id,
          hasHistory: Boolean(row.prior),
        }
      : undefined;
  };

  context = async (agentId: string, signal?: AbortSignal, canBootstrap = false) => {
    signal?.throwIfAborted();
    const agent = await this.identityAgent(agentId);
    if (agent.managedRemoteId !== null)
      return {
        key: AGENT_MEMORY_INSTRUCTION_KEY,
        text: `## Organization Agent Instructions

These server-managed instructions define this Agent's role, goals and style within the Runtime Rules and the user's request. This current value replaces earlier identity snapshots; empty instructions withdraw the previous value. Agent and memory tools cannot read or change this organization-owned identity.

<agent_instructions>
${JSON.stringify(agent.instructions).replace(/</g, '\\u003c')}
</agent_instructions>`,
      };
    return memoryContext(await this.memory.snapshot(agentId, signal), canBootstrap);
  };

  managedContext = async (caller: MemoryCaller, signal?: AbortSignal) => {
    const agentId = caller.agentId;
    await this.assertSafe(caller, signal);
    const entries: ManagedMemoryEntry[] = [];
    const agent = this.db
      .getSqlite()
      .getFirstSync<{ shared_memory_enabled: number }>(
        'SELECT shared_memory_enabled FROM agent WHERE id = ? AND deleted_at IS NULL',
        agentId,
      );
    for (const kind of ['private', 'shared'] as const) {
      if (kind === 'shared' && !agent?.shared_memory_enabled) continue;
      const session = this.openManaged(caller, kind, signal);
      try {
        entries.push({
          scope: kind,
          ...(await this.managed.entrySnapshot(caller.sessionId, session)),
        });
      } finally {
        session.dispose();
      }
    }
    return managedMemoryContext(entries);
  };
  soul = async (agentId: string, signal?: AbortSignal) => {
    signal?.throwIfAborted();
    const agent = await this.identityAgent(agentId);
    return agent.managedRemoteId !== null
      ? agent.instructions
      : (await this.memory.read(agentId, 'soul', signal)).content;
  };

  private async identityAgent(agentId: string) {
    const [agent] = await this.db
      .getDb()
      .select({
        instructions: agentTable.instructions,
        managedRemoteId: agentTable.managedRemoteId,
      })
      .from(agentTable)
      .where(and(eq(agentTable.id, agentId), isNull(agentTable.deletedAt)))
      .limit(1);
    if (!agent) throw new AgentMemoryError('agent-unavailable');
    return agent;
  }
  hasPendingStorageWork = () =>
    this.memory.hasPendingStorageWork() ||
    this.managed.hasPendingStorageWork() ||
    Boolean(this.maintenance?.hasPendingWork());

  maintenanceSession(
    scope: MemoryScope,
    source: 'dreaming' | 'extraction',
    assertCurrent: () => void,
  ) {
    return this.managed.open(
      {
        scope,
        assertAuthorized: () => {
          assertCurrent();
          if (
            scope.kind === 'private' &&
            !this.db
              .getSqlite()
              .getFirstSync(
                'SELECT id FROM agent WHERE id = ? AND deleted_at IS NULL',
                scope.agentId,
              )
          )
            throw new MemoryError('invalid-receipt', 'The private memory owner no longer exists');
          return undefined;
        },
        assertWritable: () => {
          assertCurrent();
          storageMutationGate.assertWritable();
        },
      },
      source,
    );
  }
  configureMaintenance(runtime: MemoryMaintenanceRuntime) {
    this.maintenance = runtime;
  }
  runMaintenance = (context: Parameters<MemoryMaintenanceRuntime['execute']>[0]) => {
    if (!this.maintenance)
      throw new MemoryError('invalid-receipt', 'Memory maintenance is not configured');
    return this.maintenance.execute(context);
  };
  maintenanceStatus = () => this.maintenance?.status() ?? Promise.resolve(undefined);
  organizeNow = async () => {
    if (!this.maintenance)
      throw new MemoryError('invalid-receipt', 'Memory maintenance is not configured');
    await this.maintenance.organizeNow();
  };
  completed = (sessionId: string, replyId: string) => this.maintenance?.accept(sessionId, replyId);
  protected override onReady() {
    this.maintenance?.start();
  }

  editorSession = () =>
    this.managed.open({
      scope: { kind: 'shared' },
      assertAuthorized: () => undefined,
      assertWritable: () => storageMutationGate.assertWritable(),
    });

  protected override async onInit() {
    const agents = await this.db
      .getDb()
      .select({ id: agentTable.id, instructions: agentTable.instructions })
      .from(agentTable)
      .where(and(ne(agentTable.instructions, ''), isNull(agentTable.managedRemoteId)));
    await migrateAgentInstructions({
      agents,
      storage: memoryStorage,
      signal: this.initializationSignal,
      clear: (agentId, instructions) =>
        this.db.withWriteTx(async (tx) => {
          await tx
            .update(agentTable)
            .set({ instructions: '' })
            .where(
              and(
                eq(agentTable.id, agentId),
                eq(agentTable.instructions, instructions),
                isNull(agentTable.managedRemoteId),
              ),
            );
        }),
    });
  }

  protected override async onStop() {
    await this.maintenance?.stop();
    await this.memory.close();
    await this.managed.close();
  }
}

export type AgentMemoryOperations = AgentMemoryService['operations'];
