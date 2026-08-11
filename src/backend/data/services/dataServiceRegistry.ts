/**
 * Lightweight service locator for the data-layer singletons.
 *
 * Why this exists: `MessageService` and `TopicService` call across each other in
 * both directions. Importing the sibling singleton at module top-level in both
 * files forms a value-level import cycle that the bundler cannot order.
 *
 * Services resolve siblings lazily through this registry at call time. The
 * registry never imports any service value (only `import type`), so it is always
 * a sink in the static graph and no cycle can form.
 *
 * Scope: only the services that participate in such a cycle are listed in
 * `DataServiceMap` and self-register here — every other data service stays a
 * plain direct-import singleton and never touches this registry. Breaking a
 * cycle only requires one direction to resolve lazily; the opposite edge may
 * remain a direct import if that keeps the graph acyclic. That is why only
 * `TopicService` appears below: `TopicService` reaches `MessageService` through
 * the free `createRootMessageTx` function, which never touches the instance.
 *
 * A participating service registers itself at the bottom of its module via
 * `registerDataService(...)`, so registration happens when the service module is
 * first loaded. In tests, ensure the sibling module is imported (a bare
 * side-effect import is enough) so its registration runs.
 */
import { DataApiErrorFactory } from '@cherrystudio/universal/data/api/errors';

import type { topicService } from './TopicService';

interface DataServiceMap {
  TopicService: typeof topicService;
}

const registry = new Map<keyof DataServiceMap, unknown>();

export function registerDataService<K extends keyof DataServiceMap>(
  name: K,
  instance: DataServiceMap[K],
): void {
  registry.set(name, instance);
}

export function getDataService<K extends keyof DataServiceMap>(name: K): DataServiceMap[K] {
  const instance = registry.get(name);
  if (!instance) {
    throw DataApiErrorFactory.internal(
      new Error(`Data service "${name}" is not registered yet`),
      'data service registry',
    );
  }
  return instance as DataServiceMap[K];
}
