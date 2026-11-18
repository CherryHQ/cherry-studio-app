import type { MemoryCommitResult, MemorySession } from '@cherrystudio/memory';

import type { MemoryModule } from '@/shared/contracts/memory';

import type { AgentMemoryService } from './AgentMemoryService';

export function createMemoryModule(memory: AgentMemoryService): MemoryModule {
  const previews = new Map<string, MemorySession>();
  function retain(token: string, session: MemorySession) {
    for (const previous of previews.values()) previous.dispose();
    previews.clear();
    previews.set(token, session);
  }
  async function apply(token: string, action: 'clear' | 'recover') {
    const session = previews.get(token);
    if (!session) throw new Error('The memory preview expired');
    try {
      const result: MemoryCommitResult = await session[action](token);
      return {
        confirmed:
          !result.error &&
          result.files.every((file) => file.outcome === 'applied' || file.outcome === 'unchanged'),
        applied: result.files.filter((file) => file.outcome === 'applied').length,
        conflicts: result.files.filter((file) => file.outcome === 'conflict').length,
        pending: result.files.filter((file) => file.outcome === 'pending').length,
      };
    } finally {
      previews.delete(token);
      session.dispose();
    }
  }
  return {
    status: memory.maintenanceStatus,
    organize: memory.organizeNow,
    async previewClear() {
      const session = memory.editorSession();
      try {
        const value = await session.previewClear();
        retain(value.token, session);
        return { token: value.token };
      } catch (error) {
        session.dispose();
        throw error;
      }
    },
    clear: (token) => apply(token, 'clear'),
    async previewRecovery() {
      const session = memory.editorSession();
      try {
        const value = await session.previewRecovery();
        if (!value) {
          session.dispose();
          return null;
        }
        retain(value.token, session);
        return {
          token: value.token,
          files: value.files.map((file) => ({ path: file.path, conflict: file.conflict })),
        };
      } catch (error) {
        session.dispose();
        throw error;
      }
    },
    recover: (token) => apply(token, 'recover'),
    cancelPreview(token) {
      previews.get(token)?.dispose();
      previews.delete(token);
    },
  };
}
