import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data/BackendProvider';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import { useQuery } from '@/frontend/data/hooks/useDataApi';
import type { Backend } from '@/shared/contracts';
import type { ApiClient } from '@/shared/data/api/types';
import { MODEL_CAPABILITY } from '@/shared/data/types/model';

import {
  isRegistryProjectionPath,
  ProviderRegistryQueryBridge,
} from '../ProviderRegistryQueryBridge';

test.each([
  '/models',
  '/models/provider::model',
  '/providers/openai/models:resolve',
  'onboarding-models',
  // Agent records embed the model's display name.
  '/agents',
  '/agents/9917766f-c084-496f-b6b8-17f08e0c6c3a',
])('refreshes %s when a registry snapshot becomes active', (path) => {
  expect(isRegistryProjectionPath(path)).toBe(true);
});

test.each([
  '/agents/9917766f-c084-496f-b6b8-17f08e0c6c3a/tool-bindings',
  '/agent-sessions',
  '/providers',
  '/mcp-servers',
  undefined,
])('leaves %s alone', (path) => {
  expect(isRegistryProjectionPath(path)).toBe(false);
});

test('cancels in-flight pre-registry reads so registry activation does not cache degraded models', async () => {
  const firstRead = deferred<unknown>();
  const secondRead = deferred<unknown>();
  const get = jest
    .fn()
    .mockImplementationOnce(() => firstRead.promise)
    .mockImplementationOnce(() => secondRead.promise);
  let notifyRegistryReady: (() => void) | undefined;
  const backend = {
    providers: {
      subscribeRegistryUpdates: (listener: () => void) => {
        notifyRegistryReady = listener;
        return () => {
          notifyRegistryReady = undefined;
        };
      },
    },
  } as unknown as Backend;
  const dataApi = {
    delete: jest.fn(),
    get,
    patch: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
  } as unknown as ApiClient;
  const queryClient = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  let observedCapabilities: unknown;

  function Probe() {
    const query = useQuery('/models', { query: { enabled: true, id: 'openai::gpt-4o' } });
    observedCapabilities = query.data?.[0]?.capabilities;
    return null;
  }

  let renderer: ReactTestRenderer | undefined;
  try {
    await act(async () => {
      renderer = create(
        createElement(
          QueryClientProvider,
          { client: queryClient },
          createElement(
            BackendProvider,
            { backend },
            createElement(
              DataApiProvider,
              { dataApi },
              createElement(ProviderRegistryQueryBridge),
              createElement(Probe),
            ),
          ),
        ),
      );
    });
    expect(get).toHaveBeenCalledTimes(1);

    await act(async () => {
      notifyRegistryReady?.();
      await Promise.resolve();
    });
    await flushQueryNotifications();

    await act(async () => {
      firstRead.resolve([{ id: 'openai::gpt-4o', capabilities: [] }]);
    });
    await flushQueryNotifications();
    expect(get).toHaveBeenCalledTimes(2);

    await act(async () => {
      secondRead.resolve([
        { id: 'openai::gpt-4o', capabilities: [MODEL_CAPABILITY.FUNCTION_CALL] },
      ]);
    });
    await flushQueryNotifications();

    expect(observedCapabilities).toEqual([MODEL_CAPABILITY.FUNCTION_CALL]);
  } finally {
    await act(async () => renderer?.unmount());
    queryClient.clear();
  }
});

async function flushQueryNotifications() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}
