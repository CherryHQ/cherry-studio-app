import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { ApiClient } from '@/shared/data/api/types';

import { getAiUsageInvocationPurposeKey } from '../../utils/aiUsageInvocationPurpose';
import { useAiUsageInvocations } from '../useAiUsageInvocations';

it('paginates and retains earlier items when a later page fails', async () => {
  const get = jest
    .fn()
    .mockResolvedValueOnce({
      items: [{ record: { id: 'first' }, purpose: null }],
      nextCursor: 'next',
      total: 2,
    })
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({
      items: [{ record: { id: 'second' }, purpose: 'translation' }],
      total: 2,
    });
  const api = { get } as unknown as ApiClient;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  let latest: ReturnType<typeof useAiUsageInvocations> | undefined;
  let renderer: ReactTestRenderer;
  function Probe() {
    const result = useAiUsageInvocations(true);
    useEffect(() => {
      latest = result;
    }, [result]);
    return null;
  }
  const flush = async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  };
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={client}>
        <DataApiProvider dataApi={api}>
          <Probe />
        </DataApiProvider>
      </QueryClientProvider>,
    );
  });
  await flush();
  expect(latest?.items.map((item) => item.record.id)).toEqual(['first']);
  expect(getAiUsageInvocationPurposeKey(latest!.items[0].purpose)).toBe('aiUsage.purpose.unknown');
  await act(async () => {
    await latest!.loadNext();
  });
  await flush();
  expect(latest?.items.map((item) => item.record.id)).toEqual(['first']);
  expect(latest?.error).toBeDefined();
  await act(async () => {
    await latest!.loadNext();
  });
  await flush();
  expect(latest?.items.map((item) => item.record.id)).toEqual(['first', 'second']);
  expect(get).toHaveBeenLastCalledWith('/ai-usage-records/invocations', {
    query: { cursor: 'next', limit: 50 },
  });
  expect(client.getQueryCache().getAll()[0].queryKey).toEqual([
    '/ai-usage-records/invocations',
    { limit: 50 },
  ]);
  await act(async () => renderer.unmount());
  client.clear();
});
