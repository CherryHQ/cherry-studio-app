import { Platform } from 'react-native';

import type { BackgroundActivitySessionInput } from '@/backend/services/backgroundActivities/BackgroundActivityManager';
import type { BackgroundReplyActivityProps } from '@/shared/backgroundActivities/chatReply';

import { BackgroundReplyService } from '../BackgroundReplyService';

type SessionInput = BackgroundActivitySessionInput<BackgroundReplyActivityProps>;

type MockSession = {
  cancel: jest.Mock;
  finish: jest.Mock;
  input: SessionInput;
  ready: Promise<void>;
  update: jest.Mock;
};

describe('BackgroundReplyService', () => {
  let preferenceListener: (() => void) | undefined;
  let enabled: boolean;
  const mockSessions: MockSession[] = [];
  const mockStartSession = jest.fn((input: SessionInput): MockSession => {
    const session: MockSession = {
      cancel: jest.fn(),
      finish: jest.fn(),
      input,
      ready: Promise.resolve(),
      update: jest.fn(),
    };
    mockSessions.push(session);
    return session;
  });

  beforeEach(() => {
    enabled = true;
    preferenceListener = undefined;
    mockSessions.length = 0;
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('opens one keep-alive session per topic with derived initial content', async () => {
    const service = await createService();
    const first = service.startTurn({ assistantName: 'Alpha', topicId: 'topic-1' });
    const second = service.startTurn({ assistantName: 'Beta', topicId: 'topic-2' });
    expect(first).not.toBe(second);
    await Promise.all([first.ready, second.ready]);

    expect(mockStartSession).toHaveBeenCalledTimes(2);
    expect(mockSessions[0]?.input).toMatchObject({
      deepLinkUrl: 'cherrystudio://topics?topicId=topic-1',
      keepAlive: true,
      props: expect.objectContaining({ assistantName: 'Alpha', phase: 'preparing' }),
      tag: 'chat.backgroundReply',
    });

    await service._doStop();
  });

  test('uses the localized assistant fallback when no assistant or model name is available', async () => {
    const service = await createService();
    const turn = service.startTurn({ assistantName: ' ', topicId: 'topic-1' });
    await turn.ready;

    expect(mockSessions[0]?.input.props).toMatchObject({ assistantName: 'Localized assistant' });

    await service._doStop();
  });

  test('marks phase changes urgent and drops keep-alive while approval is pending', async () => {
    const service = await createService();
    const turn = service.startTurn({ assistantName: 'Alpha', topicId: 'topic-1' });
    await turn.ready;
    const session = mockSessions[0];

    turn.update({ id: 'assistant-1', parts: [{ type: 'text', text: 'hello' }], role: 'assistant' });
    expect(session?.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'responding', preview: 'hello' }),
      { keepAlive: true, urgent: true },
    );

    turn.update({
      id: 'assistant-1',
      parts: [{ type: 'text', text: 'hello more' }],
      role: 'assistant',
    });
    expect(session?.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'responding' }),
      { keepAlive: true, urgent: false },
    );

    turn.awaitApproval({ id: 'assistant-1', parts: [], role: 'assistant' });
    expect(session?.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'awaiting-approval' }),
      { keepAlive: false, urgent: true },
    );

    turn.finish('completed');
    await flushOperations();
    expect(session?.finish).toHaveBeenCalledWith(expect.objectContaining({ phase: 'completed' }));
    await service._doStop();
  });

  test('does not let an older finish end the session inherited by a newer turn', async () => {
    const service = await createService();
    const first = service.startTurn({ assistantName: 'Alpha', topicId: 'topic-1' });
    await first.ready;
    const session = mockSessions[0];

    first.finish('completed');
    const second = service.startTurn({ assistantName: 'Alpha', topicId: 'topic-1' });
    await second.ready;
    await flushOperations();

    expect(mockStartSession).toHaveBeenCalledTimes(1);
    expect(session?.finish).not.toHaveBeenCalled();
    expect(session?.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ phase: 'preparing' }),
      { keepAlive: true, urgent: true },
    );

    second.finish('completed');
    await flushOperations();
    expect(session?.finish).toHaveBeenCalledTimes(1);
    await service._doStop();
  });

  test('clearTopic cancels the session so approval records cannot recreate it later', async () => {
    const service = await createService();
    const turn = service.startTurn({ assistantName: 'Alpha', topicId: 'topic-1' });
    await turn.ready;

    turn.awaitApproval();
    service.clearTopic('topic-1');
    expect(mockSessions[0]?.cancel).toHaveBeenCalledTimes(1);

    turn.update({ id: 'assistant-1', parts: [{ type: 'text', text: 'late' }], role: 'assistant' });
    expect(mockStartSession).toHaveBeenCalledTimes(1);
    await service._doStop();
  });

  test('cancels sessions when the preference turns off and restores them on re-enable', async () => {
    const service = await createService();
    const turn = service.startTurn({ assistantName: 'Alpha', topicId: 'topic-1' });
    await turn.ready;

    enabled = false;
    preferenceListener?.();
    expect(mockSessions[0]?.cancel).toHaveBeenCalledTimes(1);

    turn.update({ id: 'assistant-1', parts: [{ type: 'text', text: 'hi' }], role: 'assistant' });
    expect(mockStartSession).toHaveBeenCalledTimes(1);

    enabled = true;
    preferenceListener?.();
    expect(mockStartSession).toHaveBeenCalledTimes(2);
    expect(mockSessions[1]?.input.props).toMatchObject({ phase: 'responding' });

    await service._doStop();
  });

  test('ends sessions when stopped during an active turn and stops idempotently', async () => {
    const service = await createService();
    const turn = service.startTurn({ assistantName: 'Alpha', topicId: 'topic-1' });
    await turn.ready;

    await expect(service._doStop()).resolves.toBeUndefined();
    await expect(service._doStop()).resolves.toBeUndefined();
    expect(mockSessions[0]?.cancel).toHaveBeenCalledTimes(1);
  });

  test('uses no-op turns on Android and when the preference is disabled at startup', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    const androidService = await createService();
    const androidTurn = androidService.startTurn({ assistantName: 'Alpha', topicId: 'topic-1' });
    await androidTurn.ready;
    expect(mockStartSession).not.toHaveBeenCalled();
    await androidService._doStop();

    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    enabled = false;
    const disabledService = await createService();
    const disabledTurn = disabledService.startTurn({
      assistantName: 'Alpha',
      topicId: 'topic-2',
    });
    await disabledTurn.ready;
    expect(mockStartSession).not.toHaveBeenCalled();
    await disabledService._doStop();
  });

  test('keeps turn callbacks non-throwing when content derivation fails', async () => {
    const service = await createService((key) => {
      if (
        key === 'chat.backgroundReply.awaitingApproval' ||
        key === 'chat.backgroundReply.completed' ||
        key === 'chat.backgroundReply.responding'
      ) {
        throw new Error('translation failed');
      }
      return key;
    });
    const turn = service.startTurn({ assistantName: 'Alpha', topicId: 'topic-1' });
    await turn.ready;

    expect(() =>
      turn.update({
        id: 'assistant-1',
        parts: [{ type: 'text', text: 'hello' }],
        role: 'assistant',
      }),
    ).not.toThrow();
    expect(() => turn.awaitApproval()).not.toThrow();
    expect(() => turn.finish('completed')).not.toThrow();

    await service._doStop();
  });

  async function createService(
    translate: (key: string) => string = (key) =>
      key === 'chat.backgroundReply.assistant' ? 'Localized assistant' : key,
  ) {
    const service = new BackgroundReplyService(
      { startSession: mockStartSession },
      {
        readCached: jest.fn(() => enabled),
        subscribeChange: jest.fn(() => (listener: () => void) => {
          preferenceListener = listener;
          return jest.fn();
        }),
      },
      {
        assistantPresenter: undefined as never,
        translate,
      },
    );
    await service._doInit();
    return service;
  }
});

async function flushOperations() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
