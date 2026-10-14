import { requireOptionalNativeModule } from 'expo';

import type { DiscoveryEvent } from './DesktopEndpointResolver';

type DiscoveryModule = {
  addListener(
    event: 'change',
    listener: (event: DiscoveryEvent & { generation: number }) => void,
  ): { remove(): void };
  start(generation: number): void;
  setBrowsing(value: boolean): void;
  stop(): void;
};

/** One platform browser shared by all desktop recovery rounds in this host. */
export class DesktopDiscovery {
  private native?: DiscoveryModule | null;
  private subscription?: { remove(): void };
  private users = 0;
  private active = false;
  private generation = 0;

  constructor(private readonly receive: (event: DiscoveryEvent) => void) {}

  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active;
    if (!active) {
      this.subscription?.remove();
      this.subscription = undefined;
      this.native?.stop();
      return;
    }
    this.native ??= requireOptionalNativeModule<DiscoveryModule>('RemoteDiscovery');
    if (!this.native) {
      this.receive({ type: 'unavailable' });
      return;
    }
    const generation = ++this.generation;
    this.subscription = this.native.addListener('change', (event) => {
      if (this.active && this.generation === generation && event.generation === generation)
        this.receive(event);
    });
    this.native.start(generation);
    this.native.setBrowsing(this.users > 0);
  }

  browse() {
    this.users++;
    if (this.active && this.users === 1) this.native?.setBrowsing(true);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      if (--this.users === 0) this.native?.setBrowsing(false);
    };
  }
}
