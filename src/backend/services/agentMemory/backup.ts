import { Directory, File } from 'expo-file-system';

import { AgentMemoryError } from '@/shared/contracts/agentMemory';
import { AgentIdSchema } from '@/shared/data/types/agent';

import { AGENT_MEMORY_FILES, AGENT_MEMORY_KEYS } from './memoryFiles';
import { memoryFile } from './memoryStorage';

export function captureMemoryPaths(root: Directory, agentIds: readonly string[]): string[] {
  if (!new Directory(root, 'Data', 'Agents').exists) return [];
  return agentIds.flatMap((id) => {
    AgentIdSchema.parse(id);
    return AGENT_MEMORY_KEYS.filter((key) => memoryFile(root, id, key).exists).map(
      (key) => `agent-memory/${id}/${AGENT_MEMORY_FILES[key].join('/')}`,
    );
  });
}

/** Source reads include recoverable previous copies; restored generations start at canonical names. */
export function restoredMemoryFile(root: Directory, path: string): File {
  const [, id, ...segments] = path.split('/');
  const key = AGENT_MEMORY_KEYS.find(
    (key) => AGENT_MEMORY_FILES[key].join('/') === segments.join('/'),
  );
  if (!key) throw new AgentMemoryError('unavailable');
  return memoryFile(root, id, key);
}
