import { createRef, type Ref, useImperativeHandle } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ConversationSession, TranscriptSnapshot } from '@/frontend/appShell/conversation';
import type { useDocumentExport } from '@/frontend/appShell/documentExport';
import type { AgentMessageView } from '@/shared/contracts/agent';

import { useShareChat } from '../useShareChat';

const mockOpen = jest.fn(
  async (_input: Parameters<ReturnType<typeof useDocumentExport>['open']>[0]) => 'closed' as const,
);
const mockRelease = jest.fn();
const mockPrepare = jest.fn<Promise<TranscriptSnapshot>, [readonly string[], AbortSignal]>();
const session = {
  scope: 'scope',
  ref: { source: { kind: 'local' }, sessionId: 'session' },
  history: { prepareSelection: mockPrepare },
} as unknown as ConversationSession;

jest.mock('@/frontend/appShell/documentExport', () => ({
  useDocumentExport: () => ({ open: mockOpen }),
}));
jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: jest.fn() } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

type ShareChat = ReturnType<typeof useShareChat>;
function Probe({ ref }: { ref: Ref<ShareChat> }) {
  const share = useShareChat(session);
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
  mockRelease.mockClear();
  mockPrepare.mockReset().mockImplementation(async (refs) => ({
    title: 'Conversation',
    assistantName: 'Assistant',
    messages: [message('question', 'user'), message('answer', 'assistant')].filter((message) =>
      refs.some((ref) => ref.includes(`"${message.id}"`)),
    ),
    assets: [],
    release: mockRelease,
  }));
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

test('multiple selected messages open one image preview in chronological order with every format available', async () => {
  const ref = createRef<ShareChat>();
  await act(async () => {
    renderer = create(<Probe ref={ref} />);
  });
  await act(async () => ref.current!.shareChat(['answer', 'question']));
  expect(mockOpen).toHaveBeenCalledTimes(1);
  expect(mockOpen).toHaveBeenCalledWith(
    expect.objectContaining({
      initialFormat: 'image',
      allowedFormats: ['image', 'html', 'markdown'],
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
      expect.objectContaining({
        initialFormat: 'image',
        allowedFormats: ['image', 'html', 'markdown'],
      }),
    );
  },
);

test('holds prepared assets until the export closes and releases them exactly once', async () => {
  let close!: (value: 'closed') => void;
  mockOpen.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        close = resolve;
      }),
  );
  const ref = createRef<ShareChat>();
  await act(async () => {
    renderer = create(<Probe ref={ref} />);
  });
  await act(async () => ref.current!.shareChat(['answer']));
  expect(mockRelease).not.toHaveBeenCalled();
  await act(async () => close('closed'));
  expect(mockRelease).toHaveBeenCalledTimes(1);
});

test('releases a late prepared snapshot after preparation was cancelled without opening export', async () => {
  let finish!: (value: TranscriptSnapshot) => void;
  mockPrepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const ref = createRef<ShareChat>();
  await act(async () => {
    renderer = create(<Probe ref={ref} />);
  });
  await act(async () => ref.current!.shareChat(['answer']));
  act(() => ref.current!.cancelShare());
  await act(async () =>
    finish({ messages: [message('answer', 'assistant')], assets: [], release: mockRelease }),
  );
  expect(mockOpen).not.toHaveBeenCalled();
  expect(mockRelease).toHaveBeenCalledTimes(1);
});
