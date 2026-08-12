import 'reflect-metadata';
import {
  type AppStatePolicyValue,
  type ErrorStrategy,
  Phase,
  type ServiceConstructor,
} from './types';

/**
 * Service metadata decorators.
 *
 * Ported from Cherry Desktop `src/main/core/lifecycle/decorators.ts`. Every
 * decorator takes its arguments explicitly, so `emitDecoratorMetadata` and
 * constructor type reflection are not required — only `experimentalDecorators`
 * plus `@babel/plugin-proposal-decorators` in legacy mode.
 *
 * Desktop's `@Conditional` is not ported; see types.ts for why.
 */

const METADATA_KEYS = {
  INJECTABLE: 'lifecycle:injectable',
  SERVICE_NAME: 'lifecycle:serviceName',
  DEPENDENCIES: 'lifecycle:dependencies',
  PRIORITY: 'lifecycle:priority',
  ERROR_STRATEGY: 'lifecycle:errorStrategy',
  PHASE: 'lifecycle:phase',
  APP_STATE_POLICY: 'lifecycle:appStatePolicy',
} as const;

const DEFAULT_PRIORITY = 100;

/**
 * Mark a class as a lifecycle service.
 *
 * @param name Explicit service name. Required rather than derived from
 *   `target.name` because bundlers mangle class names. It must match the key
 *   used in the service registry, `application.get(name)`, and `@DependsOn`.
 */
export function Injectable(name: string): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(METADATA_KEYS.INJECTABLE, true, target);
    Reflect.defineMetadata(METADATA_KEYS.SERVICE_NAME, name, target);
  };
}

/**
 * Declare the services this one needs.
 *
 * Dependencies are constructed and initialized first, and torn down after.
 * Resolving an undeclared service at runtime is legal — it is how a dependency
 * cycle is broken — but doing so during `onInit` escapes the ordering graph and
 * the container warns about it in development.
 */
export function DependsOn(dependencies: string[]): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(METADATA_KEYS.DEPENDENCIES, dependencies, target);
  };
}

/** Ordering within a dependency layer; lower runs earlier. Defaults to 100. */
export function Priority(priority: number): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(METADATA_KEYS.PRIORITY, priority, target);
  };
}

/**
 * Override the error strategy implied by the phase.
 *
 * Rarely needed: `Gate` services are fail-fast and `PostReady` services are
 * graceful by default. Use this for a `Gate` service that must initialize early
 * but whose failure should not abort startup.
 */
export function ErrorHandling(strategy: ErrorStrategy): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(METADATA_KEYS.ERROR_STRATEGY, strategy, target);
  };
}

/** Set the bootstrap phase. Defaults to `Phase.Gate`. */
export function ServicePhase(phase: Phase): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(METADATA_KEYS.PHASE, phase, target);
  };
}

/**
 * Declare what this service does when the app leaves the foreground.
 *
 * Documentation and audit only — the framework drives no AppState behaviour.
 * Services that care subscribe through `BaseService.registerAppStateListener`.
 */
export function AppStatePolicy(policy: AppStatePolicyValue): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(METADATA_KEYS.APP_STATE_POLICY, policy, target);
  };
}

export function isInjectable(target: ServiceConstructor): boolean {
  return Reflect.getMetadata(METADATA_KEYS.INJECTABLE, target) === true;
}

export function getServiceName(target: ServiceConstructor): string {
  return Reflect.getMetadata(METADATA_KEYS.SERVICE_NAME, target) || target.name;
}

export function getDependencies(target: ServiceConstructor): string[] {
  return Reflect.getMetadata(METADATA_KEYS.DEPENDENCIES, target) || [];
}

export function getPriority(target: ServiceConstructor): number {
  return Reflect.getMetadata(METADATA_KEYS.PRIORITY, target) ?? DEFAULT_PRIORITY;
}

export function getPhase(target: ServiceConstructor): Phase {
  return Reflect.getMetadata(METADATA_KEYS.PHASE, target) || Phase.Gate;
}

/** Explicit `@ErrorHandling` wins; otherwise the phase decides. */
export function getErrorStrategy(target: ServiceConstructor): ErrorStrategy {
  const explicit: ErrorStrategy | undefined = Reflect.getMetadata(
    METADATA_KEYS.ERROR_STRATEGY,
    target,
  );
  if (explicit) return explicit;
  return getPhase(target) === Phase.Gate ? 'fail-fast' : 'graceful';
}

export function getAppStatePolicy(target: ServiceConstructor): AppStatePolicyValue {
  return Reflect.getMetadata(METADATA_KEYS.APP_STATE_POLICY, target) || 'not-applicable';
}
