/**
 * The framework surface a service needs.
 *
 * Mirrors desktop's `@main/core/lifecycle` barrel so a migrated service's import
 * line matches its desktop counterpart verbatim. Deliberately thin: it re-exports
 * only what a service declares itself with, never the container or the manager —
 * those belong to `ApplicationHost`, and a service that reaches for them is
 * doing something the dependency graph should be expressing.
 */
export { BaseService } from './BaseService';
export {
  AppStatePolicy,
  DependsOn,
  ErrorHandling,
  Injectable,
  Priority,
  ServicePhase,
} from './decorators';
export { type Disposable, Emitter, type Event, toDisposable } from './event';
export {
  type Activatable,
  LifecycleState,
  type Pausable,
  Phase,
  type ServiceConstructor,
} from './types';
