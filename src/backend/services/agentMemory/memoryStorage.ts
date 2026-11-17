import {
  AGENT_MEMORY_DOCUMENT_BYTES,
  AgentMemoryError,
  type MemoryStorage,
  type AgentMemoryKey,
} from '@cherrystudio/memory';
import { Directory, File } from 'expo-file-system';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { storageDirectory } from '@/backend/data/storage/storagePaths';

import { replaceMemoryFile } from './managedMemoryStorage';
import { AGENT_MEMORY_FILES } from './memoryFiles';
/** Reads an interrupted replacement's previous copy without mutating storage during backup. */
export function memoryFile(root: Directory, agentId: string, key: AgentMemoryKey): File {
  const file = new File(root, 'Data', 'Agents', agentId, ...AGENT_MEMORY_FILES[key]);
  const previous = new File(file.uri + '.previous');
  return !file.exists && previous.exists ? previous : file;
}

export const memoryStorage: MemoryStorage = {
  async read(agentId, key) {
    const file = memoryFile(storageDirectory(), agentId, key);
    if (!file.exists) return null;
    if (file.size > AGENT_MEMORY_DOCUMENT_BYTES) throw new AgentMemoryError('too-large');
    return file.text();
  },
  async replace(agentId, key, content) {
    const target = new File(
      storageDirectory(),
      'Data',
      'Agents',
      agentId,
      ...AGENT_MEMORY_FILES[key],
    );
    await replaceMemoryFile(target, new TextEncoder().encode(content), () =>
      storageMutationGate.assertWritable(),
    );
  },
};
