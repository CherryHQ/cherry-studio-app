import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { Topic } from '@cherrystudio/universal/data/types/topic';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TopicList } from '../TopicList';

const mockToggleTopicPin = jest.fn(async () => undefined);
const mockToastShow = jest.fn();
const mockTopic = {
  assistantId: 'assistant-1',
  id: 'topic-1',
  name: 'Pinned topic',
  updatedAt: '2026-07-21T12:00:00.000Z',
} as Topic;
const mockAssistant = {
  emoji: '🍒',
  id: 'assistant-1',
  modelName: 'Mock Chat Model',
} as Assistant;
let mockPinnedTopicIds: readonly string[] = [];

jest.mock('@legendapp/list/react-native', () => {
  const React = jest.requireActual('react');
  const { View: MockView } = jest.requireActual('react-native');

  return {
    LegendList: ({
      data,
      renderItem,
    }: {
      data: readonly Topic[];
      renderItem: (info: { index: number; item: Topic }) => ReactNode;
    }) => (
      <MockView testID="topic-list">
        {data.map((item, index) => (
          <React.Fragment key={item.id}>{renderItem({ index, item })}</React.Fragment>
        ))}
      </MockView>
    ),
  };
});

jest.mock('heroui-native/toast', () => ({
  useToast: () => ({ toast: { show: mockToastShow } }),
}));

jest.mock('lucide-uniwind/png', () => ({
  CheckIcon: () => null,
  PencilIcon: () => null,
  PinIcon: () => null,
  PinOffIcon: () => null,
  Trash2Icon: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: 'en-US' },
    t: (key: string) =>
      ({
        'assistant.model.none': 'No model',
        'common.delete': 'Delete',
        'common.rename': 'Rename',
        'navigation.newChat': 'New chat',
        'topic.actions.pin': 'Pin topic',
        'topic.actions.unpin': 'Unpin topic',
        'topic.updatedAt.yesterday': 'Yesterday',
      })[key] ?? key,
  }),
}));

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: ({
      children,
      renderLeftActions,
    }: {
      children: ReactNode;
      renderLeftActions: (progress: { value: number }, drag: { value: number }) => ReactNode;
    }) => (
      <MockView>
        {renderLeftActions({ value: 1 }, { value: 64 })}
        {children}
      </MockView>
    ),
  };
});

jest.mock('react-native-reanimated', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View: MockView },
    FadeInLeft: { duration: () => undefined },
    FadeOutLeft: { duration: () => undefined },
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
    useAnimatedStyle: (factory: () => unknown) => factory(),
    useSharedValue: (value: number) => ({ value }),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/frontend/hooks/chat', () => ({
  useAssistantsApi: () => ({ assistants: [mockAssistant] }),
}));

jest.mock('@/frontend/hooks/useExclusiveSwipeable', () => ({
  useExclusiveSwipeable: () => ({ notifyClose: jest.fn(), notifyWillOpen: jest.fn() }),
}));

jest.mock('../context/TopicListProvider', () => ({
  TopicListProvider: ({ children }: { children: ReactNode }) => children,
  useTopicListActions: () => ({
    loadMoreTopics: jest.fn(),
    openTopic: jest.fn(),
    toggleTopicPin: mockToggleTopicPin,
  }),
  useTopicListTopics: () => ({
    isPinActionDisabled: false,
    isTopicListLoading: false,
    pinnedTopicIds: mockPinnedTopicIds,
    topics: [mockTopic],
  }),
}));

jest.mock('@/frontend/components/messageTabs', () => ({
  useMessageListBottomInset: () => 0,
  useMessageSelectionActions: () => ({ toggleId: jest.fn() }),
  useMessageSelectionState: () => ({ isEditing: false, selectedIds: new Set() }),
  useRegisterSelectionSource: () => undefined,
}));

jest.mock('../components/TopicActionDialogs', () => ({
  useTopicActionDialogs: () => ({
    dialogs: null,
    requestDelete: jest.fn(),
    requestRename: jest.fn(),
  }),
}));

describe('TopicList pin action', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPinnedTopicIds = [];
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('reveals the pin action on the left and toggles the topic', async () => {
    await act(async () => {
      renderer = create(<TopicList />);
    });

    const pinButton = renderer?.root.findByProps({ accessibilityLabel: 'Pin topic' });

    await act(async () => {
      pinButton?.props.onPress();
    });

    expect(mockToggleTopicPin).toHaveBeenCalledWith('topic-1');
  });

  it('uses a highlighted background and unpin action for pinned topics', async () => {
    mockPinnedTopicIds = ['topic-1'];

    await act(async () => {
      renderer = create(<TopicList />);
    });

    expect(renderer?.root.findByProps({ accessibilityLabel: 'Unpin topic' })).toBeTruthy();
    const highlightedRows =
      renderer?.root.findAllByProps({
        className:
          'relative min-w-0 flex-1 flex-row items-center gap-2 bg-surface-secondary py-2 pl-2',
      }) ?? [];
    expect(highlightedRows.length).toBeGreaterThan(0);
  });

  it('scales the emoji with the global typography scale without a fixed frame height', async () => {
    await act(async () => {
      renderer = create(<TopicList />);
    });

    const emoji = renderer?.root.findAllByType(Text).find((node) => node.props.children === '🍒');

    expect(emoji?.props.className).toContain('text-emoji-3xl');
    expect(emoji?.props.className).not.toContain('h-12');
    expect(emoji?.props.style).toBeUndefined();
    expect(emoji?.props.allowFontScaling).not.toBe(false);
  });
});
