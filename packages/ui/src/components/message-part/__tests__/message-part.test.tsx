import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MessagePart } from '..';
import { formatMessagePartValue, hasMessagePartValue } from '../utils/message-part-value';

jest.mock('@cherrystudio/app-icons', () => {
  const { View } = jest.requireActual('react-native');

  return {
    ChevronRightIcon: View,
    CircleAlertIcon: View,
    GlobeIcon: View,
    LanguagesIcon: View,
    SquareArrowOutUpRightIcon: View,
    WrenchIcon: View,
  };
});

jest.mock('../../bottom-sheet', () => {
  const { Text: MockText, View } = jest.requireActual('react-native');
  const Root = ({ children }: { children: ReactNode }) => <View>{children}</View>;

  return {
    BottomSheet: Object.assign(Root, {
      CloseButton: (props: object) => <View {...props} />,
      Content: ({ children, ...props }: { children: ReactNode }) => (
        <View {...props}>{children}</View>
      ),
      Header: View,
      HeaderSpacer: View,
      ScrollView: ({ children, ...props }: { children: ReactNode }) => (
        <View {...props}>{children}</View>
      ),
      Title: ({ children }: { children: ReactNode }) => <MockText>{children}</MockText>,
    }),
  };
});

jest.mock('../../image', () => {
  const { View } = jest.requireActual('react-native');

  return { Image: View };
});

jest.mock('../../loading', () => {
  const { View } = jest.requireActual('react-native');

  return { DotMatrixSquare20: View, PrismSweep: View };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 59 }),
}));

describe('MessagePart', () => {
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('opens and closes tool details through the disclosure interface', () => {
    act(() => {
      renderer = create(
        <MessagePart.Tool
          closeAccessibilityLabel="Close"
          state="complete"
          statusText="3 results"
          testID="search"
          title="Web search"
        >
          <Text>Result details</Text>
        </MessagePart.Tool>,
      );
    });

    expect(renderer!.root.findAllByProps({ testID: 'search-detail' })).toHaveLength(0);
    act(() => renderer!.root.findByProps({ testID: 'search-trigger' }).props.onPress());

    const detail = renderer!.root.findByProps({ testID: 'search-detail' });
    expect(renderer!.root.findByProps({ children: 'Result details' })).toBeDefined();

    act(() => detail.props.onClose());
    expect(renderer!.root.findAllByProps({ testID: 'search-detail' })).toHaveLength(0);
  });

  it('opens running reasoning details without changing the caller content', () => {
    act(() => {
      renderer = create(
        <MessagePart.Reasoning
          closeAccessibilityLabel="Close"
          detailTitle="Reasoning"
          state="running"
          statusText="Thinking for 1.2s"
          testID="thinking"
        >
          <Text>Live reasoning</Text>
        </MessagePart.Reasoning>,
      );
    });

    expect(renderer!.root.findByProps({ active: true })).toBeDefined();
    expect(renderer!.root.findAllByProps({ testID: 'thinking-detail' })).toHaveLength(0);
    act(() => renderer!.root.findByProps({ testID: 'thinking-trigger' }).props.onPress());
    expect(renderer!.root.findByProps({ children: 'Live reasoning' })).toBeDefined();
  });

  it('passes the complete source URL to the caller', () => {
    const onPress = jest.fn();

    act(() => {
      renderer = create(
        <MessagePart.Source
          label="Cherry Studio"
          onPress={onPress}
          url="https://www.cherry-ai.com/docs"
        />,
      );
    });

    expect(renderer!.root.findByProps({ children: 'cherry-ai.com' })).toBeDefined();
    act(() => renderer!.root.findByProps({ accessibilityRole: 'link' }).props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledWith('https://www.cherry-ai.com/docs');
  });

  it('keeps status rows accessible and invokes their action once', () => {
    const onPress = jest.fn();

    act(() => {
      renderer = create(
        <MessagePart.Status accessibilityLabel="Thinking" onPress={onPress}>
          <Text>Thinking</Text>
        </MessagePart.Status>,
      );
    });

    const status = renderer!.root.findByProps({ accessibilityRole: 'button' });
    expect(status.props.accessibilityLabel).toBe('Thinking');
    act(() => status.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('message part values', () => {
  it('formats structured values and reports empty values', () => {
    expect(formatMessagePartValue({ answer: 42 })).toBe('{\n  "answer": 42\n}');
    expect(formatMessagePartValue('abcdef', 3)).toBe('abc\n... truncated (6 chars)');
    expect(hasMessagePartValue(undefined)).toBe(false);
    expect(hasMessagePartValue({ answer: 42 })).toBe(true);
  });
});
