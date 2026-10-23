import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type {
  VoiceEngineId,
  VoiceEngineStatus,
  VoiceModelSelection,
} from '@/shared/contracts/voice';
import { MODEL_CAPABILITY, type Model } from '@/shared/data/types/model';

import { useDictationAvailability } from '../useDictationAvailability';

let mockEngine: VoiceEngineId | null;
let mockSelection: VoiceModelSelection | null;
let mockSystemStatus: VoiceEngineStatus | undefined;
let mockModels: Model[];
let mockProviders: { id: string }[];
let mockQueryFailed: boolean;

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockSystemStatus, isError: mockQueryFailed }),
}));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({}),
  usePreference: (key: string) => [
    key === 'feature.voice.dictation_engine' ? mockEngine : mockSelection,
  ],
  useQuery: () => ({ data: mockModels, isError: mockQueryFailed }),
}));
jest.mock('@/frontend/hooks/chat/useProvider', () => ({
  useProviders: () => ({ providers: mockProviders }),
}));

function available() {
  let result = false;
  let renderer!: ReactTestRenderer;
  function Probe() {
    result = useDictationAvailability();
    return null;
  }
  act(() => {
    renderer = create(<Probe />);
  });
  act(() => renderer.unmount());
  return result;
}

beforeEach(() => {
  mockEngine = 'ai';
  mockSelection = { providerId: 'voice-provider', modelId: 'whisper-1' };
  mockSystemStatus = 'ready';
  mockQueryFailed = false;
  mockProviders = [{ id: 'voice-provider' }];
  mockModels = [
    {
      id: 'voice-provider::whisper-1',
      providerId: 'voice-provider',
      modelId: 'whisper-1',
      name: 'Whisper',
      capabilities: [MODEL_CAPABILITY.AUDIO_TRANSCRIPT],
      isEnabled: true,
      isHidden: false,
      isDeprecated: false,
      supportsStreaming: false,
    },
  ];
});

test('does not offer dictation before an engine is selected', () => {
  mockEngine = null;
  expect(available()).toBe(false);
});

test('system dictation requires device support and no AI model', () => {
  mockEngine = 'system';
  mockSelection = null;
  expect(available()).toBe(true);
  mockSystemStatus = undefined;
  expect(available()).toBe(false);
  mockSystemStatus = 'unsupported';
  expect(available()).toBe(false);
});

test('AI dictation requires a selected, enabled transcription model and account', () => {
  expect(available()).toBe(true);
  mockSelection = null;
  expect(available()).toBe(false);
  mockSelection = { providerId: 'voice-provider', modelId: 'whisper-1' };
  mockProviders = [];
  expect(available()).toBe(false);
  mockProviders = [{ id: 'voice-provider' }];
  mockModels = [];
  expect(available()).toBe(false);
});

test.each([
  { isHidden: true },
  { isEnabled: false },
  { capabilities: [] },
  { providerId: 'another-account' },
])('rejects an unavailable saved model: %j', (patch) => {
  mockModels[0] = { ...mockModels[0]!, ...patch };
  expect(available()).toBe(false);
});

test('does not reuse stale availability after a query fails', () => {
  mockQueryFailed = true;
  expect(available()).toBe(false);
  mockEngine = 'system';
  expect(available()).toBe(false);
});
