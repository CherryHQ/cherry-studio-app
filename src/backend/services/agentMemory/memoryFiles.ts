import { AgentIdSchema } from '@/shared/data/types/agent';

import type { AgentMemoryKey } from './memoryTypes';

export const AGENT_MEMORY_FILES = {
  soul: ['SOUL.md'],
  user: ['USER.md'],
  fact: ['memory', 'FACT.md'],
  journal: ['memory', 'JOURNAL.jsonl'],
} as const satisfies Record<AgentMemoryKey, readonly string[]>;

export const AGENT_MEMORY_KEYS = Object.keys(AGENT_MEMORY_FILES) as AgentMemoryKey[];
export const AGENT_MEMORY_DOCUMENT_KEYS = ['soul', 'user', 'fact'] as const;

/** Also used by backup validation, without loading Expo or the running service. */
export function isAgentMemoryArchivePath(path: string): boolean {
  const [prefix, agentId, ...parts] = path.split('/');
  return (
    prefix === 'agent-memory' &&
    AgentIdSchema.safeParse(agentId).success &&
    Object.values(AGENT_MEMORY_FILES).some((segments) => segments.join('/') === parts.join('/'))
  );
}
