import { raceAbort } from '@/backend/utils/raceAbort';
import { BackupError } from '@/shared/contracts/backup';

/**
 * Set while a backup or restore holds the stores. The app-wide progress dialog already blocks
 * the user; this keeps work that starts without the UI (new Agent turns, background jobs) out.
 */
export class StorageMutationGate {
  private frozenUntil: Promise<void> | undefined;

  get isFrozen(): boolean {
    return this.frozenUntil !== undefined;
  }

  assertWritable(): void {
    if (this.isFrozen) throw new BackupError('busy');
  }

  async waitUntilWritable(signal: AbortSignal): Promise<void> {
    while (this.frozenUntil) await raceAbort(this.frozenUntil, signal);
    signal.throwIfAborted();
  }

  freeze(): () => void {
    this.assertWritable();
    let thaw!: () => void;
    const frozenUntil = new Promise<void>((resolve) => {
      thaw = resolve;
    });
    this.frozenUntil = frozenUntil;
    return () => {
      if (this.frozenUntil === frozenUntil) {
        this.frozenUntil = undefined;
        thaw();
      }
    };
  }
}

export const storageMutationGate = new StorageMutationGate();
