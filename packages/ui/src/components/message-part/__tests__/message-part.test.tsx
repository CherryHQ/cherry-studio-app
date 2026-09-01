import type { ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { MessagePart } from '..';
import { formatMessagePartValue, hasMessagePartValue } from '../utils/message-part-value';

let mockBottomSheetProps: Record<string, unknown> = {};

jest.mock(
  '@cherrystudio/app-icons/icons/chevron-right',
  () => jest.requireActual('react-native').View,
);
jest.mock(
  '@cherrystudio/app-icons/icons/circle-alert',
  () => jest.requireActual('react-native').View,
);
jest.mock('@cherrystudio/app-icons/icons/globe', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return function MockGlobeIcon(props: object) {
    return <MockView {...props} testID="source-globe-icon" />;
  };
});
jest.mock('@cherrystudio/app-icons/icons/languages', () => jest.requireActual('react-native').View);
jest.mock('@cherrystudio/app-icons/icons/square-arrow-out-up-right', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return function MockExternalIcon(props: object) {
    return <MockView {...props} testID="source-external-icon" />;
  };
});
jest.mock('@cherrystudio/app-icons/icons/triangle-alert', () => {
  const { View: MockView } = jest.requireActual('react-native');
  return function MockWarningIcon(props: object) {
    return <MockView {...props} testID="unknown-warning-icon" />;
  };
});
jest.mock('@cherrystudio/app-icons/icons/wrench', () => jest.requireActual('react-native').View);

jest.mock('../../bottom-sheet', () => {
  const { View } = jest.requireActual('react-native');

  return {
    BottomSheet: ({ children, ...props }: { children: ReactNode }) => {
      mockBottomSheetProps = props;
      return <View {...props}>{children}</View>;
    },
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

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const useSharedValue = (initialValue: number) => {
    const ref = React.useRef({
      get: () => ref.current.value,
      set: (value: number) => {
        ref.current.value = value;
      },
      value: initialValue,
    });
    return ref.current;
  };

  return {
    __esModule: true,
    cancelAnimation: jest.fn(),
    default: { View },
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => false,
    useSharedValue,
    withRepeat: (value: number) => value,
    withTiming: (value: number) => value,
  };
});

describe('MessagePart', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockBottomSheetProps = {};
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('opens and closes tool details through the disclosure interface', () => {
    act(() => {
      renderer = create(
        <MessagePart.Tool
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
    const trigger = renderer!.root.findByProps({ testID: 'search-trigger' });
    act(() => trigger.props.onPress());

    const detail = renderer!.root.findByProps({ testID: 'search-detail' });
    expect(mockBottomSheetProps.sizes).toEqual(['compact', 'large']);
    expect(renderer!.root.findByProps({ children: 'Result details' })).toBeDefined();

    act(() => detail.props.onClose());
    expect(renderer!.root.findAllByProps({ testID: 'search-detail' })).toHaveLength(0);
  });

  it('opens running reasoning details without changing the caller content', () => {
    act(() => {
      renderer = create(
        <MessagePart.Reasoning
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
    expect(mockBottomSheetProps.size).toBe('large');
    expect(renderer!.root.findByProps({ children: 'Live reasoning' })).toBeDefined();
  });

  it('pulses the complete running tool trigger without removing its status text', () => {
    act(() => {
      renderer = create(
        <MessagePart.Tool
          state="running"
          statusText="Searching"
          testID="searching"
          title="Cherry Studio"
        >
          <Text>Waiting for results</Text>
        </MessagePart.Tool>,
      );
    });

    expect(renderer!.root.findByProps({ testID: 'searching-running-trigger' })).toBeDefined();
    expect(renderer!.root.findByProps({ children: 'Searching' })).toBeDefined();
  });

  it('renders the pending response as an active, accessible status row', () => {
    act(() => {
      renderer = create(
        <MessagePart.Pending accessibilityLabel="Waiting for response" testID="pending" />,
      );
    });

    expect(renderer!.root.findByProps({ testID: 'pending' })).toBeDefined();
    expect(
      renderer!.root.findByProps({
        accessibilityLabel: 'Waiting for response',
        active: true,
        size: 20,
      }),
    ).toBeDefined();
    expect(renderer!.root.findByProps({ children: '\u00A0' })).toBeDefined();
  });

  it('renders an unknown part as a compact warning without exposing its type', () => {
    act(() => {
      renderer = create(<MessagePart.Unknown label="Unknown Part" testID="unknown" />);
    });

    const warning = renderer!.root.findAllByProps({ testID: 'unknown' }).at(-1);
    expect(warning?.props.accessibilityLabel).toBe('Unknown Part');
    expect(warning?.props.className).toBe(
      'flex-row items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3',
    );
    expect(renderer!.root.findByProps({ testID: 'unknown-warning-icon' }).props.className).toBe(
      'size-4 shrink-0 text-warning',
    );
    expect(renderer!.root.findByProps({ children: 'Unknown Part' }).props.className).toBe(
      'text-base text-warning',
    );
  });

  it('keeps the source URL hidden while passing it to the caller', () => {
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

    expect(renderer!.root.findAllByProps({ children: 'cherry-ai.com' })).toHaveLength(0);
    expect(renderer!.root.findByProps({ children: 'Cherry Studio' })).toBeDefined();
    expect(renderer!.root.findByProps({ testID: 'source-globe-icon' }).props.className).toBe(
      'size-4 shrink-0 text-foreground',
    );
    expect(renderer!.root.findByProps({ testID: 'source-external-icon' }).props.className).toBe(
      'size-4 shrink-0 text-foreground',
    );
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
