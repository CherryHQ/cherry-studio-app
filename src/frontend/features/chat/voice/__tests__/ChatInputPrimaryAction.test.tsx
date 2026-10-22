import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ChatInputPrimaryAction } from '../ChatInputPrimaryAction';

let mockDraft = '';
let mockAttachments: unknown[] = [];
let mockDictationState = 'idle';

jest.mock('@cherrystudio/ui/motion', () => ({ duration: { fast: 200 }, easing: {} }));
jest.mock('react-native-reanimated', () => {
  const { Fragment } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    LayoutAnimationConfig: Fragment,
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => true,
    useSharedValue: (value: unknown) => ({ get: () => value, set: jest.fn() }),
    withTiming: (value: unknown) => value,
  };
});
jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(async () => undefined),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@cherrystudio/ui/components', () => {
  const { Pressable } = jest.requireActual('react-native');
  return {
    Composer: {
      Action: ({ children, ...props }: { children: ReactNode }) => (
        <Pressable {...props}>{children}</Pressable>
      ),
    },
  };
});
jest.mock('@/frontend/components/Composer', () => ({
  useComposerState: () => ({ draft: mockDraft, attachments: mockAttachments }),
}));
jest.mock('../useDictation', () => ({
  useDictation: () => ({
    state: mockDictationState,
    level: 0,
    start: jest.fn(),
    stop: jest.fn(),
    cancel: jest.fn(),
  }),
}));

function render(streaming = false) {
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(
      <ChatInputPrimaryAction send={<Text testID="send">send</Text>} streaming={streaming} />,
    );
  });
  const shows = (testID: string) => renderer.root.findAll((node) => node.props.testID === testID);
  return {
    dictation: shows('chat-composer-dictation').length > 0,
    send: shows('send').length > 0,
  };
}

beforeEach(() => {
  mockDraft = '';
  mockAttachments = [];
  mockDictationState = 'idle';
});

test('an empty draft offers voice input in the send slot', () => {
  expect(render()).toEqual({ dictation: true, send: false });
});

test('text or an attachment turns the slot into send', () => {
  mockDraft = 'hello';
  expect(render()).toEqual({ dictation: false, send: true });
  mockDraft = '  ';
  mockAttachments = [{ id: 'file' }];
  expect(render()).toEqual({ dictation: false, send: true });
});

test('dictation keeps the slot while its text fills the draft', () => {
  mockDraft = 'recognized so far';
  mockDictationState = 'listening';
  expect(render()).toEqual({ dictation: true, send: false });
});

test('a streaming reply keeps send, which stops it', () => {
  expect(render(true)).toEqual({ dictation: false, send: true });
});
