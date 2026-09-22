import { BackupError } from '@/shared/contracts/backup';

/** A process-local barrier; restoration never retargets a live process's storage. */
export class StorageMutationGate {
  private active = 0;
  private frozen = false;

  get isFrozen(): boolean {
    return this.frozen;
  }

  assertWritable(): void {
    if (this.frozen) throw new BackupError('busy');
  }

  enter(): () => void {
    this.assertWritable();
    this.active += 1;
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.active -= 1;
      }
    };
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const release = this.enter();
    try {
      return await operation();
    } finally {
      release();
    }
  }

  freeze(): () => void {
    if (this.frozen || this.active !== 0) throw new BackupError('busy');
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
