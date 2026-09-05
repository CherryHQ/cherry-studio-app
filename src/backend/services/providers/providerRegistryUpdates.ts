import type { ProviderRegistryUpdateEvent } from '@/shared/contracts';

type ProviderRegistryUpdateListener = (event: ProviderRegistryUpdateEvent) => void;

class ProviderRegistryUpdateChannel {
  private readonly listeners = new Set<ProviderRegistryUpdateListener>();
  private latest: ProviderRegistryUpdateEvent | undefined;

  emit(event: ProviderRegistryUpdateEvent): void {
    this.latest = event;
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  subscribe(listener: ProviderRegistryUpdateListener): () => void {
    this.listeners.add(listener);
    if (this.latest) {
      listener(this.latest);
    }
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.latest = undefined;
  }
}

export const providerRegistryUpdates = new ProviderRegistryUpdateChannel();
