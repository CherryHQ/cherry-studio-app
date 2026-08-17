import { loggerService } from '@logger';

import {
  LifecycleManager,
  raceWithTimeout,
  SERVICE_TEARDOWN_TIMEOUT_MS,
} from '../lifecycle/LifecycleManager';
import { ServiceContainer } from '../lifecycle/ServiceContainer';
import { Phase, type ServiceConstructor, type TeardownSummary } from '../lifecycle/types';

const logger = loggerService.withContext('Lifecycle');

export type HostProfile = {
  /** Service constructors to register. Usually `serviceList`. */
  readonly services: readonly ServiceConstructor[];
  /**
   * Pre-built instances that win over construction and receive no lifecycle
   * callbacks. The test seam: an in-memory `DbService` fake goes here and does
   * not have to extend `BaseService`.
   */
  readonly overrides?: Readonly<Record<string, unknown>>;
};

export type HostState = 'created' | 'starting' | 'ready' | 'disposing' | 'disposed';

/**
 * One generation of services: a container, a lifecycle manager, and the
 * instances they hold.
 *
 * This has no desktop counterpart — a desktop process has exactly one service
 * graph for its whole life. Mobile needs the graph to be replaceable inside one
 * process: every test installs its own, and Fast Refresh replaces the app's.
 *
 * **Construction claims nothing.** No database is opened, no job is claimed, no
 * audio session starts until `start()` runs. That is what makes replacement
 * safe: `application.install()` awaits the outgoing host's disposal before
 * starting the incoming one, so two generations never hold the same SQLite
 * connection or job claim at once.
 */
export class ApplicationHost {
  readonly container: ServiceContainer;

  private readonly lifecycle: LifecycleManager;
  private hostState: HostState = 'created';
  private disposal: Promise<TeardownSummary> | null = null;
  private postReady: Promise<void> | null = null;

  constructor(profile: HostProfile) {
    this.container = new ServiceContainer(profile.overrides);
    this.container.registerAll(profile.services);
    this.lifecycle = new LifecycleManager(this.container);
  }

  get state(): HostState {
    return this.hostState;
  }

  /**
   * Run the `Gate` phase.
   *
   * Rejects if a fail-fast service fails, leaving the host in `starting`; the
   * caller is expected to dispose it. Nothing here blocks on `PostReady` work.
   */
  async start(): Promise<void> {
    if (this.hostState !== 'created') {
      throw new Error(`[ApplicationHost] Cannot start a host in state '${this.hostState}'`);
    }

    this.hostState = 'starting';
    await this.lifecycle.startPhase(Phase.Gate);
    this.hostState = 'ready';
  }

  /**
   * Start `PostReady` services and run every service's `onAllReady`.
   *
   * Fire-and-forget by contract: this runs after the gate has opened, so it
   * swallows its own failures rather than surfacing them to the UI.
   */
  runPostReady(): void {
    if (this.hostState !== 'ready') {
      logger.warn(`Skipping post-ready work: host is '${this.hostState}'`);
      return;
    }

    // One phase run per generation. Keeping the promise is also what lets
    // disposal serialize behind initialization instead of stopping a partial
    // graph while another service is still becoming Ready.
    this.postReady ??= (async () => {
      try {
        await this.lifecycle.startPhase(Phase.PostReady);
        await this.lifecycle.runAllReady();
      } catch (error) {
        logger.error('Post-ready work failed', error as Error);
      }
    })();
  }

  /**
   * Stop then destroy every service, in reverse initialization order.
   *
   * Idempotent: concurrent and repeated calls share one promise, matching the
   * disposal contract every existing mobile runtime already follows.
   */
  dispose(): Promise<TeardownSummary> {
    this.disposal ??= this.runDisposal();
    return this.disposal;
  }

  private async runDisposal(): Promise<TeardownSummary> {
    this.hostState = 'disposing';

    // PostReady is off the first-paint path, not outside the host lifetime. If
    // it is already initializing, let it finish before deriving the reverse
    // stop order; otherwise a service can become Ready after the stop pass and
    // keep subscriptions, timers, or native resources from a dead generation.
    const postReadyOutcome = await raceWithTimeout(
      (this.postReady ?? Promise.resolve()).then(() => 'completed' as const),
      SERVICE_TEARDOWN_TIMEOUT_MS,
    );
    if (postReadyOutcome === 'timed_out') {
      logger.warn(
        `Post-ready initialization exceeded ${SERVICE_TEARDOWN_TIMEOUT_MS}ms; continuing disposal`,
      );
    }

    const stopped = await this.lifecycle.stopAll();
    const destroyed = await this.lifecycle.destroyAll();

    this.hostState = 'disposed';

    return {
      failed: [...stopped.failed, ...destroyed.failed],
      timedOut: [...stopped.timedOut, ...destroyed.timedOut],
    };
  }
}
