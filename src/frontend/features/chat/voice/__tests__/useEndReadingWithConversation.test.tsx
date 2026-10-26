import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useEndReadingWithConversation } from '../useMessageSpeech';

const mockStopSpeaking = jest.fn();
const mockVoice = { stopSpeaking: mockStopSpeaking };
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
