import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BottomSheet, useBottomSheet } from '..';

let mockBottomSheetProps: Record<string, unknown> = {};
let mockScreenCornerRadius = 0;

jest.mock('@swmansion/react-native-bottom-sheet', () => {
  const { View } = jest.requireActual('react-native');

  return {
    ModalBottomSheet: (props: { children: ReactNode }) => {
      mockBottomSheetProps = props;
      return <View testID="modal-bottom-sheet">{props.children}</View>;
    },
  };
});

jest.mock('../../search-field', () => ({
  SearchField: () => null,
}));

jest.mock('heroui-native/utils', () => ({
  cn: (...classes: (string | undefined)[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('expo-glass-effect', () => {
  const { View } = jest.requireActual('react-native');

  return {
    GlassView: View,
    isGlassEffectAPIAvailable: () => false,
    isLiquidGlassAvailable: () => false,
  };
});

jest.mock('@cherrystudio/app-icons', () => {
  const { View } = jest.requireActual('react-native');

  return { ChevronLeftIcon: View, XIcon: View };
});

jest.mock('uniwind', () => ({
  useResolveClassNames: () => ({ backgroundColor: 'rgba(0, 0, 0, 0.4)' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 59 }),
}));

jest.mock('react-native-worklets', () => ({
  scheduleOnRN: (fn: (...args: unknown[]) => void, ...args: unknown[]) => fn(...args),
}));

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    __esModule: true,
    default: { View },
    cancelAnimation: jest.fn(),
    Easing: { bezier: () => 'settle' },
    interpolate: (value: number, _input: number[], output: number[]) =>
      output[0] + (output[1] - output[0]) * value,
    useAnimatedStyle: (factory: () => object) => factory(),
    useReducedMotion: () => false,
    useSharedValue: (initial: number) => {
      const ref = React.useRef(null) as {
        current: { set: (next: number) => void; value: number } | null;
      };

      ref.current ??= {
        set(next: number) {
          this.value = next;
        },
        value: initial,
      };
      return ref.current;
    },
    withTiming: (value: number) => value,
  };
});

jest.mock('../use-screen-corner-radius', () => ({
  useScreenCornerRadius: () => mockScreenCornerRadius,
}));

function BodyCloseButton({ reason }: { reason?: string }) {
  const { requestClose } = useBottomSheet();

  return (
    <Pressable onPress={() => requestClose(reason)} testID="body-close">
      <Text>Close</Text>
    </Pressable>
  );
}

function GeometryProbe() {
  const { geometry } = useBottomSheet();

  return <Text testID="outer-inset">{geometry.outerInset}</Text>;
}

describe('BottomSheet', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockBottomSheetProps = {};
    mockScreenCornerRadius = 0;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  test('opens on mount and reports a dismiss after the close animation settles', () => {
    const onClose = jest.fn();

    act(() => {
      renderer = create(
        <BottomSheet defaultOpen>
          <BottomSheet.Content onClose={onClose} testID="test-sheet">
            <BottomSheet.Header>
              <BottomSheet.CloseButton accessibilityLabel="Close" />
              <BottomSheet.Title>Title</BottomSheet.Title>
              <BottomSheet.HeaderSpacer />
            </BottomSheet.Header>
            <Text>Body</Text>
          </BottomSheet.Content>
        </BottomSheet>,
      );
    });

    expect(mockBottomSheetProps.detents).toEqual([0, 'content']);
    expect(mockBottomSheetProps.index).toBe(1);
    expect(mockBottomSheetProps.scrimColor).toBe('rgba(0, 0, 0, 0.4)');
    expect(renderer?.root.findByProps({ testID: 'test-sheet-sheet-surface' })).toBeDefined();

    act(() => renderer?.root.findByProps({ testID: 'test-sheet-close' }).props.onPress());
    expect(mockBottomSheetProps.index).toBe(0);

    act(() => {
      (mockBottomSheetProps.onSettle as (index: number) => void)(0);
      (mockBottomSheetProps.onSettle as (index: number) => void)(0);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('dismiss');
  });

  test('distinguishes a controlled close from a user dismissal', () => {
    const onClose = jest.fn();

    act(() => {
      renderer = create(
        <BottomSheet open>
          <BottomSheet.Content onClose={onClose}>
            <Text>Body</Text>
          </BottomSheet.Content>
        </BottomSheet>,
      );
    });
    act(() => {
      renderer?.update(
        <BottomSheet open={false}>
          <BottomSheet.Content onClose={onClose}>
            <Text>Body</Text>
          </BottomSheet.Content>
        </BottomSheet>,
      );
    });
    act(() => (mockBottomSheetProps.onSettle as (index: number) => void)(0));

    expect(onClose).toHaveBeenCalledWith('controlled');
  });

  test('opens an uncontrolled sheet from its trigger', () => {
    const onOpenChange = jest.fn();

    act(() => {
      renderer = create(
        <BottomSheet onOpenChange={onOpenChange}>
          <BottomSheet.Trigger testID="sheet-trigger">
            <Text>Open</Text>
          </BottomSheet.Trigger>
          <BottomSheet.Content>
            <Text>Body</Text>
          </BottomSheet.Content>
        </BottomSheet>,
      );
    });
    expect(mockBottomSheetProps.index).toBe(0);

    const triggers = renderer?.root.findAllByProps({ testID: 'sheet-trigger' }) ?? [];
    const trigger = triggers.find((node) => typeof node.props.onPress === 'function');
    act(() => trigger?.props.onPress({}));

    expect(mockBottomSheetProps.index).toBe(1);
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  test('blocks close controls and gestures while close is disabled', () => {
    const onClose = jest.fn();

    act(() => {
      renderer = create(
        <BottomSheet defaultOpen>
          <BottomSheet.Content isCloseDisabled onClose={onClose} testID="test-sheet">
            <BottomSheet.Header>
              <BottomSheet.CloseButton accessibilityLabel="Close" />
              <BottomSheet.Title>Title</BottomSheet.Title>
              <BottomSheet.HeaderSpacer />
            </BottomSheet.Header>
            <Text>Body</Text>
          </BottomSheet.Content>
        </BottomSheet>,
      );
    });

    expect(renderer?.root.findByProps({ testID: 'test-sheet-close' }).props.disabled).toBe(true);
    act(() => (mockBottomSheetProps.onIndexChange as (index: number) => void)(0));
    expect(mockBottomSheetProps.index).toBe(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  test('carries a body action reason through the close animation', () => {
    const onClose = jest.fn();

    act(() => {
      renderer = create(
        <BottomSheet defaultOpen>
          <BottomSheet.Content onClose={onClose}>
            <BodyCloseButton reason="confirm" />
          </BottomSheet.Content>
        </BottomSheet>,
      );
    });
    act(() => renderer?.root.findByProps({ testID: 'body-close' }).props.onPress());
    act(() => (mockBottomSheetProps.onSettle as (index: number) => void)(0));

    expect(onClose).toHaveBeenCalledWith('confirm');
  });

  test('shows back on nested pages without changing the open sheet index', () => {
    const onBack = jest.fn();

    act(() => {
      renderer = create(
        <BottomSheet defaultOpen>
          <BottomSheet.Content onClose={jest.fn()} testID="test-sheet">
            <BottomSheet.Header>
              <BottomSheet.BackButton accessibilityLabel="Back" onPress={onBack} />
              <BottomSheet.Title>Nested</BottomSheet.Title>
              <BottomSheet.CloseButton accessibilityLabel="Close" />
            </BottomSheet.Header>
            <Text>Body</Text>
          </BottomSheet.Content>
        </BottomSheet>,
      );
    });
    act(() => renderer?.root.findByProps({ testID: 'test-sheet-back' }).props.onPress());

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockBottomSheetProps.index).toBe(1);
  });

  test.each([
    { expected: 51, screenCornerRadius: 55 },
    { expected: 58, screenCornerRadius: 62 },
    { expected: 28, screenCornerRadius: 30 },
    { expected: 28, screenCornerRadius: 0 },
  ])(
    'keeps the card concentric at a $screenCornerRadius point display radius',
    ({ expected, screenCornerRadius }) => {
      mockScreenCornerRadius = screenCornerRadius;

      act(() => {
        renderer = create(
          <BottomSheet defaultOpen>
            <BottomSheet.Content onClose={jest.fn()} testID="test-sheet">
              <GeometryProbe />
            </BottomSheet.Content>
          </BottomSheet>,
        );
      });

      const sheetStyle = StyleSheet.flatten(
        renderer?.root.findByProps({ testID: 'test-sheet-sheet' }).props.style,
      );
      expect(sheetStyle).toMatchObject({
        borderBottomLeftRadius: expected,
        borderBottomRightRadius: expected,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
      });
      expect(renderer?.root.findByProps({ testID: 'outer-inset' }).props.children).toBe(4);
    },
  );
});
