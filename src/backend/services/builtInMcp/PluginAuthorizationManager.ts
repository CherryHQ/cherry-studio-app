import {
  pluginAuthorizationService,
  type PluginAuthorizationStore,
} from '@/backend/data/services/PluginAuthorizationService';
import { PluginError } from '@/shared/contracts/plugins';

import { createAuthorizationObserver } from './createAuthorizationObserver';
import type { PluginAuthorizationRuntime, PluginDefinition } from './pluginDefinition';
import { getPluginDefinition, requirePluginAuthMethod } from './pluginRegistry';

type Entry = {
  runtime: PluginAuthorizationRuntime;
  observer?: ReturnType<typeof createAuthorizationObserver>;
};

/** Owns method runtimes and observers for one McpRuntimeService generation. */
export class PluginAuthorizationManager {
  private readonly entries = new Map<string, Map<string, Entry>>();
  private stopped = false;

  constructor(
    private readonly lookup: (id: string) => PluginDefinition | undefined = getPluginDefinition,
    private readonly createStore: (
      plugin: PluginDefinition,
      method: string,
    ) => PluginAuthorizationStore = (plugin, method) =>
      pluginAuthorizationService.authorizationStore(plugin.catalog.id, method, plugin.serverName),
  ) {}

  get(pluginId: string, methodId: string) {
    return this.entry(pluginId, methodId).runtime;
  }

  private entry(pluginId: string, methodId: string): Entry {
    if (this.stopped) throw new PluginError('cancelled', 'Plugin authorization stopped.');
    const plugin = this.lookup(pluginId);
    if (!plugin) throw new PluginError('unavailable', 'This plugin is unavailable.');
    const method = requirePluginAuthMethod(plugin, methodId);
    if (method.kind !== 'interactive')
      throw new PluginError(
        'unavailable',
        'Interactive authorization is unavailable for this method.',
      );
    let methods = this.entries.get(pluginId);
    if (!methods) {
      methods = new Map();
      this.entries.set(pluginId, methods);
    }
    let entry = methods.get(methodId);
    if (!entry) {
      entry = { runtime: method.createRuntime(this.createStore(plugin, methodId)) };
      methods.set(methodId, entry);
    }
    return entry;
  }

  observer(
    pluginId: string,
    methodId: string,
    complete: (attemptId: string) => ReturnType<PluginAuthorizationRuntime['commit']>,
  ) {
    const entry = this.entry(pluginId, methodId);
    entry.observer ??= createAuthorizationObserver({
      getState: () => entry.runtime.getState(),
      poll: (attemptId) => entry.runtime.poll(attemptId),
      complete,
    });
    return entry.observer;
  }

  private runtimes(pluginId: string, exceptMethod?: string) {
    return (
      this.lookup(pluginId)?.authMethods.flatMap((method) =>
        method.kind === 'interactive' && method.id !== exceptMethod
          ? [this.get(pluginId, method.id)]
          : [],
      ) ?? []
    );
  }

  interrupt(pluginId: string, exceptMethod?: string) {
    for (const runtime of this.runtimes(pluginId, exceptMethod)) runtime.interrupt();
  }

  invalidateGrant(pluginId: string) {
    for (const runtime of this.runtimes(pluginId)) runtime.invalidateGrant();
  }

  async cancelAttempts(pluginId: string, exceptMethod?: string) {
    await Promise.all(this.runtimes(pluginId, exceptMethod).map((runtime) => runtime.cancel()));
  }

  async stop() {
    this.stopped = true;
    const entries = [...this.entries.values()].flatMap((methods) => [...methods.values()]);
    for (const entry of entries) entry.observer?.stop();
    await Promise.all(entries.map((entry) => entry.runtime.stop()));
    this.entries.clear();
  }
}
