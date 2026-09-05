import type { ReactNode } from 'react';
import { BackHandler, Dimensions, StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BottomSheet } from '..';

let mockBottomSheetProps: Record<string, unknown> = {};
let mockHardwareBackPress: (() => boolean | null | undefined) | undefined;
let mockScreenCornerRadius = 0;

jest.mock('@cherrystudio/app-icons/icons/arrow-left', () => {
  const { View } = jest.requireActual('react-native');
  return View;
});

jest.mock('@swmansion/react-native-bottom-sheet', () => {
  const { View } = jest.requireActual('react-native');

  return {
    ModalBottomSheet: (props: { children: ReactNode }) => {
      mockBottomSheetProps = props;
      return <View>{props.children}</View>;
    },
    programmatic: (value: number) => ({ programmatic: true, value }),
  };
});

jest.mock('expo-screen-corner-radius', () => ({
  getCornerRadiusSync: () => mockScreenCornerRadius,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 59 }),
}));

jest.mock('uniwind', () => ({
  useResolveClassNames: () => ({ backgroundColor: 'rgba(0, 0, 0, 0.4)' }),
}));

describe('BottomSheet', () => {
  let backHandlerSpy: jest.SpyInstance;
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockBottomSheetProps = {};
    mockHardwareBackPress = undefined;
    mockScreenCornerRadius = 0;
    backHandlerSpy = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        mockHardwareBackPress = () => handler({ type: 'hardwareBackPress', timeStamp: Date.now() });
        return { remove: jest.fn() };
      });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    backHandlerSpy.mockRestore();
  });

  test('reports one user dismissal after the close motion settles', () => {
    const onClose = jest.fn();

    act(() => {
      renderer = create(
        <BottomSheet onClose={onClose} open size="medium" title="Models">
          <Text>Content</Text>
        </BottomSheet>,
      );
    });

    expect(mockBottomSheetProps.index).toBe(1);
    expect(mockBottomSheetProps.scrimColor).toBe('rgba(0, 0, 0, 0.4)');

    act(() => (mockBottomSheetProps.onIndexChange as (index: number) => void)(0));
    act(() => {
      (mockBottomSheetProps.onSettle as (index: number) => void)(0);
      (mockBottomSheetProps.onSettle as (index: number) => void)(0);
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  test('does not report a controlled close as a user dismissal', () => {
    const onClose = jest.fn();

    act(() => {
      renderer = create(
        <BottomSheet onClose={onClose} open size="medium" title="Models">
          <Text>Content</Text>
        </BottomSheet>,
      );
    });
    act(() => {
      renderer?.update(
        <BottomSheet onClose={onClose} open={false} size="medium" title="Models">
          <Text>Content</Text>
        </BottomSheet>,
      );
    });
    act(() => (mockBottomSheetProps.onSettle as (index: number) => void)(0));

    expect(mockBottomSheetProps.index).toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  test('keeps the closed detent of a non-dismissible sheet programmatic-only', () => {
    const onClose = jest.fn();

    act(() => {
      renderer = create(
        <BottomSheet
          dismissible={false}
          onClose={onClose}
          open
          size="medium"
          title="Approval required"
        >
          <Text>Content</Text>
        </BottomSheet>,
      );
    });
    expect((mockBottomSheetProps.detents as unknown[])[0]).toEqual({
      programmatic: true,
      value: 0,
    });

    act(() => {
      expect(mockHardwareBackPress?.()).toBe(true);
    });

    expect(mockBottomSheetProps.index).toBe(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  test('allows a controlled close for a non-dismissible sheet', () => {
    const onClose = jest.fn();

    act(() => {
      renderer = create(
        <BottomSheet
          dismissible={false}
          onClose={onClose}
          open
          size="medium"
          title="Approval required"
        >
          <Text>Content</Text>
        </BottomSheet>,
      );
    });
    act(() => {
      renderer?.update(
        <BottomSheet
          dismissible={false}
          onClose={onClose}
          open={false}
          size="medium"
          title="Approval required"
        >
          <Text>Content</Text>
        </BottomSheet>,
      );
    });

    expect(mockBottomSheetProps.index).toBe(0);
    expect(onClose).not.toHaveBeenCalled();
  });

  test('renders the optional second-level back action', () => {
    const onBack = jest.fn();

    act(() => {
      renderer = create(
        <BottomSheet
          backAction={{ accessibilityLabel: 'Back', onPress: onBack }}
          onClose={jest.fn()}
          open
          size="medium"
          title="Size"
        >
          <Text>Content</Text>
        </BottomSheet>,
      );
    });

    act(() => renderer?.root.findByProps({ accessibilityLabel: 'Back' }).props.onPress());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test('keeps the optional footer outside the flexible body with its own safe-area inset', () => {
    act(() => {
      renderer = create(
        <BottomSheet
          footer={<Text testID="footer-action">Create</Text>}
          onClose={jest.fn()}
          open
          size="medium"
          title="Agents"
        >
          <Text testID="sheet-content">Content</Text>
        </BottomSheet>,
      );
    });

    const footer = renderer?.root.find(
      (node) =>
        typeof node.props.className === 'string' &&
        node.props.className.includes('border-t border-border') &&
        node.findAllByProps({ testID: 'footer-action' }).length > 0,
    );

    expect(footer?.props.className).toContain('px-4');
    expect(StyleSheet.flatten(footer?.props.style)).toEqual({ paddingBottom: 34 });
    expect(footer?.findAllByProps({ testID: 'sheet-content' })).toHaveLength(0);
  });

  test('routes Android hardware back through the optional second-level action', () => {
    const onBack = jest.fn();

    act(() => {
      renderer = create(
        <BottomSheet
          backAction={{ accessibilityLabel: 'Back', onPress: onBack }}
          onClose={jest.fn()}
          open
          size="medium"
          title="Size"
        >
          <Text>Content</Text>
        </BottomSheet>,
      );
    });

    act(() => {
      expect(mockHardwareBackPress?.()).toBe(true);
    });

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockBottomSheetProps.index).toBe(1);
  });

  test('updates the native height when the semantic size changes', () => {
    const onClose = jest.fn();

    act(() => {
      renderer = create(
        <BottomSheet onClose={onClose} open size="compact" title="Options">
          <Text>Content</Text>
        </BottomSheet>,
      );
    });
    const compactHeight = (mockBottomSheetProps.detents as number[])[1];

    act(() => {
      renderer?.update(
        <BottomSheet onClose={onClose} open size="large" title="Options">
          <Text>Content</Text>
        </BottomSheet>,
      );
    });
    const largeHeight = (mockBottomSheetProps.detents as number[])[1];

    act(() => {
      renderer?.update(
        <BottomSheet onClose={onClose} open size="full" title="Options">
          <Text>Content</Text>
        </BottomSheet>,
      );
    });
    const fullHeight = (mockBottomSheetProps.detents as number[])[1];

    expect(largeHeight).toBeGreaterThan(compactHeight);
    expect(fullHeight).toBeGreaterThan(largeHeight);
  });

  test('opens at the smallest height and lets the user expand through semantic sizes', () => {
    act(() => {
      renderer = create(
        <BottomSheet onClose={jest.fn()} open sizes={['compact', 'large']} title="Tool details">
          <Text>Content</Text>
        </BottomSheet>,
      );
    });

    const detents = mockBottomSheetProps.detents as number[];
    expect(detents).toHaveLength(3);
    expect(detents[0]).toBe(0);
    expect(detents[2]).toBeGreaterThan(detents[1]);
    expect(mockBottomSheetProps.index).toBe(1);

    act(() => (mockBottomSheetProps.onIndexChange as (index: number) => void)(2));
    expect(mockBottomSheetProps.index).toBe(2);
  });

  test('uses a caller-provided fixed height on an inset rounded card', () => {
    act(() => {
      renderer = create(
        <BottomSheet height={420} onClose={jest.fn()} open testID="fixed-height" title="Approval">
          <Text>Content</Text>
        </BottomSheet>,
      );
    });

    const card = renderer?.root
      .findAllByProps({ testID: 'fixed-height' })
      .find((node) => typeof node.type === 'string');
    expect(mockBottomSheetProps.detents).toEqual([0, 424]);
    expect(StyleSheet.flatten(card?.props.style)).toMatchObject({
      borderBottomLeftRadius: 28,
      borderBottomRightRadius: 28,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      height: 420,
      width: Dimensions.get('window').width - 8,
    });
  });

  test('keeps the bottom corners concentric with a rounded display', () => {
    mockScreenCornerRadius = 62;

    act(() => {
      renderer = create(
        <BottomSheet onClose={jest.fn()} open size="medium" testID="rounded" title="Options">
          <Text>Content</Text>
        </BottomSheet>,
      );
    });

    const card = renderer?.root
      .findAllByProps({ testID: 'rounded' })
      .find((node) => typeof node.type === 'string');
    expect(StyleSheet.flatten(card?.props.style)).toMatchObject({
      borderBottomLeftRadius: 58,
      borderBottomRightRadius: 58,
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
    });
  });
});
