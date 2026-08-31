import { serviceList, services } from '@/backend/core/application/serviceRegistry';
import {
  getAppStatePolicy,
  getDependencies,
  getPhase,
  getServiceName,
  isInjectable,
} from '@/backend/core/lifecycle/decorators';
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

  test.each([Phase.Gate, Phase.PostReady])(
    'the %s graph is acyclic and puts every dependency in an earlier layer',
    (phase) => {
      const container = new ServiceContainer();
      container.registerAll(serviceList);
      const nodes = container.buildDependencyGraph(phase);
      // Throws on a cycle, which is the other half of what this asserts.
      const layers = new DependencyResolver().resolveLayered(nodes);

      const inPhase = new Set(nodes.map((node) => node.name));
      const layerOf = (name: string) => layers.findIndex((layer) => layer.includes(name));

      for (const node of nodes) {
        for (const dependency of node.dependencies) {
          // A dependency in an earlier phase is already initialized and imposes
          // no ordering on this one.
          if (!inPhase.has(dependency)) continue;
          expect(layerOf(dependency)).toBeLessThan(layerOf(node.name));
        }
      }
    },
  );

  test('the gate boots cache, then database, then preferences', () => {
    const container = new ServiceContainer();
    container.registerAll(serviceList);
    const layers = new DependencyResolver().resolveLayered(
      container.buildDependencyGraph(Phase.Gate),
    );
    const layerOf = (name: string) => layers.findIndex((layer) => layer.includes(name));

    // Spelled out rather than left to the generic check above, because this
    // particular chain is what first paint depends on: the database is seeded
    // through the cache, and the theme and language come out of preferences.
    // Before the lifecycle framework it was statement order in
    // `createAppBootstrapRuntime`; now it is three declared edges.
    expect(layerOf('CacheService')).toBeGreaterThanOrEqual(0);
    expect(layerOf('CacheService')).toBeLessThan(layerOf('DbService'));
    expect(layerOf('DbService')).toBeLessThan(layerOf('PreferenceService'));
  });

  test('stops MobileAgentHost before retiring tool Runtime state', () => {
    const container = new ServiceContainer();
    container.registerAll(serviceList);
    const layers = new DependencyResolver().resolveLayered(
      container.buildDependencyGraph(Phase.PostReady),
    );
    const layerOf = (name: string) => layers.findIndex((layer) => layer.includes(name));
    const hostDependencies = getDependencies(services.MobileAgentHost);

    expect(hostDependencies).toEqual(
      expect.arrayContaining(['McpRuntimeService', 'WebSearchService']),
    );

    // MCP and the Host share PostReady, so their dependency layers carry the
    // ordering. WebSearch is a Gate service: the phase boundary initializes it
    // before every PostReady service, and global teardown reverses that order.
    expect(layerOf('McpRuntimeService')).toBeGreaterThanOrEqual(0);
    expect(layerOf('McpRuntimeService')).toBeLessThan(layerOf('MobileAgentHost'));
    expect(getPhase(services.WebSearchService)).toBe(Phase.Gate);
    expect(getPhase(services.MobileAgentHost)).toBe(Phase.PostReady);
  });

  test('declares the background policy of long-running and native-surface owners', () => {
    expect(getAppStatePolicy(services.JobRuntime)).toBe('continue');
    expect(getAppStatePolicy(services.BackgroundReplyRuntime)).toBe('background-presentation');
    expect(getAppStatePolicy(services.BackgroundActivityManager)).toBe('background-presentation');
    expect(getAppStatePolicy(services.KeepAliveCoordinator)).toBe('background-presentation');
    expect(getAppStatePolicy(services.ProviderRegistryUpdaterService)).toBe('not-applicable');
  });
});
