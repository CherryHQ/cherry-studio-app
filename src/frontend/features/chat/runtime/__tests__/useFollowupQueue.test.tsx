import { useEffect } from 'react';
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
let mockAnswerGroupId: string | undefined;
let mockFocused = true;
let mockActiveTurnId: string | null = null;
const mockSubmit = jest.fn();
const client = {
  getState: () => ({
    activeTurn: mockActiveTurnId ? { id: mockActiveTurnId, status: 'running' } : null,
    queuedInputs: [],
    liveMessages: [],
  }),
  getSessionStatus: () => ({ answerGroupId: mockAnswerGroupId, completion: mockCompletion }),
  submitMessage: mockSubmit,
} as unknown as AgentSessionChatClient;

jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('@/frontend/hooks/agent/useAgentSessionStatus', () => ({
  useAgentSessionStatus: () => ({ answerGroupId: mockAnswerGroupId, completion: mockCompletion }),
}));

let controller: ReturnType<typeof useFollowupQueue>;
function Harness({
  sessionId = 'hook-queue',
  busy = false,
}: {
  sessionId?: string;
  busy?: boolean;
}) {
  const queue = useFollowupQueue({ sessionId, client, isBusy: busy, isReady: true });
  useEffect(() => {
    controller = queue;
  }, [queue]);
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
  mockAnswerGroupId = undefined;
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
  mockAnswerGroupId = 'A-done';
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
  mockAnswerGroupId = 'B-done';
  await act(async () => tree.update(<Harness />));
  expect(mockSubmit.mock.calls.map(([request]) => request.parts[0].text)).toEqual(['B', 'C']);
});

test.each([false, true])(
  'a stopped or unsuccessful turn cannot advance the queue (success: %s)',
  async (succeeded) => {
    enqueue('B');
    stopFollowupAdvance('hook-queue', 'A-done');
    mockCompletion = { id: 'A-done', turnId: 'A', succeeded };
    mockAnswerGroupId = 'A-done';
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
  mockAnswerGroupId = 'A-done';
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
  mockAnswerGroupId = 'A-done';
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
  mockAnswerGroupId = 'A-failed';
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
  mockAnswerGroupId = 'D-done';
  await act(async () => tree.update(<Harness />));
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});

test.each([false, true])(
  'a sibling regeneration cannot reuse the previous success before its own completion (%s)',
  async (succeeded) => {
    mockCompletion = { id: 'original-done', turnId: 'shared-turn', succeeded: true };
    mockAnswerGroupId = 'regeneration-done';
    mockActiveTurnId = 'shared-turn';
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
    expect(controller.consumedCompletionId).toBe('original-done');

    // Terminal chat events may arrive before the Host publishes this group's outcome.
    mockActiveTurnId = null;
    await act(async () => tree.update(<Harness />));
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(controller.items.map((item) => item.id)).toEqual(['B']);

    mockCompletion = { id: 'regeneration-done', turnId: 'shared-turn', succeeded };
    await act(async () => tree.update(<Harness />));
    expect(mockSubmit).toHaveBeenCalledTimes(succeeded ? 1 : 0);
    expect(controller.items.map((item) => item.id)).toEqual(succeeded ? [] : ['B']);
  },
);

test('stopping one group does not suppress a later successful regeneration of the same question', async () => {
  enqueue('B');
  stopFollowupAdvance('hook-queue', 'original-done');
  mockCompletion = { id: 'original-done', turnId: 'shared-turn', succeeded: true };
  mockAnswerGroupId = 'original-done';
  await act(async () => {
    tree = create(<Harness />);
  });
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(controller.isPaused).toBe(false);

  mockAnswerGroupId = 'regeneration-done';
  mockCompletion = { id: 'regeneration-done', turnId: 'shared-turn', succeeded: true };
  await act(async () => tree.update(<Harness />));
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  expect(controller.items).toEqual([]);
});

test('an unknown current answer group cannot authorize automatic sending', async () => {
  enqueue('B');
  mockCompletion = { id: 'previous-done', turnId: 'previous', succeeded: true };
  await act(async () => {
    tree = create(<Harness />);
  });
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(controller.items.map((item) => item.id)).toEqual(['B']);
});

test('cancelling pending admission keeps the draft and pause choice without immediately resending', async () => {
  enqueue('B');
  mockSubmit.mockRejectedValueOnce(
    new AgentProtocolError({ code: 'CANCELLED', message: 'Stopped', retryable: true }),
  );
  mockCompletion = { id: 'A-done', turnId: 'A', succeeded: true };
  mockAnswerGroupId = 'A-done';
  await act(async () => {
    tree = create(<Harness />);
  });
  expect(controller.items.map((item) => item.id)).toEqual(['B']);
  expect(controller.isPaused).toBe(false);
  expect(controller.hasFailedSend).toBe(false);
  await act(async () => tree.update(<Harness />));
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  mockCompletion = { id: 'D-done', turnId: 'D', succeeded: true };
  mockAnswerGroupId = 'D-done';
  await act(async () => tree.update(<Harness />));
  expect(mockSubmit).toHaveBeenCalledTimes(2);
  expect(controller.items).toEqual([]);
});

test('a fresh completion preceding the terminal chat snapshot is not discarded at enqueue', async () => {
  mockCompletion = { id: 'A-done', turnId: 'A', succeeded: true };
  mockAnswerGroupId = 'A-done';
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
