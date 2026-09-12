import { loggerService } from '@logger';

import {
  getAppStatePolicy,
  getDependencies,
  getErrorStrategy,
  getPhase,
  getPriority,
  getServiceName,
} from './decorators';
import type {
  DependencyNode,
  Phase,
  ServiceConstructor,
  ServiceEntry,
  ServiceMetadata,
  ServiceToken,
} from './types';

const logger = loggerService.withContext('Lifecycle');

/**
 * Registration and resolution for one ApplicationHost generation.
 *
 * Ported from Cherry Desktop `src/main/core/lifecycle/ServiceContainer.ts` with
 * two structural changes:
 *
 * - It is **not** a singleton. Desktop's container is process-global because a
 *   desktop process has exactly one service graph; mobile needs a graph per host
 *   so tests and Fast Refresh can replace one wholesale.
 * - Conditional registration is gone. A capability unavailable on a platform
 *   registers a no-op implementation, so there is no exclusion set, no
 *   `getOptional()`, and no transitive exclusion pass.
 *
 * Overrides are the test seam: an instance supplied here wins over construction
 * and never receives lifecycle callbacks, so a duck-typed fake (the in-memory
 * `DbService`, for instance) does not have to extend `BaseService`.
 */
export class ServiceContainer {
  private readonly services = new Map<string, ServiceEntry>();
  private readonly overrides: ReadonlyMap<string, unknown>;

  /**
   * Service whose `onInit`/`onReady` is currently running, for the undeclared
   * dependency check. Null while constructing instances, because constructor
   * injection resolves declared dependencies by definition.
   */
  private initializingService: string | null = null;

  constructor(overrides: Readonly<Record<string, unknown>> = {}) {
    this.overrides = new Map(Object.entries(overrides));
  }

  register<T>(target: ServiceConstructor<T>): void {
    const name = getServiceName(target);

    if (this.services.has(name)) {
      logger.warn(`Service '${name}' is already registered, skipping`);
      return;
    }

    const metadata: ServiceMetadata = {
      name,
      dependencies: getDependencies(target),
      priority: getPriority(target),
      errorStrategy: getErrorStrategy(target),
      phase: getPhase(target),
      appStatePolicy: getAppStatePolicy(target),
    };

    this.services.set(name, { metadata, useClass: target });
  }

  registerAll(targets: readonly ServiceConstructor[]): void {
    for (const target of targets) {
      this.register(target);
    }
  }

  /**
   * Resolve a service, constructing it on first use.
   *
   * Every service is a singleton within its host. Resolving a name that was not
   * registered throws — including from module scope before any host exists,
   * which is what stops a module-level `application.get()` from capturing a
   * stale instance.
   */
  get<T>(token: ServiceToken<T>): T {
    const name = typeof token === 'string' ? token : getServiceName(token);

    this.checkUndeclaredResolution(name);

    const override = this.overrides.get(name);
    if (override !== undefined) {
      return override as T;
    }

    const entry = this.services.get(name);
    if (!entry) {
      throw new Error(`[ServiceContainer] Service '${name}' is not registered`);
    }

    if (entry.instance !== undefined) {
      return entry.instance as T;
    }

    // Constructor injection resolves declared dependencies, so suspend the
    // undeclared-dependency check for the duration.
    const outerTracking = this.initializingService;
    this.initializingService = null;
    try {
      const instance = this.createInstance(entry);
      entry.instance = instance;
      return instance as T;
    } finally {
      this.initializingService = outerTracking;
    }
  }

  has(token: ServiceToken): boolean {
    const name = typeof token === 'string' ? token : getServiceName(token);
    return this.services.has(name) || this.overrides.has(name);
  }

  /** The already-constructed instance, if any. Does not construct. */
  peek<T>(token: ServiceToken<T>): T | undefined {
    const name = typeof token === 'string' ? token : getServiceName(token);
    const override = this.overrides.get(name);
    if (override !== undefined) return override as T;
    return this.services.get(name)?.instance as T | undefined;
  }

  getMetadata(token: ServiceToken): ServiceMetadata | undefined {
    const name = typeof token === 'string' ? token : getServiceName(token);
    return this.services.get(name)?.metadata;
  }

  /** Names of services the lifecycle manages — overridden ones are excluded. */
  getManagedNames(): string[] {
    return [...this.services.keys()].filter((name) => !this.overrides.has(name));
  }

  isOverridden(name: string): boolean {
    return this.overrides.has(name);
  }

  /** Dependency graph nodes, optionally for one phase only. Overridden services are excluded. */
  buildDependencyGraph(phase?: Phase): DependencyNode[] {
    const nodes: DependencyNode[] = [];

    for (const entry of this.services.values()) {
      const { metadata } = entry;
      if (this.overrides.has(metadata.name)) continue;
      if (phase !== undefined && metadata.phase !== phase) continue;

      nodes.push({
        name: metadata.name,
        dependencies: metadata.dependencies,
        priority: metadata.priority,
        phase: metadata.phase,
      });
    }

    return nodes;
  }

  /** Applied after `DependencyResolver.hoistGateDependencies` adjusts a node. */
  updatePhase(name: string, phase: Phase): void {
    const entry = this.services.get(name);
    if (entry) {
      entry.metadata.phase = phase;
    }
  }

  /**
   * Mark the window in which a service's `onInit`/`onReady` runs.
   *
   * Resolving an undeclared service is legal at runtime — it is how a
   * dependency cycle is broken — but during initialization it escapes the
   * ordering graph, so it is reported.
   */
  beginInitWindow(name: string): void {
    this.initializingService = name;
  }

  endInitWindow(): void {
    this.initializingService = null;
  }

  private checkUndeclaredResolution(resolved: string): void {
    const isDevelopment = typeof __DEV__ !== 'undefined' && __DEV__;
    if (!isDevelopment || this.initializingService === null) return;
    if (this.initializingService === resolved) return;

    const declared = this.services.get(this.initializingService)?.metadata.dependencies ?? [];
    if (declared.includes(resolved)) return;

    logger.warn(
      `Service '${this.initializingService}' resolved '${resolved}' during initialization without declaring it. ` +
        `Add it to @DependsOn, or move the resolution out of onInit/onReady if it is a deliberate runtime back-edge.`,
    );
  }

  private createInstance(entry: ServiceEntry): unknown {
    const dependencies = entry.metadata.dependencies.map((name) => {
      if (!this.has(name)) {
        throw new Error(
          `[ServiceContainer] Dependency '${name}' of service '${entry.metadata.name}' is not registered`,
        );
      }
      return this.get(name);
    });

    return new entry.useClass(...(dependencies as never[]));
  }
}
