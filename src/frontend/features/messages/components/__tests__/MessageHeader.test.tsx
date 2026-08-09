import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MessageHeader } from '../MessageHeader';

let mockScopeTabsProps:
  | { onScopeChange: (scope: 'conversations' | 'drawings') => void; scope: string }
  | undefined;

jest.mock('@cherrystudio/ui/components', () => {
  const React = jest.requireActual('react');
  const component =
    (type: string) =>
    ({ children, ...props }: { children?: ReactNode }) =>
      React.createElement(type, props, children);

  return {
    DropdownMenu: {
      Content: component('DropdownMenu.Content'),
      Item: component('DropdownMenu.Item'),
      ItemTitle: component('DropdownMenu.ItemTitle'),
      Root: component('DropdownMenu.Root'),
      Trigger: component('DropdownMenu.Trigger'),
    },
  };
});

jest.mock('lucide-uniwind/png', () => ({
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

jest.mock('../MessageScopeTabs', () => ({
  MessageScopeTabs: (props: typeof mockScopeTabsProps) => {
    const React = jest.requireActual('react');
    const { View: MockView } = jest.requireActual('react-native');
    mockScopeTabsProps = props;
    return React.createElement(MockView, { testID: 'header-scope-tabs' });
  },
}));

describe('MessageHeader', () => {
  let renderer: ReactTestRenderer | undefined;
  const onScopeChange = jest.fn();
  const defaultProps = {
    isEditDisabled: false,
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
      renderer = create(<MessageHeader {...defaultProps} />);
    });

    if (!renderer) {
      throw new Error('MessageHeader test renderer was not created.');
    }

    expect(renderer.root.findByProps({ testID: 'header-scope-tabs' })).toBeTruthy();
    expect(renderer.root.findByProps({ testID: 'topic-create-menu' })).toBeTruthy();
    expect(mockScopeTabsProps?.scope).toBe('conversations');

    mockScopeTabsProps?.onScopeChange('drawings');
    expect(onScopeChange).toHaveBeenCalledWith('drawings');
  });

  it('replaces the tabs with the Messages title while editing', async () => {
    await act(async () => {
      renderer = create(<MessageHeader {...defaultProps} isEditing />);
    });

    if (!renderer) {
      throw new Error('MessageHeader test renderer was not created.');
    }

    expect(renderer.root.findAllByProps({ testID: 'header-scope-tabs' })).toHaveLength(0);
    expect(renderer.root.findAllByProps({ testID: 'topic-create-menu' })).toHaveLength(0);
    expect(
      renderer.root.findAllByType(Text).some((item) => item.props.children === 'Messages'),
    ).toBe(true);
  });

  it('shows the drawings title while editing in the drawings scope', async () => {
    await act(async () => {
      renderer = create(<MessageHeader {...defaultProps} isEditing scope="drawings" />);
    });

    if (!renderer) {
      throw new Error('MessageHeader test renderer was not created.');
    }

    expect(
      renderer.root.findAllByType(Text).some((item) => item.props.children === 'Your drawings'),
    ).toBe(true);
  });

  it('disables editing while a deletion is pending', async () => {
    await act(async () => {
      renderer = create(<MessageHeader {...defaultProps} isEditDisabled />);
    });

    if (!renderer) {
      throw new Error('MessageHeader test renderer was not created.');
    }

    const editButton = renderer.root.find(
      (node) => node.props.accessibilityState?.disabled === true,
    );
    expect(editButton.props.disabled).toBe(true);
    expect(editButton.props.className).toContain('disabled:opacity-35');
  });
});
