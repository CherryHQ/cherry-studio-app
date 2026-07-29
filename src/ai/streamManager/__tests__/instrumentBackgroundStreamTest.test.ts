import type { UIMessageChunk } from 'ai';
import { AppState } from 'react-native';

import { instrumentBackgroundStreamTest } from '../instrumentBackgroundStreamTest';

const mockPlayer = {
  loop: false,
  pause: jest.fn(),
  play: jest.fn(),
  remove: jest.fn(),
  volume: 1,
};
const mockCreateAudioPlayer = jest.fn(() => mockPlayer);
const mockSetAudioModeAsync = jest.fn(async () => {});

jest.mock('expo-audio', () => ({
  createAudioPlayer: mockCreateAudioPlayer,
  setAudioModeAsync: mockSetAudioModeAsync,
}));

describe('instrumentBackgroundStreamTest', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'development';
    global.__DEV__ = true;
    mockPlayer.loop = false;
    mockPlayer.volume = 1;
    jest.clearAllMocks();
    jest.spyOn(AppState, 'addEventListener').mockReturnValue({ remove: jest.fn() });
    jest.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    jest.restoreAllMocks();
  });

  it('plays silent mixed audio while relaying the stream and releases it on completion', async () => {
    const chunk = { id: 'text-1', type: 'text-start' } as UIMessageChunk;
    const source = new ReadableStream<UIMessageChunk>({
      start(controller) {
        controller.enqueue(chunk);
        controller.close();
      },
    });

    const output = instrumentBackgroundStreamTest(source, {
      messageId: 'message-1',
      modelId: 'provider::model',
    });
    const values: UIMessageChunk[] = [];

    for await (const value of output) values.push(value);

    expect(values).toEqual([chunk]);
    expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
      allowsRecording: false,
      interruptionMode: 'mixWithOthers',
      playsInSilentMode: true,
      shouldPlayInBackground: true,
    });
    expect(mockCreateAudioPlayer).toHaveBeenCalledTimes(1);
    expect(mockPlayer.loop).toBe(true);
    expect(mockPlayer.volume).toBe(0.001);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockPlayer.remove).toHaveBeenCalledTimes(1);
  });

  it('does not initialize the native audio module in tests by default', () => {
    process.env.NODE_ENV = 'test';
    const source = new ReadableStream<UIMessageChunk>();

    expect(
      instrumentBackgroundStreamTest(source, {
        modelId: 'provider::model',
      }),
    ).toBe(source);
    expect(mockCreateAudioPlayer).not.toHaveBeenCalled();
  });
});
