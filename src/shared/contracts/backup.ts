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
  /** Size of the archive file. */
  bytes: number;
  pluginConnections: number;
}

/** A finished export waiting for the user to save or share it. */
export interface BackupExport {
  uri: string;
  filename: string;
  sessions: number;
  messages: number;
  files: number;
  /** Size of the archive file. */
  bytes: number;
}

/** How the latest restore attempt ended; reported once, on the first boot that settles it. */
export type RestoreOutcome = 'restored' | 'rolled-back';

export interface BackupState {
  phase:
    | 'idle'
    | 'capturing'
    | 'packing'
    | 'exported'
    | 'validating'
    | 'ready'
    | 'staging'
    | 'restart-required';
  completed: number;
  total: number;
  /** Set while `phase` is `exported`. */
  exported?: BackupExport;
  /** Set while `phase` is `ready`. */
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
  /** Aborts running work, or dismisses a finished export or restore preview. */
  cancel(): void;
}
