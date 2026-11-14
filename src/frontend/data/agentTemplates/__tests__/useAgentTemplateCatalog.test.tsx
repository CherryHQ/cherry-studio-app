import { onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data/BackendProvider';
import type { Backend } from '@/shared/contracts';
import type { AgentTemplatesModule } from '@/shared/contracts/agentTemplates';
import type { AgentTemplateCatalog } from '@/shared/data/types/agentTemplate';

import { useAgentTemplateCatalog } from '../useAgentTemplateCatalog';

const saved: AgentTemplateCatalog = {
  language: 'en',
  revision: 'a'.repeat(40),
  templates: [
    {
      id: 'writer',
      name: 'Writer',
      description: '',
      emoji: '✍️',
      group: [],
      prompt: 'Write.',
      categories: [],
    },
  ],
};
const remote: AgentTemplateCatalog = { ...saved, revision: 'b'.repeat(40) };
const templates: jest.Mocked<AgentTemplatesModule> = { readCached: jest.fn(), refresh: jest.fn() };
const backend = { agentTemplates: templates } as unknown as Backend;
let client: QueryClient;
let renderer: ReactTestRenderer | undefined;
let query: ReturnType<typeof useAgentTemplateCatalog>;
function Probe() {
  const catalog = useAgentTemplateCatalog('en-US');
  useEffect(() => {
    query = catalog;
  }, [catalog]);
  return null;
}
async function mount() {
  await act(async () => {
    renderer = create(
      <QueryClientProvider client={client}>
        <BackendProvider backend={backend}>
          <Probe />
        </BackendProvider>
      </QueryClientProvider>,
    );
  });
}
async function waitFor(predicate: () => boolean) {
  for (let index = 0; index < 20; index += 1) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error('Timed out waiting for catalog state');
}
beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });
  templates.readCached.mockResolvedValue(saved);
  templates.refresh.mockResolvedValue(remote);
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  client.clear();
  onlineManager.setOnline(true);
});

it('reads saved templates while offline and does not block them on network access', async () => {
  onlineManager.setOnline(false);
  await mount();
  await waitFor(() => query.catalog !== null);
  expect(query.catalog).toEqual(saved);
  expect(query.isLoading).toBe(false);
  expect(templates.refresh).not.toHaveBeenCalled();
});

it('keeps saved content through a failed refresh and replaces it on Retry', async () => {
  templates.refresh.mockRejectedValueOnce(new Error('Offline'));
  await mount();
  await waitFor(() => query.error !== null);
  expect(query.catalog).toEqual(saved);
  expect(query.isLoading).toBe(false);
  await act(async () => {
    await query.refetch();
  });
  await waitFor(() => query.catalog?.revision === remote.revision);
  expect(query.error).toBeNull();
  expect(client.getQueryData(['agent-templates', 'saved', 'en'])).toEqual(remote);
});

it('exposes saved content while a newer catalog is still downloading', async () => {
  let release!: (catalog: AgentTemplateCatalog) => void;
  templates.refresh.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  await mount();
  await waitFor(() => query.isFetching);
  expect(query.catalog).toEqual(saved);
  expect(query.isLoading).toBe(false);
  await act(async () => {
    release(remote);
  });
  await waitFor(() => query.catalog?.revision === remote.revision);
});

it('exposes a retryable first-use failure without a saved catalog', async () => {
  templates.readCached.mockResolvedValue(null);
  templates.refresh.mockRejectedValue(new Error('Unavailable'));
  await mount();
  await waitFor(() => query.error !== null);
  expect(query.catalog).toBeNull();
  expect(query.isLoading).toBe(false);
});
