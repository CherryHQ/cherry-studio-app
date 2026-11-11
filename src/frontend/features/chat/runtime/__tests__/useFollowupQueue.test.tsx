import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AgentProtocolError, type AgentSessionStatus } from '@/shared/contracts/agent';

import type { AgentSessionChatClient } from '../AgentSessionChatClient';
import {
  clearFollowupQueue,
  enqueueFollowup,
  readFollowupQueue,
  stopFollowupAdvance,
} from '../followupQueue';
import { useFollowupQueue } from '../useFollowupQueue';

let mockCompletion: AgentSessionStatus['completion'];
let mockFocused = true;
let mockActiveTurnId: string | null = null;
const mockSubmit = jest.fn();
const client = {
  getState: () => ({
    activeTurn: mockActiveTurnId ? { id: mockActiveTurnId, status: 'running' } : null,
    queuedInputs: [],
    liveMessages: [],
  }),
  getSessionStatus: () => ({ completion: mockCompletion }),
  submitMessage: mockSubmit,
} as unknown as AgentSessionChatClient;

jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('@/frontend/hooks/agent/useAgentSessionStatus', () => ({
  useAgentSessionStatus: () => ({ completion: mockCompletion }),
}));

let controller: ReturnType<typeof useFollowupQueue>;
function Harness({
  sessionId = 'hook-queue',
  busy = false,
}: {
  sessionId?: string;
  busy?: boolean;
}) {
  controller = useFollowupQueue({ sessionId, client, isBusy: busy, isReady: true });
  return null;
}

function enqueue(text: string, sessionId = 'hook-queue') {
  enqueueFollowup(
    {
      id: text,
      request: {
        sessionId,
        userMessageId: `user-${text}`,
        assistantMessageId: `answer-${text}`,
        parts: [{ type: 'text', text }],
      },
      draft: { text, attachments: [], quote: {} },
    },
    null,
  );
}

let tree: ReactTestRenderer;
beforeEach(() => {
  clearFollowupQueue('hook-queue');
  clearFollowupQueue('hook-other');
  mockCompletion = undefined;
  mockFocused = true;
  mockActiveTurnId = null;
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  mockSubmit.mockReset().mockResolvedValue({});
});
afterEach(() => act(() => tree?.unmount()));

test('a success sends one FIFO draft, and remounting cannot consume that completion twice', async () => {
  enqueue('B');
  enqueue('C');
  mockCompletion = { id: 'A-done', turnId: 'A', succeeded: true };
  await act(async () => {
    tree = create(<Harness />);
  });
  expect(mockSubmit.mock.calls.map(([request]) => request.parts[0].text)).toEqual(['B']);
  expect(controller.items.map((item) => item.id)).toEqual(['C']);
  act(() => tree.unmount());
  await act(async () => {
    tree = create(<Harness />);
  });
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  mockCompletion = { id: 'B-done', turnId: 'B', succeeded: true };
  await act(async () => tree.update(<Harness />));
  expect(mockSubmit.mock.calls.map(([request]) => request.parts[0].text)).toEqual(['B', 'C']);
});

test.each([false, true])(
  'a stopped or unsuccessful turn cannot advance the queue (success: %s)',
  async (succeeded) => {
    enqueue('B');
    stopFollowupAdvance('hook-queue', 'A');
    mockCompletion = { id: 'A-done', turnId: 'A', succeeded };
    await act(async () => {
      tree = create(<Harness />);
    });
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(controller.items.map((item) => item.id)).toEqual(['B']);
    await act(async () => {
      await controller.send('B');
    });
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    expect(controller.items).toEqual([]);
  },
);

test('busy and unfocused views retain drafts until the observed successful completion is eligible', async () => {
  enqueue('B');
  mockCompletion = { id: 'A-done', turnId: 'A', succeeded: true };
  await act(async () => {
    tree = create(<Harness busy />);
  });
  expect(mockSubmit).not.toHaveBeenCalled();
  mockFocused = false;
  await act(async () => tree.update(<Harness />));
  expect(mockSubmit).not.toHaveBeenCalled();
  mockFocused = true;
  await act(async () => tree.update(<Harness />));
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});

