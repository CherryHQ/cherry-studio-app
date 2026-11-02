import { createRef, type Ref, useImperativeHandle } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { TranscriptSnapshot } from '@/frontend/appShell/conversation';
import type { AgentMessageView } from '@/shared/contracts/agent';
import type { DocumentExportInput } from '@/shared/contracts/documentExport';
import { sha256HexOfText } from '@/shared/utils/sha256';

import type { ChatShareTarget } from '../chatShareTarget';
import { useShareChat } from '../useShareChat';

const mockCreateSession = jest.fn((input: DocumentExportInput) => ({
  document: input.kind === 'document' ? input.document : undefined,
  dispose: jest.fn(async () => {}),
}));
const mockModule = { createSession: mockCreateSession };
const mockPrepare = jest.fn<Promise<TranscriptSnapshot>, [readonly string[], AbortSignal]>();
const mockToast = { show: jest.fn() };
const mockTranslate = (key: string) => key;
const target: ChatShareTarget = {
  ref: { source: { kind: 'local' }, sessionId: 'session' },
  prepareSelection: mockPrepare,
};

jest.mock('@/frontend/data', () => ({ useBackendModule: () => mockModule }));
jest.mock('@cherrystudio/ui/components', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockTranslate }) }));

type ShareChat = ReturnType<typeof useShareChat>;
function Probe({
  ref,
  shareTarget = target,
}: {
  ref: Ref<ShareChat>;
  shareTarget?: ChatShareTarget;
}) {
  const share = useShareChat(shareTarget);
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
    stats: null,
    modelId: null,
    inferenceSnapshot: null,
  };
}

let renderer: ReactTestRenderer | undefined;
beforeEach(() => {
  mockCreateSession.mockClear();
  mockPrepare.mockReset().mockImplementation(async (ids) => ({
    title: 'Conversation',
    assistantName: 'Assistant',
    messages: [message('question', 'user'), message('answer', 'assistant')].filter((message) =>
      ids.includes(message.id),
    ),
  }));
});
afterEach(() => {
  act(() => renderer?.unmount());
  renderer = undefined;
});

test('prepares the complete selection in chronological order for the inline preview', async () => {
  const ref = createRef<ShareChat>();
  await act(async () => {
    renderer = create(<Probe ref={ref} />);
  });
  await act(async () => {
    await ref.current!.shareChat(['answer', 'question']);
  });
  expect(ref.current!.content?.session.document.sections.map((section) => section.id)).toEqual([
    'question',
    'answer',
  ]);
  expect(ref.current!.content?.messageIds).toEqual(['question', 'answer']);
});

test('retains captured translations in both thinking snapshots', async () => {
  const answer = message('answer', 'assistant');
  answer.parts.unshift({ id: 'thought', type: 'reasoning', text: 'Thought', state: 'done' });
  mockPrepare.mockResolvedValueOnce({ messages: [answer] });
  const shareTarget: ChatShareTarget = {
    ...target,
    translations: {
      answer: { sourceHash: sha256HexOfText('answer'), language: 'zh-CN', content: '译文' },
    },
  };
  const ref = createRef<ShareChat>();
  await act(async () => {
    renderer = create(<Probe ref={ref} shareTarget={shareTarget} />);
  });
  await act(async () => {
    await ref.current!.shareChat(['answer']);
  });
  const content = ref.current!.content;
  expect(JSON.stringify(content?.session.document)).toContain('译文');
  expect(JSON.stringify(content?.session.document)).toContain('Thought');
  expect(JSON.stringify(content?.withoutProcess?.document)).toContain('译文');
  expect(JSON.stringify(content?.withoutProcess?.document)).not.toContain('Thought');
});

test('cancelled reads cannot replace the displayed content', async () => {
  const ref = createRef<ShareChat>();
  await act(async () => {
    renderer = create(<Probe ref={ref} />);
  });
  await act(async () => {
    await ref.current!.shareChat(['question']);
  });
  const original = ref.current!.content;
  let finish!: (value: TranscriptSnapshot) => void;
  mockPrepare.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let pending!: Promise<boolean>;
  act(() => {
    pending = ref.current!.shareChat(['answer']);
  });
  act(() => ref.current!.cancelShare());
  await act(async () => {
    finish({ messages: [message('answer', 'assistant')] });
    await pending;
  });
  expect(ref.current!.content).toBe(original);
  expect(ref.current!.isSharing).toBe(false);
});

test('replacement and unmount dispose their owned sessions', async () => {
  const ref = createRef<ShareChat>();
  await act(async () => {
    renderer = create(<Probe ref={ref} />);
  });
  await act(async () => {
    await ref.current!.shareChat(['question']);
  });
  const original = ref.current!.content!.session;
  await act(async () => {
    await ref.current!.shareChat(['answer']);
  });
  expect(original.dispose).toHaveBeenCalledTimes(1);
  const current = ref.current!.content!.session;
  act(() => renderer!.unmount());
  renderer = undefined;
  expect(current.dispose).toHaveBeenCalledTimes(1);
});
