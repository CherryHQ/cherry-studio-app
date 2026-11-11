import { useEffect } from 'react';
import { AppState } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AgentProtocolError, type AgentSessionStatus } from '@/shared/contracts/agent';

import type { AgentSessionChatClient } from '../AgentSessionChatClient';
import {
  clearFollowupQueue,
  enqueueFollowup,
  type FollowupQueueItem,
  holdFollowupQueue,
  readFollowupQueue,
} from '../followupQueue';
import { useFollowupQueue } from '../useFollowupQueue';

let mockCompletion: AgentSessionStatus['completion'];
let mockAnswerGroupId: string | undefined;
let mockFocused = true;
let mockActiveTurnId: string | null = null;
const mockSubmit = jest.fn();
const mockToast = { show: jest.fn() };
const mockTranslate = (key: string) => key;
const client = {
  getState: () => ({
    activeTurn: mockActiveTurnId ? { id: mockActiveTurnId, status: 'running' } : null,
    queuedInputs: [],
    liveMessages: [],
  }),
  getSessionStatus: () => ({ answerGroupId: mockAnswerGroupId, completion: mockCompletion }),
  submitMessage: mockSubmit,
} as unknown as AgentSessionChatClient;

jest.mock('@cherrystudio/ui/components', () => ({ useToast: () => ({ toast: mockToast }) }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockTranslate }) }));
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused }));
jest.mock('@/frontend/hooks/agent/useAgentSessionStatus', () => ({
  useAgentSessionStatus: () => ({ answerGroupId: mockAnswerGroupId, completion: mockCompletion }),
}));

let controller: ReturnType<typeof useFollowupQueue>;
type HarnessProps = { sessionId?: string; busy?: boolean };
function Harness({ sessionId = 'hook-queue', busy = false }: HarnessProps) {
  const queue = useFollowupQueue({ sessionId, client, isBusy: busy, isReady: true });
  useEffect(() => {
    controller = queue;
  }, [queue]);
  return null;
}

function draft(text: string, sessionId = 'hook-queue'): FollowupQueueItem {
  return {
    id: text,
    request: {
      sessionId,
      userMessageId: `user-${text}`,
      assistantMessageId: `answer-${text}`,
      parts: [{ type: 'text', text }],
    },
    draft: { text, attachments: [], quote: {} },
  };
}
const enqueue = (text: string, sessionId?: string) => enqueueFollowup(draft(text, sessionId), null);
function complete(id: string, turnId = id, succeeded = true) {
  mockCompletion = { id, turnId, succeeded };
  mockAnswerGroupId = id;
}

let tree: ReactTestRenderer;
async function render(props: HarnessProps = {}) {
  await act(async () => {
    tree = create(<Harness {...props} />);
  });
}
async function update(props: HarnessProps = {}) {
  await act(async () => tree.update(<Harness {...props} />));
}
beforeEach(() => {
  clearFollowupQueue('hook-queue');
  clearFollowupQueue('hook-other');
  mockCompletion = undefined;
  mockAnswerGroupId = undefined;
  mockFocused = true;
  mockActiveTurnId = null;
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
  mockSubmit.mockReset().mockResolvedValue({});
  mockToast.show.mockClear();
});
afterEach(() => act(() => tree?.unmount()));

test('a success sends one FIFO draft, and remounting cannot consume that completion twice', async () => {
  enqueue('B');
  enqueue('C');
  complete('A-done');
  await render();
  expect(mockSubmit.mock.calls.map(([request]) => request.parts[0].text)).toEqual(['B']);
  expect(controller.items.map((item) => item.id)).toEqual(['C']);
  act(() => tree.unmount());
  await render();
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  complete('B-done');
  await update();
  expect(mockSubmit.mock.calls.map(([request]) => request.parts[0].text)).toEqual(['B', 'C']);
});

test('busy and unfocused views retain drafts until the successful completion is eligible', async () => {
  enqueue('B');
  complete('A-done');
  await render({ busy: true });
  expect(mockSubmit).not.toHaveBeenCalled();
  mockFocused = false;
  await update();
  expect(mockSubmit).not.toHaveBeenCalled();
  mockFocused = true;
  await update();
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});

