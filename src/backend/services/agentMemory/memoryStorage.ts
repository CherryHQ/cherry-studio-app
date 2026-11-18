import {
  AGENT_MEMORY_DOCUMENT_BYTES,
  AgentMemoryError,
  type MemoryStorage,
  type AgentMemoryKey,
} from '@cherrystudio/memory';
import { File } from 'expo-file-system';

import { storageMutationGate } from '@/backend/core/storage/StorageMutationGate';
import { storageDirectory } from '@/backend/data/storage/storagePaths';

import { recoverableMemoryFile, replaceMemoryFile } from './managedMemoryStorage';
import { AGENT_MEMORY_FILES } from './memoryFiles';
function memoryFile(agentId: string, key: AgentMemoryKey): File {
  return new File(storageDirectory(), 'Data', 'Agents', agentId, ...AGENT_MEMORY_FILES[key]);
}

export const memoryStorage: MemoryStorage = {
  async read(agentId, key) {
    const file = recoverableMemoryFile(memoryFile(agentId, key));
    if (!file.exists) return null;
    if (file.size > AGENT_MEMORY_DOCUMENT_BYTES) throw new AgentMemoryError('too-large');
    return file.text();
  },
  async replace(agentId, key, content) {
    const target = memoryFile(agentId, key);
    await replaceMemoryFile(target, new TextEncoder().encode(content), () =>
      storageMutationGate.assertWritable(),
    );
  },
};
