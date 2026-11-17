import { loggerService } from '@logger';

import type { SystemIntegrationNativeModule } from '../../../../modules/system-integration';

type Options = {
  native: Pick<SystemIntegrationNativeModule, 'getAppIcon' | 'setAppIcon'> | null;
  isEnterprise(): boolean;
  foreground: { isActive(): boolean; subscribe(listener: () => void): () => void };
};

/** Keeps the installed launcher icon in sync with the selected account space. */
export class AppIconRuntime {
  private pending: Promise<void> = Promise.resolve();
  private unsubscribeForeground?: () => void;

  constructor(private readonly options: Options) {}

  start(): void {
    if (this.unsubscribeForeground) return;
    const sync = () => {
      void this.synchronize().catch((error: unknown) => {
        loggerService.withContext('AppIcon').warn('Could not synchronize the app icon', { error });
      });
    };
    this.unsubscribeForeground = this.options.foreground.subscribe(sync);
    sync();
  }

  stop(): void {
    this.unsubscribeForeground?.();
    this.unsubscribeForeground = undefined;
  }

  /** Read the selected profile when work executes, including after a queued native change. */
  readonly synchronize = (): Promise<void> => {
    const result = this.pending.then(() => this.apply());
    this.pending = result.catch(() => {});
    return result;
  };

  private async apply(): Promise<void> {
    const native = this.options.native;
    if (!native?.getAppIcon || !native.setAppIcon) return;
    while (true) {
      const current = await native.getAppIcon();
      if (!current.isSupported || !this.options.foreground.isActive()) return;
      const target = this.options.isEnterprise() ? 'enterprise' : 'community';
      if (current.icon !== target) await native.setAppIcon(target);
      const latest = this.options.isEnterprise() ? 'enterprise' : 'community';
      if (latest === target) return;
    }
  }
}
