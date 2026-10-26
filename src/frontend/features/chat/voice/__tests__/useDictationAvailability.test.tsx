import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { VoiceEngineId, VoiceEngineStatus } from '@/shared/contracts/voice';

import { useDictationAvailability } from '../useDictationAvailability';

let mockEngine: VoiceEngineId | null;
let mockSystemStatus: VoiceEngineStatus | undefined;
let mockQueryFailed: boolean;

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockSystemStatus, isError: mockQueryFailed }),
}));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({}),
  usePreference: () => [mockEngine],
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
  mockEngine = 'system';
  mockSystemStatus = 'ready';
  mockQueryFailed = false;
});

test('does not offer dictation before an engine is selected', () => {
  mockEngine = null;
  expect(available()).toBe(false);
});

test('system dictation requires device support', () => {
  expect(available()).toBe(true);
  mockSystemStatus = undefined;
  expect(available()).toBe(false);
  mockSystemStatus = 'unsupported';
  expect(available()).toBe(false);
});

test('does not reuse stale availability after a query fails', () => {
  mockQueryFailed = true;
  expect(available()).toBe(false);
});