test.each(['failure', 'cancellation'] as const)(
  '%s retains admission for manual retry and reports only real failures',
  async (outcome) => {
    enqueue('B');
    mockSubmit.mockRejectedValueOnce(
      outcome === 'failure'
        ? new Error('not admitted')
        : new AgentProtocolError({ code: 'CANCELLED', message: 'Stopped', retryable: true }),
    );
    complete('A-done');
    await render();
    expect(controller.items[0]).toMatchObject({ id: 'B', isManualSendRequired: true });
    expect(mockToast.show).toHaveBeenCalledTimes(outcome === 'failure' ? 1 : 0);
    complete('D-done');
    await update();
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    await act(async () => {
      await controller.send('B');
    });
    expect(mockSubmit).toHaveBeenCalledTimes(2);
    expect(controller.items).toEqual([]);
  },
);

test.each([
  ['previous-turn', false],
  ['previous-turn', true],
  ['current-turn', false],
  ['current-turn', true],
] as const)(
  'an older success cannot dispatch a pending group (previous turn %s, success %s)',
  async (previousTurn, succeeded) => {
    complete('previous-done', previousTurn);
    mockAnswerGroupId = 'current-done';
    mockActiveTurnId = 'current-turn';
    await render({ busy: true });
    act(() => controller.enqueue(draft('B')));
    expect(controller.consumedCompletionId).toBe('previous-done');
    // Live rows can settle before the current group's persisted completion arrives.
    mockActiveTurnId = null;
    await update();
    expect(mockSubmit).not.toHaveBeenCalled();
    complete('current-done', 'current-turn', succeeded);
    await update();
    expect(mockSubmit).toHaveBeenCalledTimes(succeeded ? 1 : 0);
    if (!succeeded) {
      complete('D-done');
      await update();
      expect(mockSubmit).toHaveBeenCalledTimes(1);
    }
  },
);

test('stopped drafts stay manual after regeneration and after sending one retained item', async () => {
  enqueue('B');
  enqueue('C');
  holdFollowupQueue('hook-queue');
  complete('original-done', 'shared-turn');
  await render();
  expect(mockSubmit).not.toHaveBeenCalled();
  complete('regeneration-done', 'shared-turn');
  await update();
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(controller.items.map((item) => item.id)).toEqual(['B', 'C']);
  await act(async () => {
    await controller.send('B');
  });
  complete('B-done');
  await update();
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  expect(controller.items.map((item) => item.id)).toEqual(['C']);
});

test('new drafts advance in FIFO order while older stopped drafts wait for manual sending', async () => {
  enqueue('B');
  holdFollowupQueue('hook-queue');
  enqueue('D');
  enqueue('E');
  complete('C-done');
  await render();
  expect(mockSubmit.mock.calls.map(([request]) => request.parts[0].text)).toEqual(['D']);
  complete('D-done');
  await update();
  expect(mockSubmit.mock.calls.map(([request]) => request.parts[0].text)).toEqual(['D', 'E']);
  expect(controller.items.map((item) => item.id)).toEqual(['B']);
});

test('an unknown current answer group cannot authorize automatic sending', async () => {
  enqueue('B');
  complete('previous-done');
  mockAnswerGroupId = undefined;
  await render();
  expect(mockSubmit).not.toHaveBeenCalled();
  expect(controller.items.map((item) => item.id)).toEqual(['B']);
});

test('a completion preceding terminal live rows remains eligible when its draft is enqueued', async () => {
  complete('A-done');
  mockActiveTurnId = 'A';
  await render({ busy: true });
  act(() => controller.enqueue(draft('B')));
  mockActiveTurnId = null;
  await update();
  expect(mockSubmit).toHaveBeenCalledTimes(1);
  expect(controller.items).toEqual([]);
});

test('a pending send stays exclusive across routes and settles in its originating queue', async () => {
  enqueue('B');
  enqueue('C', 'hook-other');
  let accept!: () => void;
  mockSubmit.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        accept = resolve;
      }),
  );
  await render();
  let sending!: Promise<boolean>;
  act(() => {
    sending = controller.send('B');
  });
  await act(async () => {
    expect(await controller.send('B')).toBe(false);
  });
  await update({ sessionId: 'hook-other' });
  await act(async () => {
    accept();
    await sending;
  });
  expect(readFollowupQueue('hook-queue').items).toEqual([]);
  expect(controller.items.map((item) => item.id)).toEqual(['C']);
  expect(mockSubmit).toHaveBeenCalledTimes(1);
});
