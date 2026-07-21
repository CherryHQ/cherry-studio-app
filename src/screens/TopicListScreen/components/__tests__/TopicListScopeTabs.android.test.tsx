import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TopicListScopeTabs } from '../TopicListScopeTabs.android';

jest.mock('heroui-native', () => {
  const React = jest.requireActual('react');
  const {
    Pressable: MockPressable,
    Text: MockText,
    View: MockView,
  } = jest.requireActual('react-native');
  const TabsContext = React.createContext({
    onValueChange: (_value: string) => undefined,
    value: '',
  });
  const TabsRoot = ({
    children,
    onValueChange,
    value,
    ...props
  }: {
    children?: ReactNode;
    onValueChange: (value: string) => void;
    value: string;
  }) => (
    <TabsContext.Provider value={{ onValueChange, value }}>
      <MockView {...props}>{children}</MockView>
    </TabsContext.Provider>
  );
  const TabsTrigger = ({ children, testID, value, ...props }: Record<string, unknown>) => {
    const context = React.use(TabsContext);

    return (
      <MockPressable
        {...props}
        accessibilityRole="tab"
        accessibilityState={{ selected: context.value === value }}
        testID={testID}
        onPress={() => context.onValueChange(value as string)}
      >
        {children as ReactNode}
      </MockPressable>
    );
  };
  const Tabs = Object.assign(TabsRoot, {
    Indicator: () => null,
    Label: MockText,
    List: MockView,
    Trigger: TabsTrigger,
  });

  return { Tabs };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'topic.tabs.chat': 'Chat',
        'topic.tabs.paint': 'Paint',
      })[key] ?? key,
  }),
}));

describe('TopicListScopeTabs.android', () => {
  let renderer: ReactTestRenderer | undefined;
  const onScopeChange = jest.fn();

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('renders controlled Chat and Paint tabs and selects a new scope', async () => {
    await act(async () => {
      renderer = create(<TopicListScopeTabs scope="conversations" onScopeChange={onScopeChange} />);
    });

    if (!renderer) {
      throw new Error('TopicListScopeTabs test renderer was not created.');
    }

    const chat = renderer.root.findByProps({ testID: 'topic-list-tab-conversations' });
    const paint = renderer.root.findByProps({ testID: 'topic-list-tab-drawings' });
    const paintPressable = renderer.root
      .findAllByProps({ testID: 'topic-list-tab-drawings' })
      .find((item) => typeof item.props.onPress === 'function');

    if (!paintPressable) {
      throw new Error('Paint tab pressable was not found.');
    }

    expect(renderer.root.findAllByType(Text).map((item) => item.props.children)).toEqual([
      'Chat',
      'Paint',
    ]);
    expect(chat.props.accessibilityRole).toBe('tab');
    expect(chat.props.accessibilityState).toEqual({ selected: true });
    expect(paint.props.accessibilityState).toEqual({ selected: false });

    await act(async () => paintPressable.props.onPress());
    expect(onScopeChange).toHaveBeenCalledWith('drawings');
  });

  it('reflects the controlled selected scope', async () => {
    await act(async () => {
      renderer = create(<TopicListScopeTabs scope="drawings" onScopeChange={onScopeChange} />);
    });

    if (!renderer) {
      throw new Error('TopicListScopeTabs test renderer was not created.');
    }

    const chat = renderer.root.findByProps({ testID: 'topic-list-tab-conversations' });
    const paint = renderer.root.findByProps({ testID: 'topic-list-tab-drawings' });

    expect(chat.props.accessibilityState).toEqual({ selected: false });
    expect(paint.props.accessibilityState).toEqual({ selected: true });
  });
});
