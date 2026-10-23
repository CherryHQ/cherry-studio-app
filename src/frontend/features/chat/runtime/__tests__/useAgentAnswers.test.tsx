import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { AgentMessageView } from '@/shared/contracts/agent';

import { useAgentAnswers } from '../useAgentAnswers';

const mockGet = jest.fn();
let mockLive: readonly (AgentMessageView | undefined)[] = [];

jest.mock('@/frontend/data', () => ({
  ...jest.requireActual('@/frontend/data'),
  useApiClient: () => ({ get: mockGet }),
}));
jest.mock('../ChatProvider', () => ({ useAgentLiveAnswers: () => mockLive }));

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('useAgentAnswers', () => {
  let client: QueryClient;
  let renderer: ReactTestRenderer | undefined;
  let result: ReturnType<typeof useAgentAnswers>;

  beforeEach(() => {
    jest.clearAllMocks();
    renderer = undefined;
    mockLive = [];
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    client.clear();
  });

  test('keeps existing previews while an added answer loads, excluding answers no longer in the group', async () => {
    mockGet.mockResolvedValueOnce({ items: [message('a1', 'First'), message('a2', 'Second')] });
    await render(['a1', 'a2']);
    const first = result.answers.get('a1');

    let complete: (value: { items: AgentMessageView[] }) => void = () => {};
    mockGet.mockImplementationOnce(
      () => new Promise<{ items: AgentMessageView[] }>((resolve) => (complete = resolve)),
    );
    await render(['a1', 'a3']);
    expect(result.answers.get('a1')).toBe(first);
    expect(result.answers.has('a2')).toBe(false);

    await act(async () => complete({ items: [message('a1', 'First'), message('a3', 'Third')] }));
    await act(settle);
    expect([...result.answers.keys()]).toEqual(['a1', 'a3']);
  });

  test('updates a streaming answer without replacing the other preview', async () => {
    mockGet.mockResolvedValue({ items: [message('a1', 'Settled')] });
    mockLive = [undefined, message('a2', 'Streaming')];
    await render(['a1', 'a2']);
    const first = result.answers.get('a1');

    mockLive = [undefined, message('a2', 'Streaming more')];
    await render(['a1', 'a2']);
    expect(result.answers.get('a1')).toBe(first);
    expect(result.answers.get('a2')?.data.parts).toEqual([
      expect.objectContaining({ text: 'Streaming more', type: 'text' }),
    ]);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  test('can retry a failed group load', async () => {
    mockGet.mockRejectedValueOnce(new Error('Unavailable'));
    await render(['a1']);
    expect(result.isError).toBe(true);

    mockGet.mockResolvedValueOnce({ items: [message('a1', 'Recovered')] });
    await act(async () => {
      await result.refetch();
    });
    await act(settle);
    expect(result.isError).toBe(false);
    expect(result.answers.has('a1')).toBe(true);
  });

  async function render(ids: readonly string[]) {
    // Keep the hook mounted when its requested group changes.
    await act(async () => {
      const element = (
        <QueryClientProvider client={client}>
          <ProbeWithIds ids={ids} />
        </QueryClientProvider>
      );
      if (renderer) renderer.update(element);
      else renderer = create(element);
    });
    await act(settle);
  }

  function ProbeWithIds({ ids }: { ids: readonly string[] }) {
    result = useAgentAnswers('session', ids);
    return null;
  }
});

function message(id: string, text: string): AgentMessageView {
  return {
    createdAt: '2026-10-20T00:00:00.000Z',
    id,
    inferenceSnapshot: null,
    modelId: null,
    parts: [{ id: `${id}-text`, state: 'done', text, type: 'text' }],
    role: 'assistant',
    sessionId: 'session',
    stats: null,
    status: 'success',
    turnId: 'turn',
    updatedAt: '2026-10-20T00:00:00.000Z',
  };
}
