import { PluginAuthorizationManager } from '../PluginAuthorizationManager';
import type { PluginAuthorizationRuntime, PluginDefinition } from '../pluginDefinition';
import { createPluginRegistry } from '../pluginRegistry';
import { authorizationStoreFixture } from './_authorizationStoreFixture';

function runtimeFixture(): PluginAuthorizationRuntime {
  const lifetime = new AbortController();
  return {
    attemptSignal: lifetime.signal,
    getState: jest.fn(async () => ({ status: 'idle' as const })),
    begin: jest.fn(async () => ({ status: 'idle' as const })),
    poll: jest.fn(async () => ({ status: 'idle' as const })),
    prepare: jest.fn(async () => ({
      credential: { version: 1 },
      accountLabel: 'Future',
      signal: lifetime.signal,
    })),
    commit: jest.fn(async () => ({
      pluginId: 'future',
      serverId: 'future-server',
      accountLabel: 'Future',
      connectedAt: '2026-09-10T00:00:00.000Z',
    })),
    resolveCredential: jest.fn(async (grant) => grant.credential),
    cancel: jest.fn(async () => ({ status: 'idle' as const })),
    interrupt: jest.fn(),
    invalidateGrant: jest.fn(),
    stop: jest.fn(async () => {
      lifetime.abort();
    }),
  };
}

it('owns independent runtimes and observers for multiple interactive methods and stops all of them', async () => {
  const first = runtimeFixture();
  const second = runtimeFixture();
  const plugin: PluginDefinition = {
    catalog: {
      id: 'future',
      links: {
        credentials: 'https://example.com/setup',
        website: 'https://example.com',
        privacy: 'https://example.com/privacy',
      },
    },
    serverName: 'Future',
    tools: { read: 'read' },
    authMethods: [
      {
        id: 'oauth',
        kind: 'interactive',
        stages: ['consent'],
        createRuntime: () => first,
        createRequestAuthorization: () => ({ apply() {} }),
      },
      {
        id: 'enterprise_oauth',
        kind: 'interactive',
        stages: ['tenant', 'approval'],
        createRuntime: () => second,
        createRequestAuthorization: () => ({ apply() {} }),
      },
    ],
    createClient: async () => {
      throw new Error('Not connected');
    },
    validation: { tool: 'read', accountLabel: () => 'Future' },
  };
  const registry = createPluginRegistry([plugin]);
  const createStore = jest.fn(
    (_plugin: PluginDefinition, _method: string) => authorizationStoreFixture().store,
  );
  const manager = new PluginAuthorizationManager(registry.get, createStore);
  expect(manager.get('future', 'oauth')).toBe(first);
  expect(manager.get('future', 'enterprise_oauth')).toBe(second);
  expect(manager.get('future', 'oauth')).toBe(first);
  expect(createStore.mock.calls.map((call) => call[1])).toEqual(['oauth', 'enterprise_oauth']);
  const listener = jest.fn();
  const observer = manager.observer('future', 'oauth', (id) =>
    first.commit(id, 'Future', first.attemptSignal),
  );
  observer.observe(listener);
  await manager.stop();
  expect(first.attemptSignal.aborted).toBe(true);
  expect(second.attemptSignal.aborted).toBe(true);
  expect(first.stop).toHaveBeenCalledTimes(1);
  expect(second.stop).toHaveBeenCalledTimes(1);
  const calls = listener.mock.calls.length;
  observer.check();
  await Promise.resolve();
  expect(listener).toHaveBeenCalledTimes(calls);
  expect(() => manager.get('future', 'oauth')).toThrow('stopped');
});
