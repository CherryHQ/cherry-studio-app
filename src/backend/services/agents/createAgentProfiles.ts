import type { AgentService } from '@/backend/data/services/AgentService';
import type { AgentMemoryOperations } from '@/backend/services/agentMemory';
import {
  AGENT_MEMORY_DOCUMENT_BYTES,
  AgentMemoryError,
} from '@/backend/services/agentMemory/memoryTypes';
import type { CreateAgentDto, UpdateAgentDto } from '@/shared/data/api/schemas/agents';
import type { Agent } from '@/shared/data/types/agent';

type AgentProfileData = Pick<AgentService, 'create' | 'delete' | 'getById' | 'list' | 'update'>;

/** Keeps the shipped instructions API field as a SOUL projection, never a second stored prompt. */
export function createAgentProfiles(agents: AgentProfileData, memory: AgentMemoryOperations) {
  async function project(agent: Agent, signal?: AbortSignal): Promise<Agent> {
    const soul = await memory.read(agent.id, 'soul', signal);
    return { ...agent, instructions: soul.content, instructionsVersion: soul.version };
  }

  return {
    withSoul: project,
    async getById(id: string) {
      return project(await agents.getById(id));
    },
    async list(...args: Parameters<AgentProfileData['list']>) {
      const page = await agents.list(...args);
      return { ...page, items: await Promise.all(page.items.map(project)) };
    },
    async create(dto: CreateAgentDto, user?: string, signal?: AbortSignal) {
      return memory.withStorageWork(async () => {
        const { instructions, ...metadata } = dto;
        signal?.throwIfAborted();
        for (const content of [instructions, user]) {
          if (content && new TextEncoder().encode(content).length > AGENT_MEMORY_DOCUMENT_BYTES)
            throw new AgentMemoryError('too-large');
        }
        const agent = await agents.create(metadata);
        try {
          if (instructions) {
            await memory.write(
              {
                agentId: agent.id,
                key: 'soul',
                content: instructions,
                expectedVersion: 'missing',
              },
              signal,
            );
          }
          if (user)
            await memory.write(
              { agentId: agent.id, key: 'user', content: user, expectedVersion: 'missing' },
              signal,
            );
          return await project(agent, signal);
        } catch (error) {
          // The new definition must not remain selectable after its initial persona failed to save.
          await agents.delete(agent.id);
          throw error;
        }
      });
    },
    async update(
      id: string,
      dto: UpdateAgentDto,
      options: Parameters<AgentProfileData['update']>[2] = {},
      signal?: AbortSignal,
    ) {
      return memory.withStorageWork(async () => {
        const { instructions, expectedInstructionsVersion, ...metadata } = dto;
        signal?.throwIfAborted();
        const soul = instructions === undefined ? undefined : await memory.read(id, 'soul', signal);
        if (
          soul &&
          expectedInstructionsVersion !== undefined &&
          soul.version !== expectedInstructionsVersion
        )
          throw new AgentMemoryError('conflict');
        const agent = await agents.update(id, metadata, options);
        if (soul && instructions !== undefined) {
          await memory.write(
            {
              agentId: id,
              key: 'soul',
              content: instructions,
              expectedVersion: expectedInstructionsVersion ?? soul.version,
            },
            signal,
          );
        }
        return project(agent, signal);
      });
    },
  };
}
