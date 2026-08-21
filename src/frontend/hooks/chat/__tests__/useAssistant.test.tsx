import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { ApiClient } from '@/shared/data/api/types';

import { useAssistantMutations, useAssistantsApi } from '../useAssistant';

let actions: ReturnType<typeof useAssistantMutations> | undefined;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

const assistants = [makeAssistant('a'), makeAssistant('b'), makeAssistant('c')];
const deleteA = deferred<void>();
const deleteB = deferred<void>();
let persistedAssistants = assistants;

const dataApi = {
  delete: jest.fn((path: string) => {
    if (path.endsWith('/a')) return deleteA.promise;
    if (path.endsWith('/b')) return deleteB.promise;
    return Promise.resolve({ deleted: true });
  }),
  get: jest.fn(async () => ({
    items: persistedAssistants,
    page: 1,
    total: persistedAssistants.length,
  })),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as ApiClient;

function Probe() {
  useAssistantsApi();
  const mutations = useAssistantMutations();

  useEffect(() => {
    actions = mutations;
  }, [mutations]);

  return null;
}

describe('useAssistantMutations', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    actions = undefined;
    persistedAssistants = assistants;
    queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false }, queries: { gcTime: Infinity, retry: false } },
    });
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <DataApiProvider dataApi={dataApi}>
            <Probe />
          </DataApiProvider>
        </QueryClientProvider>,
      );
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    queryClient.clear();
  });

  it('removes a batch once and reconciles partial failure with the server', async () => {
    let deletion: Promise<void> | undefined;
    await act(async () => {
      deletion = actions?.deleteAssistants(['a', 'b', 'a']);
      await Promise.resolve();
    });

    expect(readAssistantIds()).toEqual(['c']);

    persistedAssistants = [assistants[1], assistants[2]];
    deleteA.resolve();
    deleteB.reject(new Error('delete b failed'));

    await act(async () => {
      await expect(deletion).rejects.toThrow('delete b failed');
    });

    expect(readAssistantIds()).toEqual(['b', 'c']);
    expect(dataApi.delete).toHaveBeenCalledTimes(2);
  });
});

function readAssistantIds() {
  return (
    queryClient.getQueryData<{ items: Assistant[] }>(['/assistants', { limit: 500 }])?.items ?? []
  ).map((assistant) => assistant.id);
}

function makeAssistant(id: string): Assistant {
  return { id, name: id.toUpperCase() } as Assistant;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}
