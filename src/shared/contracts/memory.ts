/** Workflow controls for shared memory; private contents stay behind Agent-bound tools. */
export type MemoryMaintenanceStatus = {
  status: 'idle' | 'queued' | 'running' | 'failed' | 'cancelled';
  lastResult?: {
    outcome: 'completed' | 'failed' | 'cancelled';
    finishedAt: number;
    reason?: string;
  };
};
export type MemoryOperationResult = {
  confirmed: boolean;
  applied: number;
  conflicts: number;
  pending: number;
};
export interface MemoryModule {
  status(): Promise<MemoryMaintenanceStatus | undefined>;
  organize(): Promise<void>;
  previewClear(): Promise<{ token: string }>;
  clear(token: string): Promise<MemoryOperationResult>;
  previewRecovery(): Promise<{
    token: string;
    files: { path: string; conflict: boolean }[];
  } | null>;
  recover(token: string): Promise<MemoryOperationResult>;
  cancelPreview(token: string): void;
}

export class MemoryContextChangedError extends Error {
  constructor() {
    super('Conversation memory protection boundary changed');
    this.name = 'MemoryContextChangedError';
  }
}
