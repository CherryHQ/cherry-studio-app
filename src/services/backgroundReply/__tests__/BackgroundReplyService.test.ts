import { AppState, type AppStateStatus, Platform } from 'react-native';

const mockPlayer = {
  loop: false,
  pause: jest.fn(),
  play: jest.fn(),
  remove: jest.fn(),
  volume: 1,
};
const mockCreateAudioPlayer = jest.fn(() => mockPlayer);
const mockSetAudioModeAsync = jest.fn(async () => {});
const mockOrphanEnd = jest.fn(async () => {});
const mockActivityInstances: { end: jest.Mock; update: jest.Mock }[] = [];
const mockActivityFactory = {
  getInstances: jest.fn(() => [{ end: mockOrphanEnd }]),
  start: jest.fn(() => {
    const instance = { end: jest.fn(async () => {}), update: jest.fn(async () => {}) };
    mockActivityInstances.push(instance);
    return instance;
  }),
};

jest.mock('expo-audio', () => ({
  createAudioPlayer: mockCreateAudioPlayer,
  setAudioModeAsync: mockSetAudioModeAsync,
}));
jest.mock('expo-file-system', () => ({
  File: class MockFile {
    exists = true;
    uri = 'file:///widgets/cherry-studio-logo.png';
    copy = jest.fn(async () => {});
  },
}));
jest.mock('expo-widgets', () => ({ widgetsDirectory: 'file:///widgets' }));
jest.mock('../AssistantActivity', () => ({ __esModule: true, default: mockActivityFactory }));
jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (key: string) => key },
}));

// Keep the subject import after native module mocks are registered.
const backgroundReplyModule =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('../BackgroundReplyService') as typeof import('../BackgroundReplyService');
const { BackgroundReplyService } = backgroundReplyModule;

describe('BackgroundReplyService', () => {
  let appStateListener: ((state: AppStateStatus) => void) | undefined;
  let preferenceListener: (() => void) | undefined;
  let enabled: boolean;

  beforeEach(() => {
    enabled = true;
    appStateListener = undefined;
    preferenceListener = undefined;
    mockActivityInstances.length = 0;
    mockPlayer.loop = false;
    mockPlayer.volume = 1;
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' });
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      appStateListener = listener;
      return { remove: jest.fn() };
    });
    jest.spyOn(console, 'info').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('shares audio across turns and creates one activity per topic in the background', async () => {
    const service = createService();
    expect(Platform.OS).toBe('ios');
    expect(AppState.addEventListener).toHaveBeenCalledTimes(1);
    const first = service.startTurn({ assistantName: 'Alpha', topicId: 'topic-1' });
    const second = service.startTurn({ assistantName: 'Beta', topicId: 'topic-2' });
    expect(first).not.toBe(second);
    await Promise.all([first.ready, second.ready]);

    expect(mockSetAudioModeAsync).toHaveBeenCalledTimes(1);
    expect(mockActivityFactory.getInstances).toHaveBeenCalledTimes(1);
    expect(mockOrphanEnd).toHaveBeenCalledWith('immediate');
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);

    appStateListener?.('background');
    await flushOperations();

    expect(mockActivityFactory.start).toHaveBeenCalledTimes(2);
    expect(mockActivityFactory.start).toHaveBeenCalledWith(
      expect.objectContaining({ assistantName: 'Alpha', phase: 'preparing' }),
      'cherrystudio://topics?topicId=topic-1',
    );

    first.finish('completed');
    await flushOperations();
    expect(mockPlayer.pause).not.toHaveBeenCalled();

    second.finish('completed');
    await flushOperations();
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockPlayer.remove).toHaveBeenCalledTimes(1);
    expect(
      mockActivityInstances.every((instance) => instance.end.mock.calls[0]?.[0] === 'default'),
    ).toBe(true);

    service.dispose();
  });

  test('ends activities on foreground and when the preference is disabled', async () => {
    const service = createService();
    const turn = service.startTurn({ assistantName: 'Alpha', topicId: 'topic-1' });
    await turn.ready;
    appStateListener?.('background');
    await flushOperations();

    appStateListener?.('active');
    await flushOperations();
    expect(mockActivityInstances[0]?.end).toHaveBeenCalledWith(
      'immediate',
      expect.any(Object),
      expect.any(Date),
    );

    appStateListener?.('background');
    await flushOperations();
    enabled = false;
    preferenceListener?.();
    await flushOperations();

    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockActivityInstances[1]?.end).toHaveBeenCalledWith(
      'immediate',
      expect.any(Object),
      expect.any(Date),
    );

    service.dispose();
  });

  test('stops audio while approval is pending and resumes it for the continuation', async () => {
    const service = createService();
    const first = service.startTurn({ assistantName: 'Alpha', topicId: 'topic-1' });
    await first.ready;

    first.awaitApproval({
      id: 'assistant-1',
      parts: [],
      role: 'assistant',
    });
    await flushOperations();
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);

    const resumed = service.startTurn({ assistantName: 'Alpha', topicId: 'topic-1' });
    await resumed.ready;
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(2);

    resumed.finish('cancelled');
    await flushOperations();
    service.dispose();
  });

  test('updates phase changes immediately and throttles preview-only updates', async () => {
    const service = createService();
    const turn = service.startTurn({ assistantName: 'Alpha', topicId: 'topic-1' });
    await turn.ready;
    appStateListener?.('background');
    await flushOperations();

    turn.update({ id: 'assistant-1', parts: [{ type: 'text', text: 'first' }], role: 'assistant' });
    await flushOperations();
    expect(mockActivityInstances[0]?.update).toHaveBeenCalledTimes(1);

    turn.update({
      id: 'assistant-1',
      parts: [{ type: 'text', text: 'first second' }],
      role: 'assistant',
    });
    await flushOperations();
    expect(mockActivityInstances[0]?.update).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => setTimeout(resolve, 1050));
    await flushOperations();
    expect(mockActivityInstances[0]?.update).toHaveBeenCalledTimes(2);

    turn.finish('completed');
    await flushOperations();
    service.dispose();
  });

  test('isolates native failures from the reply lifecycle and disposes idempotently', async () => {
    mockSetAudioModeAsync.mockRejectedValueOnce(new Error('audio unavailable'));
    mockActivityFactory.start.mockImplementationOnce(() => {
      throw new Error('activities unavailable');
    });
    const service = createService();
    const turn = service.startTurn({ assistantName: 'Alpha', topicId: 'topic-1' });

    await expect(turn.ready).resolves.toBeUndefined();
    appStateListener?.('background');
    await flushOperations();
    expect(mockActivityFactory.start).toHaveBeenCalledTimes(1);

    expect(() => {
      service.dispose();
      service.dispose();
    }).not.toThrow();
    await flushOperations();
  });

  function createService() {
    return new BackgroundReplyService({
      preference: {
        getCachedValue: jest.fn(() => enabled),
        subscribeChange: jest.fn(() => (listener: () => void) => {
          preferenceListener = listener;
          return jest.fn();
        }),
      },
    });
  }
});

async function flushOperations() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}
