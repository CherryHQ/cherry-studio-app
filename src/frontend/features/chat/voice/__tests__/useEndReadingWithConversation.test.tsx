import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { SpeechSourceRef } from '@/shared/contracts/voice';

import { useEndReadingWithConversation } from '../useMessageSpeech';

const mockStopSpeaking = jest.fn();
const mockVoice = { stopSpeaking: mockStopSpeaking };
let mockFocused = true;
let mockBackgroundReading = false;

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import('react')>('react');
    const focused = mockFocused;
    useEffect(() => (focused ? effect() : undefined), [effect, focused]);
  },
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: jest.fn() } }),
}));
jest.mock('@cherrystudio/ui/haptics', () => ({
  haptics: { light: jest.fn(), selection: jest.fn() },
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/components/AiFailure', () => ({ aiFailureReasonTitleKey: () => undefined }));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => mockVoice,
  usePreference: () => [mockBackgroundReading, jest.fn()],
}));

function Conversation({ source }: { source: SpeechSourceRef }) {
  useEndReadingWithConversation(source);
  return null;
}

const sourceA: SpeechSourceRef = { kind: 'local', sessionId: 'a' };
const sourceB: SpeechSourceRef = { kind: 'local', sessionId: 'b' };

beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  mockBackgroundReading = false;
});

test('switching or closing the conversation stops only its own source when background reading is disabled', () => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Conversation source={sourceA} />);
  });
  expect(mockStopSpeaking).not.toHaveBeenCalled();
  act(() => renderer.update(<Conversation source={sourceB} />));
  expect(mockStopSpeaking).toHaveBeenCalledTimes(1);
  expect(mockStopSpeaking).toHaveBeenNthCalledWith(1, { source: sourceA });
  act(() => renderer.unmount());
  expect(mockStopSpeaking).toHaveBeenCalledTimes(2);
  expect(mockStopSpeaking).toHaveBeenNthCalledWith(2, { source: sourceB });
});

test('covering a mounted conversation stops reading once; hidden unmount cannot stop a new reading', () => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Conversation source={sourceA} />);
  });
  act(() => renderer.update(<Conversation source={sourceA} />));
  expect(mockStopSpeaking).not.toHaveBeenCalled();

  act(() => {
    mockFocused = false;
    renderer.update(<Conversation source={sourceA} />);
  });
  expect(mockStopSpeaking).toHaveBeenCalledTimes(1);
  expect(mockStopSpeaking).toHaveBeenCalledWith({ source: sourceA });

  // The next route can own a new reading while this screen remains in the stack.
  act(() => renderer.unmount());
  expect(mockStopSpeaking).toHaveBeenCalledTimes(1);
});

test('preserves reading across navigation only when dedicated background reading preference is enabled', () => {
  mockBackgroundReading = true;
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Conversation source={sourceA} />);
  });
  act(() => renderer.update(<Conversation source={sourceB} />));
  act(() => {
    mockFocused = false;
    renderer.update(<Conversation source={sourceB} />);
  });
  act(() => renderer.unmount());
  expect(mockStopSpeaking).not.toHaveBeenCalled();

  mockBackgroundReading = false;
  mockFocused = true;
  act(() => {
    renderer = create(<Conversation source={sourceA} />);
  });
  act(() => renderer.unmount());
  expect(mockStopSpeaking).toHaveBeenCalledWith({ source: sourceA });
});
