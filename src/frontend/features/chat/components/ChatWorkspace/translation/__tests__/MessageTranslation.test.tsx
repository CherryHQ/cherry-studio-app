import type { ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListItem } from '@/frontend/components/Message';

import { MessageTranslationContent } from '../MessageTranslation';

const mockSetStringAsync = jest.fn().mockResolvedValue(true);
let mockTranslationState: {
  source: { messageId: string; sourceHash: string; text: string };
  state: { visible: boolean; status: 'success'; language: 'zh-CN'; content: string };
  store: { start: jest.Mock; cancel: jest.Mock; toggle: jest.Mock };
};

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => mockSetStringAsync(text),
}));
jest.mock('@/frontend/hooks/useTranslationLanguageMenu', () => ({
  useTranslationLanguageMenu: () => [],
}));
jest.mock('../MessageTranslationProvider', () => ({
  useMessageTranslation: () => mockTranslationState,
}));
jest.mock('@/frontend/components/MarkdownText', () => {
  const { Text } = jest.requireActual('react-native');
  return {
    MarkdownText: ({ markdown }: { markdown: string }) => (
      <Text testID="translation-markdown">{markdown}</Text>
    ),
  };
});
jest.mock('@cherrystudio/ui/components', () => {
  const { Text, View } = jest.requireActual('react-native');
  return {
    ActionMenu: ({ children }: { children: ReactNode }) => children,
    BackgroundPressExclusion: ({ children }: { children: ReactNode }) => children,
    Button: ({ onPress, testID }: { onPress?: () => void; testID?: string }) => (
      <Text onPress={onPress} testID={testID} />
    ),
    ContextMenuExclusion: ({ children }: { children: ReactNode }) => <View>{children}</View>,
    MessagePart: {
      Translation: ({ children }: { children: ReactNode }) => <View>{children}</View>,
    },
    useToast: () => ({ toast: { show: jest.fn() } }),
  };
});

it('retains duplicate-URL citation alias IDs in translated display and clipboard text', async () => {
  mockTranslationState = {
    source: { messageId: 'm1', sourceHash: 'hash', text: 'Original' },
    state: {
      visible: true,
      status: 'success',
      language: 'zh-CN',
      content: '第二个别名 [cite:lookup-2]，第一个 [cite:lookup-1]。',
    },
    store: { start: jest.fn(), cancel: jest.fn(), toggle: jest.fn() },
  };
  const message: MessageListItem = {
    id: 'm1',
    role: 'assistant',
    status: 'success',
    data: {
      parts: [
        {
          type: 'dynamic-tool',
          toolCallId: 'call-1',
          toolName: 'web_search',
          input: {},
          state: 'output-available',
          output: undefined,
        },
        { type: 'text', text: 'Original [cite:lookup-1] and [cite:lookup-2].' },
      ],
      citationSources: [
        { id: 'lookup-1', title: 'First', url: 'https://same.example/doc' },
        { id: 'lookup-2', title: 'Alias', url: 'https://same.example/doc' },
      ],
    },
  };

  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<MessageTranslationContent message={message} />);
  });

  const markdown = renderer.root.findByProps({ testID: 'translation-markdown' }).props.children;
  expect(markdown).toBe(
    '第二个别名 [❶](cite:https%3A%2F%2Fsame.example%2Fdoc)，第一个 [❶](cite:https%3A%2F%2Fsame.example%2Fdoc)。',
  );
  expect(markdown).not.toContain('[cite:');

  await act(async () => {
    renderer.root.findByProps({ testID: 'message-translation-copy' }).props.onPress();
  });
  expect(mockSetStringAsync).toHaveBeenCalledWith('第二个别名 [1]，第一个 [1]。');
  await act(async () => renderer.unmount());
});
