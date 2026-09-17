/** Changes that can invalidate an out-of-process model configuration projection. */
type ConfigurationObserver = {
  beforeChange(): Promise<void>;
  afterChange(): void;
};

const observers = new Set<ConfigurationObserver>();
let pendingWrites = 0;

export const modelConfigurationChanges = {
  hasPendingWrites: () => pendingWrites > 0,
  subscribe(observer: ConfigurationObserver): () => void {
    observers.add(observer);
    return () => observers.delete(observer);
  },
  async write<T>(write: () => Promise<T>): Promise<T> {
    pendingWrites += 1;
    const current = [...observers];
    try {
      // An observer must invalidate its external projection before the authoritative write.
      await Promise.all(current.map((observer) => observer.beforeChange()));
      return await write();
    } finally {
      pendingWrites -= 1;
      for (const observer of current) observer.afterChange();
    }
  },
};