test('failed admission retains the item and resume retries without a new completion', async () => {
  enqueue('B');
  mockSubmit.mockRejectedValueOnce(new Error('not admitted'));
  mockCompletion = { id: 'A-done', turnId: 'A', succeeded: true };
  await act(async () => {
    tree = create(<Harness />);
  });
  expect(controller.items.map((item) => item.id)).toEqual(['B']);
  expect(controller.isPaused).toBe(true);
  await act(async () => controller.setPaused(false));
  expect(mockSubmit).toHaveBeenCalledTimes(2);
  expect(controller.items).toEqual([]);
});

test('an earlier success cannot drain a draft queued behind a different running turn', async () => {
  mockCompletion = { id: 'previous-done', turnId: 'previous', succeeded: true };
  mockActiveTurnId = 'A';
  act(() => {
    tree = create(<Harness busy />);
  });
  act(() =>
    controller.enqueue({
      id: 'B',
      request: {
        sessionId: 'hook-queue',
        userMessageId: 'B-user',
        assistantMessageId: 'B-answer',
        parts: [{ type: 'text', text: 'B' }],
      },
      draft: { text: 'B', attachments: [], quote: {} },
    }),
  );
  mockActiveTurnId = null;
  await act(async () => tree.update(<Harness />));
  expect(mockSubmit).not.toHaveBeenCalled();
  mockCompletion = { id: 'A-failed', turnId: 'A', succeeded: false };
  await act(async () => tree.update(<Harness />));
  expect(mockSubmit).not.toHaveBeenCalled();
  mockCompletion = { id: 'D-done', turnId: 'D', succeeded: true };
  await act(async () => tree.update(<Harness />));
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});

test('cancelling pending admission keeps the draft and pause choice without immediately resending', async () => {
  enqueue('B');
  mockSubmit.mockRejectedValueOnce(
    new AgentProtocolError({ code: 'CANCELLED', message: 'Stopped', retryable: true }),
  );
  mockCompletion = { id: 'A-done', turnId: 'A', succeeded: true };
  await act(async () => {
    tree = create(<Harness />);
  });
  expect(controller.items.map((item) => item.id)).toEqual(['B']);
  expect(controller.isPaused).toBe(false);
  expect(controller.hasFailedSend).toBe(false);
  await act(async () => tree.update(<Harness />));
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  mockCompletion = { id: 'D-done', turnId: 'D', succeeded: true };
  await act(async () => tree.update(<Harness />));
  expect(mockSubmit).toHaveBeenCalledTimes(2);
  expect(controller.items).toEqual([]);
});

test('a fresh completion preceding the terminal chat snapshot is not discarded at enqueue', async () => {
  mockCompletion = { id: 'A-done', turnId: 'A', succeeded: true };
  mockActiveTurnId = 'A';
  act(() => {
    tree = create(<Harness busy />);
  });
  act(() =>
    controller.enqueue({
      id: 'B',
      request: {
        sessionId: 'hook-queue',
        userMessageId: 'B-user',
        assistantMessageId: 'B-answer',
        parts: [{ type: 'text', text: 'B' }],
      },
      draft: { text: 'B', attachments: [], quote: {} },
    }),
  );
  mockActiveTurnId = null;
  await act(async () => tree.update(<Harness />));
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  expect(controller.items).toEqual([]);
});

test('a pending send remains exclusive across routes and settles in its originating queue', async () => {
  enqueue('B');
  enqueue('C', 'hook-other');
  let accept!: () => void;
  mockSubmit.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        accept = resolve;
      }),
  );
  act(() => {
    tree = create(<Harness />);
  });
  let sending!: Promise<boolean>;
  act(() => {
    sending = controller.send('B');
  });
  await act(async () => {
    expect(await controller.send('B')).toBe(false);
  });
  act(() => tree.update(<Harness sessionId="hook-other" />));
  await act(async () => {
    accept();
    await sending;
  });
  expect(readFollowupQueue('hook-queue').items).toEqual([]);
  expect(controller.items.map((item) => item.id)).toEqual(['C']);
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});
