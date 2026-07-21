import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { TopicListScopeTabs } from '../TopicListScopeTabs.ios';

jest.mock('expo-glass-effect', () => ({
  GlassView: ({ children, ...props }: { children?: ReactNode }) => {
    const React = jest.requireActual('react');
    const { View: MockView } = jest.requireActual('react-native');

    return React.createElement(MockView, { ...props, testID: 'topic-list-tabs-glass' }, children);
  },
}));

jest.mock('react-native-reanimated', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View: MockView },
    useAnimatedStyle: (factory: () => object) => factory(),
    useSharedValue: (value: number) => ({ value }),
    withTiming: (value: number) => value,
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { resolvedLanguage: 'en-US' },
    t: (key: string) =>
      ({
        'topic.tabs.chat': 'Chat',
        'topic.tabs.paint': 'Paint',
      })[key] ?? key,
  }),
}));

describe('TopicListScopeTabs.ios', () => {
  let renderer: ReactTestRenderer | undefined;
  const onScopeChange = jest.fn();

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('renders a compact controlled tab list and selects a new scope', async () => {
    await act(async () => {
      renderer = create(<TopicListScopeTabs scope="conversations" onScopeChange={onScopeChange} />);
    });

    if (!renderer) {
      throw new Error('TopicListScopeTabs test renderer was not created.');
    }

    const glass = renderer.root.findByProps({ testID: 'topic-list-tabs-glass' });
    const chat = renderer.root.findByProps({ testID: 'topic-list-tab-conversations' });
    const paint = renderer.root.findByProps({ testID: 'topic-list-tab-drawings' });

    expect(glass.props.style).toMatchObject({ borderRadius: 17, height: 34, width: 144 });
    expect(renderer.root.findAllByType(Text).map((item) => item.props.children)).toEqual([
      'Chat',
      'Paint',
    ]);
    expect(chat.props.accessibilityRole).toBe('tab');
    expect(chat.props.accessibilityState).toEqual({ selected: true });
    expect(paint.props.accessibilityState).toEqual({ selected: false });

    await act(async () => paint.props.onPress());
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
