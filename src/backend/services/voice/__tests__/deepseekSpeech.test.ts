import { createDeepseekSpeech } from '../deepseekSpeech';

const mockRequest = jest.fn();
const mockPlayer = {
  addListener: jest.fn(() => ({ remove: jest.fn() })),
  play: jest.fn(),
  pause: jest.fn(),
  remove: jest.fn(),
  release: jest.fn(),
};

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

test('pauses native playback in the abort callback before releasing the player', async () => {
  const controller = new AbortController();
  const reason = new Error('Stopped reading');
  const events: string[] = [];
  mockRequest.mockResolvedValueOnce({
    data: new TextEncoder().encode('RIFF    WAVE'.padEnd(44)).buffer,
    headers: { 'content-type': 'audio/wav' },
  });
  mockPlayer.play.mockImplementationOnce(() => {
    controller.abort(reason);
    events.push('abort returned');
  });
  mockPlayer.pause.mockImplementationOnce(() => events.push('pause'));
  mockPlayer.release.mockImplementationOnce(() => events.push('release'));

  const speech = createDeepseekSpeech(async () => 'stella');
  await expect(
    speech.speak({ text: 'Hello.', language: 'en-US', signal: controller.signal }),
  ).rejects.toBe(reason);
  expect(events).toEqual(['pause', 'abort returned', 'release']);
});
