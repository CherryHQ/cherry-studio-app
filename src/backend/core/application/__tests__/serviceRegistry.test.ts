import { serviceList, services } from '@/backend/core/application/serviceRegistry';
import { getDependencies, getServiceName, isInjectable } from '@/backend/core/lifecycle/decorators';
import { DependencyResolver } from '@/backend/core/lifecycle/DependencyResolver';
import { ServiceContainer } from '@/backend/core/lifecycle/ServiceContainer';
import { Phase, type ServiceConstructor } from '@/backend/core/lifecycle/types';

/**
 * Guards the registry itself rather than any one service.
 *
 * Dependencies are declared as strings, so the failure mode is a typo that
 * survives typecheck and only surfaces as a boot crash on a device. These
 * assertions are cheap and grow automatically as Stage B registers more
 * services.
 */
const entries = Object.entries(services) as [string, ServiceConstructor][];

describe('service registry', () => {
  test('registers at least one service', () => {
    // Stage A shipped an empty registry deliberately; once it is populated an
    // accidental truncation should fail rather than silently pass every test
    // below by iterating nothing.
    expect(entries.length).toBeGreaterThan(0);
    expect(serviceList).toHaveLength(entries.length);
  });

  test.each(entries)('%s is injectable and named after its registry key', (key, target) => {
    expect(isInjectable(target)).toBe(true);
    // A mismatch here breaks `application.get()` at runtime while typechecking
    // cleanly, because the key comes from the object and the name from the
    // decorator.
    expect(getServiceName(target)).toBe(key);
  });

  test('every declared dependency is registered', () => {
    const registered = new Set(entries.map(([key]) => key));
    const missing = entries.flatMap(([key, target]) =>
      getDependencies(target)
        .filter((dependency) => !registered.has(dependency))
        .map((dependency) => `${key} -> ${dependency}`),
    );

    expect(missing).toEqual([]);
  });

  test('the gate graph is acyclic and orders infrastructure first', () => {
    const container = new ServiceContainer();
    container.registerAll(serviceList);
    const layers = new DependencyResolver().resolveLayered(
      container.buildDependencyGraph(Phase.Gate),
    );

    const layerOf = (name: string) => layers.findIndex((layer) => layer.includes(name));

    // The database is seeded through the cache, so the cache has to be ready
    // first. Before the lifecycle framework this was a hand-written statement
    // order in `createAppBootstrapRuntime`; now it is a declared edge.
    expect(layerOf('CacheService')).toBeGreaterThanOrEqual(0);
    expect(layerOf('CacheService')).toBeLessThan(layerOf('DbService'));
  });
});
