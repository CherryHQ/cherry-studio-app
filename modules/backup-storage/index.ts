import { requireOptionalNativeModule } from 'expo';

export interface BackupStorageModule {
  processId(): string;
  restartAfterRestore?(): Promise<void>;
  readControl(documentUri: string): string | null;
  writeControl(documentUri: string, value: string): void;
  hashFile(uri: string): Promise<string>;
  sealDirectory(uri: string): Promise<void>;
}

export function getBackupStorage(): BackupStorageModule | null {
  return requireOptionalNativeModule<BackupStorageModule>('BackupStorage');
}
