import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MessageScopeTabs } from '../MessageScopeTabs.ios';

jest.mock('@cherrystudio/ui/components', () => {
  const { Pressable, Text: MockText, View } = jest.requireActual('react-native');

  return {
    Tabs: ({ items, onValueChange, style, value }: MockTabsProps) => (
      <View testID="cherry-tabs" style={style} value={value}>
        {items.map((item) => (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: item.value === value }}
            key={item.value}
            onPress={() => onValueChange(item.value)}
            testID={item.testID}
          >
            <MockText>{item.label}</MockText>
          </Pressable>
        ))}
      </View>
    ),
  };
});

type MockTabsProps = {
  items: readonly { label: string; testID?: string; value: string }[];
  onValueChange: (value: string) => void;
  style?: object;
  value: string;
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        'topic.tabs.chat': 'Chat',
        'topic.tabs.paint': 'Paint',
      })[key] ?? key,
  }),
}));

describe('MessageScopeTabs.ios', () => {
  let renderer: ReactTestRenderer | undefined;
  const onScopeChange = jest.fn();

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.clearAllMocks();
  });

  it('configures Cherry UI tabs and selects a new scope', () => {
    act(() => {
      renderer = create(<MessageScopeTabs scope="conversations" onScopeChange={onScopeChange} />);
    });

    if (!renderer) {
      throw new Error('MessageScopeTabs test renderer was not created.');
    }

    const root = renderer.root.findByProps({ testID: 'cherry-tabs' });
    const chat = renderer.root.findByProps({ testID: 'topic-list-tab-conversations' });
    const paint = renderer.root.findByProps({ testID: 'topic-list-tab-drawings' });

    expect(root.props).toMatchObject({ style: { width: 144 }, value: 'conversations' });
    expect(renderer.root.findAllByType(Text).map((item) => item.props.children)).toEqual([
      'Chat',
      'Paint',
    ]);
    expect(chat.props.accessibilityState).toEqual({ selected: true });
    expect(paint.props.accessibilityState).toEqual({ selected: false });

    act(() => paint.props.onPress());
    expect(onScopeChange).toHaveBeenCalledWith('drawings');
  });

  it('reflects the controlled selected scope', () => {
    act(() => {
      renderer = create(<MessageScopeTabs scope="drawings" onScopeChange={onScopeChange} />);
    });

    if (!renderer) {
      throw new Error('MessageScopeTabs test renderer was not created.');
    }

    expect(
      renderer.root.findByProps({ testID: 'topic-list-tab-conversations' }).props
        .accessibilityState,
    ).toEqual({ selected: false });
    expect(
      renderer.root.findByProps({ testID: 'topic-list-tab-drawings' }).props.accessibilityState,
    ).toEqual({ selected: true });
  });
});
