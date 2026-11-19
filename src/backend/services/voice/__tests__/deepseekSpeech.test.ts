import { Platform } from 'react-native';

import { createDeepseekSpeech } from '../deepseekSpeech';

const mockRequest = jest.fn();
const mockPlayer = {
  addListener: jest.fn(),
  play: jest.fn(),
  pause: jest.fn(),
  release: jest.fn(),
};

jest.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
jest.mock('expo-audio', () => ({ createAudioPlayer: () => mockPlayer }));
jest.mock('expo-file-system', () => ({
  File: jest.fn(() => ({
    uri: 'file:///cache/speech.wav',
    exists: true,
    writeSync: jest.fn(),
    delete: jest.fn(),
  })),
  Paths: { cache: 'file:///cache' },
}));
jest.mock('@/backend/services/http', () => ({
  createHttpClient: () => ({ request: mockRequest }),
}));
jest.mock('@/backend/services/providers/deepseekConnection', () => ({
  resolveDeepseekConnection: async () => ({ baseUrl: 'https://example.test', headers: {} }),
}));
jest.mock('../audioSession', () => ({
  voiceAudioSession: {
    acquire: async () => async () => {},
    playback: async () => {},
  },
}));

afterEach(() => {
  jest.restoreAllMocks();
});

test.each([
  { platform: 'ios', expected: ['remove listener', 'release', 'abort returned'] },
  { platform: 'android', expected: ['pause', 'abort returned', 'remove listener', 'release'] },
] as const)(
  'stops $platform playback in the abort callback and releases once',
  async ({ platform, expected }) => {
    jest.replaceProperty(Platform, 'OS', platform);
    const controller = new AbortController();
    const reason = new Error('Stopped reading');
    const events: string[] = [];
    mockRequest.mockResolvedValueOnce({
      data: new TextEncoder().encode('RIFF    WAVE'.padEnd(44)).buffer,
      headers: { 'content-type': 'audio/wav' },
    });
    mockPlayer.addListener.mockReturnValueOnce({ remove: () => events.push('remove listener') });
    mockPlayer.play.mockImplementationOnce(() => {
      queueMicrotask(() => {
        controller.abort(reason);
        events.push('abort returned');
      });
    });
    mockPlayer.pause.mockImplementation(() => events.push('pause'));
    mockPlayer.release.mockImplementation(() => events.push('release'));

    const speech = createDeepseekSpeech(async () => 'stella');
    await expect(
      speech.speak({ text: 'Hello.', language: 'en-US', signal: controller.signal }),
    ).rejects.toBe(reason);
    expect(events).toEqual(expected);
  },
);
