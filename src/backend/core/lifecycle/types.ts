/**
 * Lifecycle framework types.
 *
 * Ported from Cherry Desktop `src/main/core/lifecycle/types.ts`. Two deliberate
 * differences, both documented in docs/references/lifecycle/README.md:
 *
 * - Phases are `Gate`/`PostReady` rather than Desktop's three Electron-relative
 *   phases; mobile's only real boundary is the first-paint gate.
 * - Desktop's `@Conditional` machinery is not ported. A capability that is
 *   unavailable on a platform registers a no-op implementation instead, so there
 *   is no exclusion set and no `getOptional()` twin.
 *
 * Enums are expressed as const objects because this repository uses no
 * TypeScript `enum`.
 */

/**
 * Bootstrap phase. Determines when a service initializes relative to the
 * first-paint gate.
 */
export const Phase = {
  /** Blocks first paint. A failure here aborts startup. */
  Gate: 'gate',
  /** Runs after the gate opens. Fire-and-forget; failures are logged only. */
  PostReady: 'postReady',
} as const;

export type Phase = (typeof Phase)[keyof typeof Phase];

/** Phase ordering for comparison (lower runs earlier). */
export const PhaseOrder: Record<Phase, number> = {
  [Phase.Gate]: 0,
  [Phase.PostReady]: 1,
};

/**
 * Lifecycle state of a single service.
 *
 * Created → Initializing → Ready ⇄ Paused
 *                ↑           ↓
 *                │        Stopping → Stopped → (restart) → Initializing
 *                │                      ↓
 *                └──────────────── Destroyed
 *
 * Activation is orthogonal: a Ready service may be activated or not, and
 * toggling it does not change this state.
 */
export const LifecycleState = {
  Created: 'created',
  Initializing: 'initializing',
  Ready: 'ready',
  Pausing: 'pausing',
  Paused: 'paused',
  Resuming: 'resuming',
  Stopping: 'stopping',
  Stopped: 'stopped',
  Destroyed: 'destroyed',
} as const;

export type LifecycleState = (typeof LifecycleState)[keyof typeof LifecycleState];

/**
 * How one service's teardown pass (`onStop` / `onDestroy`) ended.
 *
 * Orthogonal to `LifecycleState`, which does not encode it: anything but
 * `completed` leaves the state where it was. The state says where the service
 * is; this says how the framework's attempt ended.
 */
export type TeardownOutcome = 'completed' | 'timed_out' | 'failed';

/** Aggregate result of a `stopAll()` / `destroyAll()` pass. Empty on both counts means clean. */
export type TeardownSummary = {
  /** Services whose teardown exceeded the per-service ceiling and was abandoned. */
  timedOut: string[];
  /** Services whose teardown threw, or was skipped because their stop was still in flight. */
  failed: string[];
};

/**
 * Error handling strategy.
 *
 * Desktop's third option, `custom`, routes failures to a `SERVICE_ERROR` event
 * listener. It has no mobile use, so it is not ported: `Gate` services are
 * fail-fast and `PostReady` services are graceful.
 */
export type ErrorStrategy = 'fail-fast' | 'graceful';

/** Thrown when a fail-fast service fails to initialize. */
export class ServiceInitError extends Error {
  constructor(
    readonly serviceName: string,
    override readonly cause: Error,
  ) {
    super(`Service '${serviceName}' failed to initialize: ${cause.message}`);
    this.name = 'ServiceInitError';
  }
}

/** Thrown when the dependency graph contains a cycle. */
export class CircularDependencyError extends Error {
  constructor(readonly cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' -> ')}`);
    this.name = 'CircularDependencyError';
  }
}

/**
 * Declarative record of what a service does when the app leaves the foreground.
 *
 * Mobile-only and purely descriptive: the framework drives no AppState
 * behaviour. It exists so "what happens to this service in the background" is
 * auditable without reading every implementation.
 */
export type AppStatePolicyValue =
  /** Keeps working; the owner arranges its own execution window if it needs one. */
  | 'continue'
  /** Owns a native background surface (Live Activity, keep-alive audio). */
  | 'background-presentation'
  /** Suspends ordinary work and checks for stale remote data on foreground entry. */
  | 'foreground-refresh'
  /** Holds nothing that background transitions affect. */
  | 'not-applicable';

/** Service metadata, assembled from decorators at registration time. */
export type ServiceMetadata = {
  name: string;
  dependencies: string[];
  /** Ordering within a dependency layer; lower runs earlier. */
  priority: number;
  errorStrategy: ErrorStrategy;
  phase: Phase;
  appStatePolicy: AppStatePolicyValue;
};

export type ServiceConstructor<T = unknown> = new (...args: never[]) => T;

/** A service is addressed by its registered name or by its constructor. */
export type ServiceToken<T = unknown> = string | ServiceConstructor<T>;

export type ServiceEntry<T = unknown> = {
  metadata: ServiceMetadata;
  useClass: ServiceConstructor<T>;
  /** Populated on first resolution; every service is a singleton within its host. */
  instance?: T;
};

/** Node in the dependency graph used for topological sorting. */
export type DependencyNode = {
  name: string;
  dependencies: string[];
  priority: number;
  phase: Phase;
};

/**
 * Services that support pause/resume.
 *
 * Not driven by AppState — mobile services subscribe to that themselves. This
 * exists for deliberate, caller-initiated suspension such as a database
 * snapshot.
 */
export type Pausable = {
  onPause(): Promise<void> | void;
  onResume(): Promise<void> | void;
};

export function isPausable(service: unknown): service is Pausable {
  return (
    typeof service === 'object' &&
    service !== null &&
    'onPause' in service &&
    'onResume' in service &&
    typeof (service as Pausable).onPause === 'function' &&
    typeof (service as Pausable).onResume === 'function'
  );
}

/**
 * Services whose heavy resources sit behind a preference or feature gate.
 *
 * Unlike a platform capability — which registers a no-op implementation — an
 * activatable service is always registered and initialized, and only its
 * expensive resources come and go. Supports repeated cycles.
 */
export type Activatable = {
  /**
   * Load heavy resources. If this throws after partially allocating, it must
   * release what it allocated first: activation may be retried, because
   * `isActivated` stays false on failure.
   */
  onActivate(): Promise<void> | void;
  /** Release heavy resources. Safe even if `onActivate` never ran or failed. */
  onDeactivate(): Promise<void> | void;
};

export function isActivatable(service: unknown): service is Activatable {
  return (
    typeof service === 'object' &&
    service !== null &&
    'onActivate' in service &&
    'onDeactivate' in service &&
    typeof (service as Activatable).onActivate === 'function' &&
    typeof (service as Activatable).onDeactivate === 'function'
  );
}
