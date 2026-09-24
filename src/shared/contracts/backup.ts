export type BackupErrorCode =
  | 'unavailable'
  | 'busy'
  | 'cancelled'
  | 'invalid'
  | 'incompatible'
  | 'too-large'
  | 'disk-space'
  | 'missing-files'
  | 'storage'
  | 'restart-required';

export class BackupError extends Error {
  constructor(
    readonly code: BackupErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = 'BackupError';
  }
}

export interface BackupPreview {
  id: string;
  createdAt: string;
  appVersion: string;
  platform: string;
  sessions: number;
  messages: number;
  files: number;
  bytes: number;
  pluginConnections: number;
}

/** How the latest restore attempt ended; reported once, on the first boot that settles it. */
export type RestoreOutcome = 'restored' | 'rolled-back';

export interface BackupState {
  phase: 'idle' | 'capturing' | 'packing' | 'validating' | 'ready' | 'staging' | 'restart-required';
  completed: number;
  total: number;
  preview?: BackupPreview;
}

export interface BackupModule {
  isAvailable(): boolean;
  getState(): BackupState;
  takeRestoreOutcome(): RestoreOutcome | undefined;
  subscribe(listener: () => void): () => void;
  createBackup(): Promise<{ uri: string; filename: string }>;
  prepareRestore(uri: string): Promise<void>;
  applyRestore(candidateId: string): Promise<void>;
  cancel(): void;
}
