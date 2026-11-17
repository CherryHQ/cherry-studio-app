import { loggerService } from '@logger';

import { Emitter } from '@/backend/core/lifecycle/event';
import type { AppIconModule, AppIconState } from '@/shared/contracts/appIcon';

import type { SystemIntegrationNativeModule } from '../../../../modules/system-integration';

type Options = {
  native: Pick<SystemIntegrationNativeModule, 'getAppIcon' | 'setAppIcon'> | null;
  settings: { read(): boolean; write(enabled: boolean): void };
  isEnterprise(): boolean;
  foreground: { isActive(): boolean; subscribe(listener: () => void): () => void };
};

/** One installation's launcher choice, independent of profile-owned preferences and stores. */
export class AppIconRuntime implements AppIconModule {
  private readonly changes = new Emitter<void>();
  private state: AppIconState;
  private pending: Promise<void> = Promise.resolve();
  private unsubscribeForeground?: () => void;

  constructor(private readonly options: Options) {
    this.state = { isSupported: false, followsAccount: options.settings.read(), isBusy: false };
  }

  readonly getState = (): AppIconState => this.state;
  readonly subscribe = (listener: () => void) => {
    const subscription = this.changes.event(listener);
    return () => subscription.dispose();
  };

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

  readonly setFollowAccount = (enabled: boolean): Promise<void> =>
    this.enqueue(async () => {
      if (!(await this.apply(enabled))) throw new Error('App icon switching is unavailable');
      this.options.settings.write(enabled);
      this.update({ followsAccount: enabled });
    });

  /** Read the selected profile when work executes, including after a queued native change. */
  readonly synchronize = (): Promise<void> =>
    this.enqueue(async () => {
      await this.apply(this.state.followsAccount);
    });

  private async apply(followsAccount: boolean): Promise<boolean> {
    const native = this.options.native;
    if (!native?.getAppIcon || !native.setAppIcon) return false;
    while (true) {
      const current = await native.getAppIcon();
      this.update({ isSupported: current.isSupported });
      if (!current.isSupported || !this.options.foreground.isActive()) return false;
      const target = followsAccount && this.options.isEnterprise() ? 'enterprise' : 'community';
      if (current.icon !== target) await native.setAppIcon(target);
      const latest = followsAccount && this.options.isEnterprise() ? 'enterprise' : 'community';
      if (latest === target) return true;
    }
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.pending.then(async () => {
      this.update({ isBusy: true });
      try {
        await operation();
      } finally {
        this.update({ isBusy: false });
      }
    });
    this.pending = result.catch(() => {});
    return result;
  }

  private update(patch: Partial<AppIconState>): void {
    if (
      Object.entries(patch).every(([key, value]) => this.state[key as keyof AppIconState] === value)
    )
      return;
    this.state = { ...this.state, ...patch };
    this.changes.fire();
  }
}
