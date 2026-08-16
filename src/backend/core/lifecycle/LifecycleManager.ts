import { loggerService } from '@logger';

import type { BaseService } from './BaseService';
import { DependencyResolver } from './DependencyResolver';
import type { ServiceContainer } from './ServiceContainer';
import {
  LifecycleState,
  Phase,
  ServiceInitError,
  type TeardownOutcome,
  type TeardownSummary,
} from './types';

const logger = loggerService.withContext('Lifecycle');

/** Ceiling for one service's `onStop` or `onDestroy`. Matches desktop. */
export const SERVICE_TEARDOWN_TIMEOUT_MS = 5000;

/**
 * Race a teardown against a ceiling.
 *
 * The loser is **not** cancelled — it keeps running, overlapping whatever the
 * pass does next. That is accepted: no service may pin its correctness on
 * `onStop`, because the OS kills mobile apps without running it at all.
 *
 * The timer must be cleared, or one leaked multi-second timer per service
 * outlives an otherwise instant teardown.
 */
export async function raceWithTimeout(
  run: Promise<TeardownOutcome>,
  timeoutMs: number,
): Promise<TeardownOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<TeardownOutcome>((resolve) => {
    timer = setTimeout(() => resolve('timed_out'), timeoutMs);
  });
  try {
    return await Promise.race([run, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Log one teardown pass.
 *
 * A clean pass says so; any other pass must not, because that line is the first
 * thing read when diagnosing a bad shutdown and claiming success over a starved
 * service is the false signal this mechanism exists to remove.
 */
function logTeardownSummary(
  pass: 'stop' | 'destroy',
  summary: TeardownSummary,
  durationMs: number,
): void {
  const elapsed = `${durationMs.toFixed(1)}ms`;
  if (summary.timedOut.length === 0 && summary.failed.length === 0) {
    logger.info(`All services ${pass === 'stop' ? 'stopped' : 'destroyed'} (${elapsed})`);
    return;
  }
  logger.warn(
    `Service ${pass} pass finished with ${summary.timedOut.length} timeout(s), ${summary.failed.length} failure(s) (${elapsed})`,
    { failed: summary.failed, timedOut: summary.timedOut },
  );
}

/**
 * Drives services through their lifecycle for one host generation.
 *
 * Ported from Cherry Desktop `src/main/core/lifecycle/LifecycleManager.ts`,
 * minus the pieces that do not apply: it is not a singleton (one per host), it
 * emits no lifecycle event bus (nothing consumes it), it carries no CPU profiler
 * or event-loop lag sampler (Node-only), and it has no cascade pause/stop
 * bookkeeping (mobile starts and stops whole hosts, never single services).
 */
export class LifecycleManager {
  private readonly resolver = new DependencyResolver();
  private readonly initializationOrder: string[] = [];
  private readonly serviceTiming = new Map<string, number>();
  private phasesValidated = false;

  constructor(private readonly container: ServiceContainer) {}

  /**
   * Promote `PostReady` services that a `Gate` service depends on.
   * Idempotent; runs once before the first phase starts.
   */
  validatePhases(): void {
    if (this.phasesValidated) return;

    const graph = this.container.buildDependencyGraph();
    for (const adjustment of this.resolver.hoistGateDependencies(graph)) {
      this.container.updatePhase(adjustment.serviceName, adjustment.to);
    }
    this.phasesValidated = true;
  }

  /**
   * Initialize every service in a phase, layer by layer.
   *
   * Layers run in sequence; peers inside a layer run in parallel. A rejection
   * from any peer aborts the phase — `handleError` only rethrows for fail-fast
   * services, so a graceful failure never reaches here.
   */
  async startPhase(phase: Phase): Promise<void> {
    this.validatePhases();

    const graph = this.container.buildDependencyGraph(phase);
    if (graph.length === 0) {
      logger.debug(`No services registered for phase '${phase}'`);
      return;
    }

    const layers = this.resolver.resolveLayered(graph);
    const order = layers.map((layer) => `[${layer.join(', ')}]`).join(' -> ');
    logger.info(`--- ${phase} start (${layers.flat().length} services) --- ${order}`);

    const startedAt = performance.now();

    for (const layer of layers) {
      const results = await Promise.allSettled(
        layer.map((serviceName) => this.initializeService(serviceName)),
      );
      for (const result of results) {
        if (result.status === 'rejected') {
          throw result.reason;
        }
      }
      this.initializationOrder.push(...layer);
    }

    logger.info(`--- ${phase} complete (${(performance.now() - startedAt).toFixed(1)}ms) ---`);
  }

  /**
   * Run `onAllReady` on every initialized service, at most once each.
   *
   * Failures are isolated: this runs after the gate has opened, so one service's
   * scheduling mistake must not take down the others.
   */
  async runAllReady(): Promise<void> {
    for (const serviceName of this.initializationOrder) {
      const instance = this.container.peek<BaseService>(serviceName);
      if (!instance) continue;

      try {
        await instance._doAllReady();
      } catch (error) {
        logger.error(`Service '${serviceName}' failed in onAllReady`, error as Error);
      }
    }
  }

  /**
   * Stop every service in reverse initialization order.
   *
   * Each service gets its own ceiling, so one stuck `onStop` cannot starve the
   * services queued behind it. What this guarantees is that stops are
   * *initiated* in reverse order and that no single async wait exceeds the
   * ceiling — not that the pass is strictly serial (an abandoned teardown keeps
   * running) and not a hard wall-clock bound (a synchronously blocking `onStop`
   * cannot be preempted by a timer).
   */
  async stopAll(): Promise<TeardownSummary> {
    const summary: TeardownSummary = { failed: [], timedOut: [] };
    const startedAt = performance.now();

    for (const serviceName of [...this.initializationOrder].reverse()) {
      const outcome = await this.stopService(serviceName);
      if (outcome === 'timed_out') summary.timedOut.push(serviceName);
      else if (outcome === 'failed') summary.failed.push(serviceName);
    }

    logTeardownSummary('stop', summary, performance.now() - startedAt);
    return summary;
  }

  /** Destroy every service in reverse order, with the same ceiling and guarantees as {@link stopAll}. */
  async destroyAll(): Promise<TeardownSummary> {
    const summary: TeardownSummary = { failed: [], timedOut: [] };
    const startedAt = performance.now();

    for (const serviceName of [...this.initializationOrder].reverse()) {
      const outcome = await this.destroyService(serviceName);
      if (outcome === 'timed_out') summary.timedOut.push(serviceName);
      else if (outcome === 'failed') summary.failed.push(serviceName);
    }

    this.initializationOrder.length = 0;
    logTeardownSummary('destroy', summary, performance.now() - startedAt);
    return summary;
  }

  /** Per-service initialization duration, for startup diagnostics. */
  getTimings(): ReadonlyMap<string, number> {
    return this.serviceTiming;
  }

  private async initializeService(serviceName: string): Promise<void> {
    const metadata = this.container.getMetadata(serviceName);
    if (!metadata) return;

    try {
      const instance = this.container.get<BaseService>(serviceName);
      const startedAt = performance.now();

      this.container.beginInitWindow(serviceName);
      try {
        await instance._doInit();
      } finally {
        this.container.endInitWindow();
      }

      const duration = performance.now() - startedAt;
      this.serviceTiming.set(serviceName, duration);
      logger.debug(`Service '${serviceName}' initialized (${duration.toFixed(1)}ms)`);
    } catch (error) {
      this.handleInitError(serviceName, error as Error);
    }
  }

  /**
   * Fail-fast rethrows as `ServiceInitError`, aborting the phase. Graceful logs
   * and returns, leaving the service in whatever state it reached.
   */
  private handleInitError(serviceName: string, error: Error): void {
    const strategy = this.container.getMetadata(serviceName)?.errorStrategy ?? 'graceful';

    if (strategy === 'fail-fast') {
      logger.error(`Service '${serviceName}' failed to initialize (fail-fast)`, error);
      throw new ServiceInitError(serviceName, error);
    }

    logger.error(`Service '${serviceName}' failed to initialize (continuing)`, error);
  }

  private async stopService(serviceName: string): Promise<TeardownOutcome> {
    const instance = this.container.peek<BaseService>(serviceName);
    if (!instance) return 'completed';

    const run = instance
      ._doStop()
      .then((): TeardownOutcome => 'completed')
      .catch((error: unknown): TeardownOutcome => {
        logger.error(`Service '${serviceName}' failed to stop`, error as Error);
        return 'failed';
      });

    const outcome = await raceWithTimeout(run, SERVICE_TEARDOWN_TIMEOUT_MS);
    if (outcome === 'timed_out') {
      logger.warn(
        `Service '${serviceName}' stop exceeded ${SERVICE_TEARDOWN_TIMEOUT_MS}ms; moving on`,
      );
    }
    return outcome;
  }

  private async destroyService(serviceName: string): Promise<TeardownOutcome> {
    const instance = this.container.peek<BaseService>(serviceName);
    if (!instance) return 'completed';

    const run = instance
      ._doDestroy()
      .then((): TeardownOutcome => {
        // `_doDestroy` skips itself when a stop is still in flight, so a
        // fulfilled promise does not prove the service was destroyed. Reporting
        // that as success would hide exactly the case worth surfacing.
        return instance.state === LifecycleState.Destroyed ? 'completed' : 'failed';
      })
      .catch((error: unknown): TeardownOutcome => {
        logger.error(`Service '${serviceName}' failed to destroy`, error as Error);
        return 'failed';
      });

    const outcome = await raceWithTimeout(run, SERVICE_TEARDOWN_TIMEOUT_MS);
    if (outcome === 'timed_out') {
      logger.warn(
        `Service '${serviceName}' destroy exceeded ${SERVICE_TEARDOWN_TIMEOUT_MS}ms; moving on`,
      );
    }
    return outcome;
  }
}
