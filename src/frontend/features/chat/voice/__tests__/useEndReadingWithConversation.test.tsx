import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { VoiceActivity } from '@/shared/contracts/voice';

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
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/components/AiFailure', () => ({ aiFailureReasonTitleKey: () => undefined }));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => mockVoice,
}));

function Conversation({ id }: { id: string }) {
  useEndReadingWithConversation(id);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocused = true;
  mockActivity = { kind: 'idle' };
});

test('switching or closing the conversation ends its reading', () => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Conversation id="a" />);
  });
  expect(mockStopSpeaking).not.toHaveBeenCalled();
  act(() => renderer.update(<Conversation id="b" />));
  expect(mockStopSpeaking).toHaveBeenCalledTimes(1);
  act(() => renderer.unmount());
  expect(mockStopSpeaking).toHaveBeenCalledTimes(2);
});

test('covering a mounted conversation stops reading once; hidden unmount cannot stop new reading', () => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Conversation id="a" />);
  });
  act(() => renderer.update(<Conversation id="a" />));
  expect(mockStopSpeaking).not.toHaveBeenCalled();

  act(() => {
    mockFocused = false;
    renderer.update(<Conversation id="a" />);
  });
  expect(mockStopSpeaking).toHaveBeenCalledTimes(1);

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
  expect(mockStopSpeaking).toHaveBeenCalledWith('a');
  publish({ kind: 'speaking', key: 'a', phase: 'playing' });
  expect(readControl()).toMatchObject({ phase: 'playing', isSpeaking: true });
  publish({ kind: 'speaking', key: 'b', phase: 'preparing' });
  expect(readControl()).toMatchObject({ phase: 'idle', isSpeaking: false });
  act(() => renderer.unmount());
});

test('resolves a lazy speech text getter only when reading starts', () => {
  const getText = jest.fn(() => 'Lazy speech body');
  function Control(_props: ReturnType<typeof useMessageSpeech>) {
    return null;
  }
  function Message() {
    return <Control {...useMessageSpeech('lazy', getText)} />;
  }
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(<Message />);
  });
  expect(getText).not.toHaveBeenCalled();

  act(() => renderer.root.findByType(Control).props.toggle());
  expect(getText).toHaveBeenCalledTimes(1);
  expect(mockSpeak).toHaveBeenCalledWith(
    'Lazy speech body',
    expect.objectContaining({ key: 'lazy', inputFormat: 'plainText' }),
  );
  act(() => renderer.unmount());
});
