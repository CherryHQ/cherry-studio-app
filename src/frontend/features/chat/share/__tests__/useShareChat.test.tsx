import { createRef, type Ref, useImperativeHandle } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { useDocumentExport } from '@/frontend/appShell/documentExport';
import type { AgentMessageView } from '@/shared/contracts/agent';

import { useShareChat } from '../useShareChat';

const mockOpen = jest.fn(
  async (_input: Parameters<ReturnType<typeof useDocumentExport>['open']>[0]) => 'closed' as const,
);
const mockGet = jest.fn();
const mockApi = { get: mockGet };

jest.mock('@/frontend/appShell/documentExport', () => ({
  useDocumentExport: () => ({ open: mockOpen }),
}));
jest.mock('@/frontend/data/DataApiProvider', () => ({ useApiClient: () => mockApi }));
jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: jest.fn() } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

type ShareChat = ReturnType<typeof useShareChat>;
function Probe({ ref }: { ref: Ref<ShareChat> }) {
  const share = useShareChat('session');
  useImperativeHandle(ref, () => share, [share]);
  return null;
}

function message(id: string, role: 'user' | 'assistant'): AgentMessageView {
  return {
    id,
    role,
    sessionId: 'session',
    turnId: 'turn',
    status: 'success',
    parts: [{ id: `${id}-text`, type: 'text', text: id, state: 'done' }],
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
    usage: null,
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
  };
}

let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  mockOpen.mockClear();
  mockGet.mockReset().mockImplementation(async (path: string) => {
    if (path.endsWith('/messages'))
      return { items: [message('answer', 'assistant'), message('question', 'user')] };
    if (path === '/agent-sessions/session') return { title: 'Conversation', agentId: 'agent' };
    if (path === '/agents/agent') return { name: 'Assistant' };
    throw new Error(`Unexpected request: ${path}`);
  });
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

test('multiple selected messages open an HTML preview with only document formats', async () => {
  const ref = createRef<ShareChat>();
  await act(async () => {
    renderer = create(<Probe ref={ref} />);
  });
  await act(async () => ref.current!.shareChat(['answer', 'question']));
  expect(mockOpen).toHaveBeenCalledTimes(1);
  expect(mockOpen).toHaveBeenCalledWith(
    expect.objectContaining({
      initialFormat: 'html',
      allowedFormats: ['html', 'markdown'],
      input: {
        kind: 'document',
        document: expect.objectContaining({
          sections: [
            expect.objectContaining({ id: 'question' }),
            expect.objectContaining({ id: 'answer' }),
          ],
        }),
      },
    }),
  );
});

test.each([{ ids: ['answer'] }, { ids: ['answer', 'answer'] }])(
  'one distinct selected message retains image sharing ($ids)',
  async ({ ids }) => {
    const ref = createRef<ShareChat>();
    await act(async () => {
      renderer = create(<Probe ref={ref} />);
    });
    await act(async () => ref.current!.shareChat(ids));
    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockOpen).toHaveBeenCalledWith(
      expect.objectContaining({ initialFormat: 'image', allowedFormats: undefined }),
    );
  },
);
