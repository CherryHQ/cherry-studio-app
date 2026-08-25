import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type EffectCallback, type ReactNode, useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { ApiClient } from '@/shared/data/api/types';
import { FileEntrySchema } from '@/shared/data/types/file';

import { useFileEntries } from '../useFileEntries';

let focusEffect: EffectCallback | undefined;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: EffectCallback) => {
    focusEffect = effect;
  },
}));

const entry = FileEntrySchema.parse({
  createdAt: 1,
  filename: 'photo.png',
  id: '00000000-0000-4000-8000-000000000001',
  mediaType: 'image/png',
  size: 128,
  updatedAt: 1,
});
const dataApi = {
  delete: jest.fn(),
  get: jest.fn(async () => ({ items: [entry] })),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as jest.Mocked<ApiClient>;

let latestResult: ReturnType<typeof useFileEntries> | undefined;
let queryClient: QueryClient;
let renderer: ReactTestRenderer | undefined;

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <DataApiProvider dataApi={dataApi}>{children}</DataApiProvider>
    </QueryClientProvider>
  );
}

function Probe({ enabled }: { enabled: boolean }) {
  const result = useFileEntries('all', { enabled });

  useEffect(() => {
    latestResult = result;
  }, [result]);

  return null;
}

describe('useFileEntries', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    focusEffect = undefined;
    latestResult = undefined;
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
    renderer = undefined;
    queryClient.clear();
  });

  test('keeps the loading state without fetching until data loading is enabled', async () => {
    await act(async () => {
      renderer = create(
        <Providers>
          <Probe enabled={false} />
        </Providers>,
      );
    });

    expect(dataApi.get).not.toHaveBeenCalled();
    expect(latestResult?.entries).toEqual([]);
    expect(latestResult?.isLoading).toBe(true);

    await act(async () => focusEffect?.());
    expect(dataApi.get).not.toHaveBeenCalled();

    await act(async () => {
      renderer?.update(
        <Providers>
          <Probe enabled />
        </Providers>,
      );
    });
    await flushQueryNotifications();

    expect(dataApi.get).toHaveBeenCalledTimes(1);
    expect(dataApi.get).toHaveBeenCalledWith('/files/entries', {
      query: { cursor: undefined, limit: 30 },
    });
    expect(latestResult?.entries).toEqual([entry]);
    expect(latestResult?.isLoading).toBe(false);

    await act(async () => focusEffect?.());
    expect(dataApi.get).toHaveBeenCalledTimes(1);
    await act(async () => focusEffect?.());
    await flushQueryNotifications();
    expect(dataApi.get).toHaveBeenCalledTimes(2);
  });
});

async function flushQueryNotifications() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
