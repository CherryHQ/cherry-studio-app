import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { SpeechSourceRef, VoiceActivity } from '@/shared/contracts/voice';

import { useEndReadingWithConversation, useMessageSpeech } from '../useMessageSpeech';

const mockStopSpeaking = jest.fn();
const mockSpeak = jest.fn(async () => {});
const mockActivityListeners = new Set<() => void>();
let mockActivity: VoiceActivity = { kind: 'idle' };
const mockVoice = {
  getActivity: () => mockActivity,
  speak: mockSpeak,
  stopSpeaking: mockStopSpeaking,
  subscribeActivity: (listener: () => void) => {
    mockActivityListeners.add(listener);
    return () => mockActivityListeners.delete(listener);
  },
};
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
  mockActivity = { kind: 'idle' };
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

test('one message observes its own phase and cancels only its own reading', () => {
  function Control(_props: ReturnType<typeof useMessageSpeech>) {
    return null;
  }
  function Message() {
    return <Control {...useMessageSpeech('a', '[label](target)')} />;
  }
  let renderer!: ReactTestRenderer;
  const readControl = () => renderer.root.findByType(Control).props;
  function publish(activity: VoiceActivity) {
    act(() => {
      mockActivity = activity;
      mockActivityListeners.forEach((listener) => listener());
    });
  }
  act(() => {
    renderer = create(<Message />);
  });
  expect(readControl()).toMatchObject({ phase: 'idle', isSpeaking: false });
  act(() => readControl().toggle());
  expect(mockSpeak).toHaveBeenCalledWith(
    '[label](target)',
    expect.objectContaining({ key: 'a', inputFormat: 'plainText' }),
  );
  publish({ kind: 'speaking', key: 'a', phase: 'preparing' });
  expect(readControl()).toMatchObject({ phase: 'preparing', isSpeaking: true });
  act(() => readControl().toggle());
  expect(mockStopSpeaking).toHaveBeenCalledWith({ key: 'a' });
  publish({ kind: 'speaking', key: 'a', phase: 'playing' });
  expect(readControl()).toMatchObject({ phase: 'playing', isSpeaking: true });
  publish({ kind: 'speaking', key: 'b', phase: 'preparing' });
  expect(readControl()).toMatchObject({ phase: 'idle', isSpeaking: false });
  act(() => renderer.unmount());
});

test('resolves lazy speech text and context getters only when reading starts', () => {
  const getText = jest.fn(() => 'Lazy speech body');
  const getContext = jest.fn(() => ({ title: 'Lazy session' }));
  function Control(_props: ReturnType<typeof useMessageSpeech>) {
    return null;
  }
  function Message() {
    const source = { kind: 'local', sessionId: 'lazy-sess' } as const;
    return <Control {...useMessageSpeech('lazy', getText, getContext, source)} />;
  }
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Message />);
  });
  expect(getText).not.toHaveBeenCalled();
  expect(getContext).not.toHaveBeenCalled();

  act(() => renderer.root.findByType(Control).props.toggle());
  expect(getText).toHaveBeenCalledTimes(1);
  expect(getContext).toHaveBeenCalledTimes(1);
  expect(mockSpeak).toHaveBeenCalledWith(
    'Lazy speech body',
    expect.objectContaining({
      key: 'lazy',
      inputFormat: 'plainText',
      metadata: expect.objectContaining({
        title: 'Lazy session',
        source: { kind: 'local', sessionId: 'lazy-sess' },
      }),
    }),
  );
  act(() => renderer.unmount());
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
