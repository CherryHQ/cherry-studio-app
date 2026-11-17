import { loggerService } from '@logger';

import type { SystemIntegrationNativeModule } from '../../../../modules/system-integration';

type Options = {
  native: Pick<SystemIntegrationNativeModule, 'getAppIcon' | 'setAppIcon'> | null;
  isEnterprise(): boolean;
  foreground: { isActive(): boolean; subscribe(listener: () => void): () => void };
};

/** Keeps the installed launcher icon in sync with the active account space. */
export class AppIconRuntime {
  private running?: Promise<void>;
  private unsubscribeForeground?: () => void;

  constructor(private readonly options: Options) {}

  start(): void {
    if (this.unsubscribeForeground) return;
    this.unsubscribeForeground = this.options.foreground.subscribe(() => void this.synchronize());
    void this.synchronize();
  }

  stop(): void {
    this.unsubscribeForeground?.();
    this.unsubscribeForeground = undefined;
  }

  /** Overlapping calls share one native round trip; failures retry on the next foreground. */
  synchronize(): Promise<void> {
    this.running ??= this.apply()
      .catch((error: unknown) => {
        loggerService.withContext('AppIcon').warn('Could not synchronize the app icon', { error });
      })
      .finally(() => {
        this.running = undefined;
      });
    return this.running;
  }

  private async apply(): Promise<void> {
    const native = this.options.native;
    if (!native?.getAppIcon || !native.setAppIcon) return;
    const current = await native.getAppIcon();
    if (!current.isSupported || !this.options.foreground.isActive()) return;
    const target = this.options.isEnterprise() ? 'enterprise' : 'community';
    if (current.icon !== target) await native.setAppIcon(target);
  }
}
