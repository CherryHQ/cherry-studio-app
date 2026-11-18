import { assertMemoryTarget, type AgentMemoryKey } from '@cherrystudio/memory';

import { AgentIdSchema } from '@/shared/data/types/agent';

export const AGENT_MEMORY_FILES = {
  soul: ['SOUL.md'],
  user: ['USER.md'],
} as const satisfies Record<AgentMemoryKey, readonly string[]>;

/** Also used by backup validation, without loading Expo or the running service. */
export function isAgentMemoryArchivePath(path: string): boolean {
  const [prefix, agentId, ...parts] = path.split('/');
  const target = parts.join('/');
  if (prefix === 'agent-memory' && AgentIdSchema.safeParse(agentId).success) {
    if (target === 'SOUL.md' || target === 'USER.md') return true;
    try {
      assertMemoryTarget(target);
      return true;
    } catch {
      return false;
    }
  }
  if (prefix === 'shared-memory') {
    try {
      assertMemoryTarget([agentId, ...parts].join('/'));
      return true;
    } catch {
      return false;
    }
  }
  if (prefix === 'memory-backups') {
    const segments = path.split('/');
    const file = segments.at(-1) ?? '';
    return (
      /^\d+-[0-9a-f-]{36}\.json$/.test(file) &&
      ((segments.length === 3 && segments[1] === 'shared') ||
        (segments.length === 4 &&
          segments[1] === 'agent' &&
          AgentIdSchema.safeParse(segments[2]).success))
    );
  }
  return false;
}
