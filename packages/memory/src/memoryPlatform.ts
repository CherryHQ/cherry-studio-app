/** Only the adapter owns physical paths, platform path validation and recoverable publication. */
export interface MemoryFileSystem {
  ensureDirectory(root: string, relative: string): Promise<void>;
  assertPath(root: string, relative: string): Promise<void>;
  list(root: string, relative: string): Promise<readonly { name: string; directory: boolean }[]>;
  read(root: string, relative: string): Promise<Uint8Array | null>;
  /** Recheck assertCurrent immediately before publication, including deletion. */
  replace(
    root: string,
    relative: string,
    bytes: Uint8Array | null,
    assertCurrent: () => void,
  ): Promise<void>;
  /** Same physical file must have the same identity, including aliases. */
  identity(root: string, relative: string): Promise<string | null>;
}

export interface MemoryPlatform {
  files: MemoryFileSystem;
  hash(bytes: Uint8Array): string;
  randomUUID(): string;
  now(): number;
  caseSensitive: boolean;
}

/** FIFO serialization for one storage scope; rejected work never poisons later admission. */
export class MemoryLock {
  private pending: Promise<unknown> = Promise.resolve();
  runExclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.pending.catch(() => undefined).then(work);
    this.pending = result;
    return result;
  }
}
