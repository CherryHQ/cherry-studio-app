import type { TopicListItem } from '@cherrystudio/universal/data/api/schemas/topics';
import type { Assistant } from '@cherrystudio/universal/data/types/assistant';
import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TopicList } from '../TopicList';

const mockToggleTopicPin = jest.fn(async () => undefined);
const mockAlertShow = jest.fn();
const mockTopic = {
  assistantId: 'assistant-1',
  id: 'topic-1',
  latestMessageText: 'The latest\nmessage preview',
  name: 'Pinned topic',
  updatedAt: '2026-07-21T12:00:00.000Z',
} as TopicListItem;
const mockAssistant = {
  emoji: '🍒',
  id: 'assistant-1',
  modelName: 'Mock Chat Model',
} as Assistant;
let mockPinnedTopicIds: readonly string[] = [];
let mockPendingDeletionIds: ReadonlySet<string> = new Set();
let mockShowsVerticalScrollIndicator: boolean | undefined;

jest.mock('@legendapp/list/react-native', () => {
  const React = jest.requireActual('react');
  const { View: MockView } = jest.requireActual('react-native');

  return {
    LegendList: ({
      data,
      renderItem,
      showsVerticalScrollIndicator,
    }: {
      data: readonly TopicListItem[];
      renderItem: (info: { index: number; item: TopicListItem }) => ReactNode;
      showsVerticalScrollIndicator?: boolean;
    }) => {
      mockShowsVerticalScrollIndicator = showsVerticalScrollIndicator;
      return (
        <MockView testID="topic-list">
          {data.map((item, index) => (
            <React.Fragment key={item.id}>{renderItem({ index, item })}</React.Fragment>
          ))}
        </MockView>
      );
    },
  };
});

jest.mock('@cherrystudio/app-icons', () => ({ CheckIcon: () => null }));

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
        'topic.pin.failed': 'Failed to update pin state',
        'topic.updatedAt.yesterday': 'Yesterday',
      })[key] ?? key,
  }),
}));

jest.mock('react-native-reanimated', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View: MockView },
    FadeInLeft: { duration: () => undefined },
    FadeOutLeft: { duration: () => undefined },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}));

jest.mock('@/frontend/hooks/chat', () => ({
  useAssistantsApi: () => ({ assistants: [mockAssistant] }),
}));

jest.mock('@/frontend/components/AlertProvider', () => ({
  useAlert: () => ({ alert: { show: mockAlertShow } }),
}));

jest.mock('@/frontend/components/navigation', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    ContextMenuLink: ({ children, ...props }: { children: ReactNode }) => (
      <MockView {...props} testID="topic-context-link">
        {children}
      </MockView>
    ),
  };
});

jest.mock('../context/TopicListProvider', () => ({
  TopicListProvider: ({ children }: { children: ReactNode }) => children,
  useTopicListActions: () => ({
    loadMoreTopics: jest.fn(),
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
  useMessagePendingDeletionIds: () => mockPendingDeletionIds,
  useMessageSelectionActions: () => ({ toggleId: jest.fn() }),
  useMessageSelectionState: () => ({
    isDeletionPending: mockPendingDeletionIds.size > 0,
    isEditing: false,
    selectedIds: new Set(),
  }),
  useRegisterSelectionSource: () => undefined,
}));

jest.mock('../components/useTopicActionAlerts', () => ({
  useTopicActionAlerts: () => ({
    requestDelete: jest.fn(),
    requestRename: jest.fn(),
  }),
}));

describe('TopicList context actions', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPendingDeletionIds = new Set();
    mockPinnedTopicIds = [];
    mockShowsVerticalScrollIndicator = undefined;
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('links to the topic and toggles pinning from the context menu', async () => {
    await act(async () => {
      renderer = create(<TopicList />);
    });

    const link = renderer?.root.findByProps({ testID: 'topic-context-link' });
    const pinAction = link?.props.items.find((item: { id: string }) => item.id === 'toggle-pin');

    expect(link?.props.href).toEqual({ pathname: '/topics', params: { topicId: 'topic-1' } });

    await act(async () => {
      pinAction?.onPress();
    });

    expect(mockToggleTopicPin).toHaveBeenCalledWith('topic-1');
  });

  it('shows an alert when updating the pin state fails', async () => {
    mockToggleTopicPin.mockRejectedValueOnce(new Error('Pin failed'));

    await act(async () => {
      renderer = create(<TopicList />);
    });

    const link = renderer?.root.findByProps({ testID: 'topic-context-link' });
    const pinAction = link?.props.items.find((item: { id: string }) => item.id === 'toggle-pin');

    await act(async () => {
      pinAction?.onPress();
    });

    expect(mockAlertShow).toHaveBeenCalledWith({ title: 'Failed to update pin state' });
  });

  it('uses a highlighted background and unpin action for pinned topics', async () => {
    mockPinnedTopicIds = ['topic-1'];

    await act(async () => {
      renderer = create(<TopicList />);
    });

    const pinAction = renderer?.root
      .findByProps({ testID: 'topic-context-link' })
      .props.items.find((item: { id: string }) => item.id === 'toggle-pin');
    expect(pinAction).toMatchObject({ checked: true, label: 'Unpin topic' });
    const highlightedRows =
      renderer?.root.findAllByProps({
        className:
          'relative min-w-0 flex-1 flex-row items-center gap-2 border-border border-b bg-secondary py-2 pl-2',
      }) ?? [];
    expect(highlightedRows.length).toBeGreaterThan(0);
  });

  it('keeps the assistant emoji at a fixed avatar size', async () => {
    await act(async () => {
      renderer = create(<TopicList />);
    });

    const emoji = renderer?.root.findAllByType(Text).find((node) => node.props.children === '🍒');

    expect(emoji?.props.className).not.toContain('text-emoji-3xl');
    expect(emoji?.props.style).toEqual({ fontSize: 32, lineHeight: 44 });
    expect(emoji?.props.allowFontScaling).not.toBe(false);
  });

  it('keeps a divider between topic rows', async () => {
    await act(async () => {
      renderer = create(<TopicList />);
    });

    const row = renderer?.root.findByProps({ accessibilityLabel: 'Pinned topic' });
    const divider = row?.findAll(
      (node) =>
        typeof node.props.className === 'string' &&
        node.props.className.includes('border-b') &&
        node.props.className.includes('border-border'),
    );

    expect(divider?.length).toBeGreaterThan(0);
  });

  it('shows the latest message on one line instead of the model name', async () => {
    await act(async () => {
      renderer = create(<TopicList />);
    });

    const preview = renderer?.root
      .findAllByType(Text)
      .find((node) => node.props.children === 'The latest message preview');

    expect(preview?.props.numberOfLines).toBe(1);
    expect(
      renderer?.root.findAllByType(Text).some((node) => node.props.children === 'Mock Chat Model'),
    ).toBe(false);
  });

  it('hides the vertical scroll indicator', async () => {
    await act(async () => {
      renderer = create(<TopicList />);
    });

    expect(mockShowsVerticalScrollIndicator).toBe(false);
  });

  it('hides a topic immediately while its deletion is pending', async () => {
    mockPendingDeletionIds = new Set(['topic-1']);

    await act(async () => {
      renderer = create(<TopicList />);
    });

    expect(renderer?.root.findAllByProps({ accessibilityLabel: 'Pinned topic' })).toHaveLength(0);
  });
});
