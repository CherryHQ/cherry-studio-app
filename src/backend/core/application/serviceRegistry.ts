import type { ServiceConstructor } from '../lifecycle/types';

/**
 * The central service registry.
 *
 * Adding a service is one import plus one line here; the `ServiceRegistry` type
 * and therefore the `application.get()` keys follow automatically. The name a
 * class passes to `@Injectable` must match its key in this object.
 *
 * This is the one file allowed to import concrete classes from `backend/ai`,
 * `backend/services`, and `backend/data`: registration is assembly, so the layer
 * rule is relaxed here and nowhere else.
 *
 * Stage A registers nothing. The framework ships inert — present, tested, and
 * wired to no module — so that migrating the existing runtime graph is a
 * separate, reviewable change that cannot be conflated with framework bugs.
 */
export const services = {} as const;

/** Service name to instance type, derived from `services`. */
export type ServiceRegistry = {
  [K in keyof typeof services]: InstanceType<(typeof services)[K]>;
};

/** Constructors to register with a host, in declaration order. */
export const serviceList: readonly ServiceConstructor[] = Object.values(services);
