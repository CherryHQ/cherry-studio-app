import { Directory, File } from 'expo-file-system';

import { AgentIdSchema } from '@/shared/data/types/agent';

import { managedMemoryRoot, recoverableMemoryFile } from './managedMemoryStorage';
import { isAgentMemoryArchivePath } from './memoryFiles';

export function captureMemoryPaths(root: Directory, agentIds: readonly string[]): string[] {
  const paths = new Set<string>();
  const collect = (logicalRoot: string, prefix: string, relative = '') => {
    const directory = new Directory(
      managedMemoryRoot(root, logicalRoot),
      ...(relative ? [relative] : []),
    );
    if (!directory.exists) return;
    for (const entry of directory.list()) {
      if (entry instanceof Directory) continue;
      const name = entry.name.endsWith('.previous') ? entry.name.slice(0, -9) : entry.name;
      const path = prefix + '/' + (relative ? relative + '/' : '') + name;
      if (isAgentMemoryArchivePath(path)) paths.add(path);
    }
  };
  collect('shared', 'shared-memory');
  collect('shared', 'shared-memory', '.memories');
  collect('backups/shared', 'memory-backups/shared');
  for (const id of agentIds) {
    AgentIdSchema.parse(id);
    collect('agent/' + id, 'agent-memory/' + id);
    collect('agent/' + id, 'agent-memory/' + id, '.memories');
    collect('backups/agent/' + id, 'memory-backups/agent/' + id);
  }
  return [...paths].sort();
}

export function restoredMemoryFile(root: Directory, path: string): File {
  if (!isAgentMemoryArchivePath(path)) throw new Error('Invalid memory archive path');
  const [prefix, ...parts] = path.split('/');
  if (prefix === 'agent-memory') {
    const [id, ...target] = parts;
    return recoverableMemoryFile(new File(managedMemoryRoot(root, 'agent/' + id), ...target));
  }
  if (prefix === 'shared-memory')
    return recoverableMemoryFile(new File(managedMemoryRoot(root, 'shared'), ...parts));
  const file = parts.pop()!;
  return recoverableMemoryFile(
    new File(managedMemoryRoot(root, 'backups/' + parts.join('/')), file),
  );
}
