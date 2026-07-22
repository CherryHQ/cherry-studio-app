import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TopicListHeader } from '../TopicListHeader';

let mockScopeTabsProps:
  | { onScopeChange: (scope: 'conversations' | 'drawings') => void; scope: string }
  | undefined;

jest.mock('heroui-native/menu', () => {
  const { Text: MockText, View: MockView } = jest.requireActual('react-native');
  const Passthrough = ({ children }: { children?: ReactNode }) => children;
  const Menu = Object.assign(Passthrough, {
    Content: Passthrough,
    Item: ({ children, ...props }: { children?: ReactNode }) => (
      <MockView {...props}>{children}</MockView>
    ),
    ItemTitle: MockText,
    Overlay: () => null,
    Portal: Passthrough,
    Trigger: Passthrough,
  });

  return { Menu };
});

jest.mock('lucide-uniwind/png', () => ({
  ImageIcon: () => null,
  MessageCircleIcon: () => null,
  SquarePenIcon: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'common.done': 'Done',
        'common.edit': 'Edit',
        'navigation.messages': 'Messages',
        'navigation.new': 'Create new',
        'navigation.newChat': 'New chat',
        'navigation.newPainting': 'New drawing',
        'painting.history.title': 'Your drawings',
      })[key] ?? key,
  }),
}));

jest.mock('../TopicListScopeTabs', () => ({
  TopicListScopeTabs: (props: typeof mockScopeTabsProps) => {
    const React = jest.requireActual('react');
    const { View: MockView } = jest.requireActual('react-native');
    mockScopeTabsProps = props;
    return React.createElement(MockView, { testID: 'header-scope-tabs' });
  },
}));

describe('TopicListHeader', () => {
  let renderer: ReactTestRenderer | undefined;
  const onScopeChange = jest.fn();
  const defaultProps = {
    isEditing: false,
    onEditPress: jest.fn(),
    onNewPaintingPress: jest.fn(),
    onNewTopicPress: jest.fn(),
    onScopeChange,
    scope: 'conversations' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockScopeTabsProps = undefined;
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('centers the controlled scope tabs in the normal header', async () => {
    await act(async () => {
      renderer = create(<TopicListHeader {...defaultProps} />);
    });

    if (!renderer) {
      throw new Error('TopicListHeader test renderer was not created.');
    }

    expect(renderer.root.findByProps({ testID: 'header-scope-tabs' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'topic-create-menu' })).toBeTruthy();
    expect(mockScopeTabsProps?.scope).toBe('conversations');

    mockScopeTabsProps?.onScopeChange('drawings');
    expect(onScopeChange).toHaveBeenCalledWith('drawings');
  });

  it('replaces the tabs with the Messages title while editing', async () => {
    await act(async () => {
      renderer = create(<TopicListHeader {...defaultProps} isEditing />);
    });

    if (!renderer) {
      throw new Error('TopicListHeader test renderer was not created.');
    }

    expect(renderer.root.findAllByProps({ testID: 'header-scope-tabs' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'topic-create-menu' })).toHaveLength(0);
    expect(
      renderer.root.findAllByType(Text).some((item) => item.props.children === 'Messages'),
    ).toBe(true);
  });

  it('shows the drawings title while editing in the drawings scope', async () => {
    await act(async () => {
      renderer = create(<TopicListHeader {...defaultProps} isEditing scope="drawings" />);
    });

    if (!renderer) {
      throw new Error('TopicListHeader test renderer was not created.');
    }

    expect(
      renderer.root.findAllByType(Text).some((item) => item.props.children === 'Your drawings'),
    ).toBe(true);
  });
});
