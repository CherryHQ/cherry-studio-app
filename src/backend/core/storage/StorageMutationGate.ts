import { BackupError } from '@/shared/contracts/backup';

/**
 * Set while a backup or restore holds the stores. The app-wide progress dialog already blocks
 * the user; this keeps work that starts without the UI (new Agent turns, background jobs) out.
 */
export class StorageMutationGate {
  private frozen = false;

  get isFrozen(): boolean {
    return this.frozen;
  }

  assertWritable(): void {
    if (this.frozen) throw new BackupError('busy');
  }

  freeze(): () => void {
    if (this.frozen) throw new BackupError('busy');
    this.frozen = true;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.frozen = false;
      }
    };
  }
}

export const storageMutationGate = new StorageMutationGate();
