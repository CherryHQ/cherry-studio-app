import { randomUUID } from 'expo-crypto';
import { Directory, File } from 'expo-file-system';

import { storageDirectory } from '@/backend/data/storage/storagePaths';
import {
  AGENT_MEMORY_DOCUMENT_BYTES,
  AGENT_MEMORY_JOURNAL_BYTES,
  AgentMemoryError,
  type AgentMemoryKey,
} from '@/shared/contracts/agentMemory';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { MemoryStorage } from './createAgentMemory';
import { AGENT_MEMORY_FILES } from './memoryFiles';

const logger = loggerService.withContext('AgentMemoryStorage');

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
    const limit = key === 'journal' ? AGENT_MEMORY_JOURNAL_BYTES : AGENT_MEMORY_DOCUMENT_BYTES;
    if (file.size > limit) throw new AgentMemoryError('too-large');
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
    target.parentDirectory.create({ intermediates: true, idempotent: true });
    const previous = new File(target.uri + '.previous');
    const staged = new File(target.parentDirectory, `.${target.name}.${randomUUID()}.pending`);
    try {
      await staged.write(content);
      if (target.exists) {
        if (previous.exists) previous.delete();
        await new File(target.uri).move(previous);
      }
      // Expo's overwrite deletes the destination first. Keep the previous file until publication.
      await staged.move(target);
      try {
        if (previous.exists) previous.delete();
      } catch {
        logger.warn('Could not remove the previous memory revision');
      }
    } finally {
      // A failed move leaves .previous available to reads and the next replacement.
      if (staged.exists && staged.uri !== target.uri) staged.delete();
    }
  },
};
