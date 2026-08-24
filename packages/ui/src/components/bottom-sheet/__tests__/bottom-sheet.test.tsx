import type { ReactNode } from 'react';
import { StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BottomSheet } from '..';

let mockBottomSheetProps: Record<string, unknown> = {};

jest.mock('@cherrystudio/app-icons/icons/chevron-left', () => {
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
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 59 }),
}));

jest.mock('uniwind', () => ({
  useResolveClassNames: () => ({ backgroundColor: 'rgba(0, 0, 0, 0.4)' }),
}));

describe('BottomSheet', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockBottomSheetProps = {};
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
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

  test('keeps a non-dismissible sheet open', () => {
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
    act(() => (mockBottomSheetProps.onIndexChange as (index: number) => void)(0));
    act(() => (mockBottomSheetProps.onSettle as (index: number) => void)(0));

    expect(mockBottomSheetProps.index).toBe(1);
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

    expect(largeHeight).toBeGreaterThan(compactHeight);
  });

  test('uses a caller-provided fixed height', () => {
    act(() => {
      renderer = create(
        <BottomSheet height={420} onClose={jest.fn()} open testID="fixed-height" title="Approval">
          <Text>Content</Text>
        </BottomSheet>,
      );
    });

    const card = renderer?.root.findByProps({ testID: 'fixed-height' });
    expect(StyleSheet.flatten(card?.props.style)).toMatchObject({ height: 420 });
  });
});
