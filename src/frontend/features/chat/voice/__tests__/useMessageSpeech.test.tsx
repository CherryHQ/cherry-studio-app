import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { VoiceActivity } from '@/shared/contracts/voice';

import { useMessageSpeech, type SpeechContext } from '../useMessageSpeech';

const mockSpeak = jest.fn(async () => undefined);
const mockStopSpeaking = jest.fn();
const mockToastShow = jest.fn();
const mockHapticLight = jest.fn();
let currentActivity: VoiceActivity = { kind: 'idle' };
const listeners = new Set<() => void>();

const mockVoice = {
  speak: mockSpeak,
  stopSpeaking: mockStopSpeaking,
  getActivity: () => currentActivity,
  subscribeActivity: (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

function setActivity(next: VoiceActivity) {
  currentActivity = next;
  listeners.forEach((listener) => listener());
}

jest.mock('expo-linking', () => ({
  resolveScheme: () => 'cherrystudio',
}));
jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
}));
jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));
jest.mock('@cherrystudio/ui/haptics', () => ({
  haptics: { light: () => mockHapticLight() },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => mockVoice,
  usePreference: () => [null, jest.fn()],
}));

const latest: { current: ReturnType<typeof useMessageSpeech> | undefined } = {
  current: undefined,
};

function Probe({
  messageId,
  text,
  context,
}: {
  messageId: string;
  text: string | undefined;
  context?: SpeechContext;
}) {
  const speech = useMessageSpeech(messageId, text, context);
  useEffect(() => {
    latest.current = speech;
  }, [speech]);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  currentActivity = { kind: 'idle' };
  listeners.clear();
  latest.current = undefined;
});

test('passes conversation metadata in-app, privacy-safe generic systemLabels to OS surfaces, and stops only its message key', () => {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <Probe
        context={{
          source: { kind: 'local', sessionId: 'sess-1' },
          title: 'Private Patient Session',
          subtitle: 'Cherry Agent',
        }}
        messageId="msg-1"
        text="Hello world"
      />,
    );
  });

  expect(latest.current).toMatchObject({ isSpeaking: false, phase: 'idle' });

  act(() => {
    latest.current!.toggle();
  });

  expect(mockHapticLight).toHaveBeenCalledTimes(1);
  expect(mockSpeak).toHaveBeenCalledWith('Hello world', {
    key: 'msg-1',
    inputFormat: 'plainText',
    metadata: {
      title: 'Private Patient Session',
      subtitle: 'Cherry Agent',
      source: { kind: 'local', sessionId: 'sess-1' },
    },
    systemLabels: {
      title: 'settings.voice.speech.title',
      subtitle: 'Cherry Studio',
      channelName: 'settings.voice.speech.title',
      play: 'voice.speech.resume',
      pause: 'voice.speech.pause',
      stop: 'voice.speech.stop',
      deepLinkUrl: 'cherrystudio:///?sessionId=sess-1',
    },
  });

  act(() => {
    setActivity({ kind: 'speaking', key: 'msg-1', phase: 'preparing' });
  });
  expect(latest.current).toMatchObject({ isSpeaking: true, phase: 'preparing' });

  act(() => {
    setActivity({ kind: 'speaking', key: 'msg-1', phase: 'playing' });
  });
  expect(latest.current).toMatchObject({ isSpeaking: true, phase: 'playing' });

  act(() => {
    latest.current!.toggle();
  });
  expect(mockStopSpeaking).toHaveBeenCalledWith({ key: 'msg-1' });

  act(() => {
    renderer.unmount();
  });
});

test('builds remote deep link when source kind is desktop', () => {
  act(() => {
    create(
      <Probe
        context={{
          source: { kind: 'desktop', connectionId: 'conn-1', sessionId: 'sess-2' },
          title: 'Remote Session',
          subtitle: 'Desktop',
        }}
        messageId="msg-2"
        text="Remote hello"
      />,
    );
  });

  act(() => {
    latest.current!.toggle();
  });

  expect(mockSpeak).toHaveBeenCalledWith(
    'Remote hello',
    expect.objectContaining({
      metadata: expect.objectContaining({
        source: { kind: 'desktop', connectionId: 'conn-1', sessionId: 'sess-2' },
      }),
      systemLabels: expect.objectContaining({
        title: 'settings.voice.speech.title',
        deepLinkUrl: 'cherrystudio://remote?connectionId=conn-1&sessionId=sess-2',
      }),
    }),
  );
});
