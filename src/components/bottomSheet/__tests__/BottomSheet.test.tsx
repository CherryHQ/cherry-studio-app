import type { ReactNode } from 'react';
import { Pressable, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BottomSheet, useBottomSheet } from '..';

let mockBottomSheetProps: Record<string, unknown> = {};

jest.mock('@swmansion/react-native-bottom-sheet', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return {
    ModalBottomSheet: (props: { children: ReactNode }) => {
      mockBottomSheetProps = props;
      return <MockView testID="modal-bottom-sheet">{props.children}</MockView>;
    },
  };
});

jest.mock('expo-glass-effect', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { GlassView: MockView };
});

jest.mock('lucide-uniwind/png', () => {
  const { View: MockView } = jest.requireActual('react-native');

  return { XIcon: MockView };
});

jest.mock('@/config/constants', () => ({
  bottomSheet: { cornerRadius: 28, headerHeight: 60, headerSideWidth: 44, outerInset: 4 },
  isLiquidGlassAvailable: false,
  sheetScrimColor: '#00000066',
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 34, left: 0, right: 0, top: 59 }),
}));

let mockScreenCornerRadius = 0;

jest.mock('@/modules/screenCornerRadius', () => ({
  useScreenCornerRadius: () => mockScreenCornerRadius,
}));

function BodyCloseButton({ reason }: { reason?: string }) {
  const { requestClose } = useBottomSheet();

  return (
    <Pressable onPress={() => requestClose(reason)} testID="body-close">
      <Text>close</Text>
    </Pressable>
  );
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

  test('opens on mount and dismisses once via the close button', () => {
    const onClose = jest.fn();
    act(() => {
      renderer = create(
        <BottomSheet onClose={onClose} testID="test-sheet">
          <Text>body</Text>
        </BottomSheet>,
      );
    });

    expect(mockBottomSheetProps.detents).toEqual([0, 'content']);
    expect(mockBottomSheetProps.index).toBe(1);

    act(() => renderer?.root.findByProps({ testID: 'test-sheet-close' }).props.onPress());
    expect(mockBottomSheetProps.index).toBe(0);

    // The dismiss only fires once the closing animation settles, and only once.
    act(() => {
      (mockBottomSheetProps.onSettle as (index: number) => void)(0);
      (mockBottomSheetProps.onSettle as (index: number) => void)(0);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('dismiss');
  });

  test('mirrors the controlled isOpen prop into the detent index', () => {
    const onClose = jest.fn();
    act(() => {
      renderer = create(
        <BottomSheet isOpen={false} onClose={onClose}>
          <Text>body</Text>
        </BottomSheet>,
      );
    });
    expect(mockBottomSheetProps.index).toBe(0);

    act(() => {
      renderer?.update(
        <BottomSheet isOpen onClose={onClose}>
          <Text>body</Text>
        </BottomSheet>,
      );
    });
    expect(mockBottomSheetProps.index).toBe(1);

    act(() => {
      renderer?.update(
        <BottomSheet isOpen={false} onClose={onClose}>
          <Text>body</Text>
        </BottomSheet>,
      );
    });
    expect(mockBottomSheetProps.index).toBe(0);

    // Owners that remember a dismissal need this apart from `'dismiss'`: a
    // sheet the code closed is not one the user waved away.
    act(() => (mockBottomSheetProps.onSettle as (index: number) => void)(0));
    expect(onClose).toHaveBeenCalledWith('controlled');
  });

  test('blocks gesture / scrim dismissal and disables the close button while isCloseDisabled', () => {
    const onClose = jest.fn();
    act(() => {
      renderer = create(
        <BottomSheet isCloseDisabled onClose={onClose} testID="test-sheet">
          <Text>body</Text>
        </BottomSheet>,
      );
    });
    expect(mockBottomSheetProps.index).toBe(1);
    expect(renderer?.root.findByProps({ testID: 'test-sheet-close' }).props.disabled).toBe(true);

    // A user-driven collapse snaps back open instead of dismissing.
    act(() => (mockBottomSheetProps.onIndexChange as (index: number) => void)(0));
    expect(mockBottomSheetProps.index).toBe(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  test('carries a custom close reason from a body action to onClose', () => {
    const onClose = jest.fn();
    act(() => {
      renderer = create(
        <BottomSheet onClose={onClose}>
          <BodyCloseButton reason="use" />
        </BottomSheet>,
      );
    });

    act(() => renderer?.root.findByProps({ testID: 'body-close' }).props.onPress());
    expect(mockBottomSheetProps.index).toBe(0);
    expect(onClose).not.toHaveBeenCalled();

    act(() => (mockBottomSheetProps.onSettle as (index: number) => void)(0));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith('use');
  });

  // The card is inset 4pt from the left, right and bottom screen edges, so it is
  // concentric with the display at `screenCornerRadius - 4`.
  test.each([
    { expected: 51, label: 'a 55pt display (iPhone 15 / 16)', screenCornerRadius: 55 },
    { expected: 58, label: 'a 62pt display (iPhone 16 Pro)', screenCornerRadius: 62 },
    {
      expected: 28,
      label: 'a squarer display, clamped to the resting radius',
      screenCornerRadius: 30,
    },
    {
      expected: 28,
      label: 'a display that reports no radius, resting rather than guessing',
      screenCornerRadius: 0,
    },
  ])('rounds the bottom corners to $expected on $label', ({ expected, screenCornerRadius }) => {
    mockScreenCornerRadius = screenCornerRadius;
    act(() => {
      renderer = create(
        <BottomSheet onClose={jest.fn()} testID="test-sheet">
          <Text>body</Text>
        </BottomSheet>,
      );
    });

    expect(renderer?.root.findByProps({ testID: 'test-sheet-sheet' }).props.style).toContainEqual(
      expect.objectContaining({
        borderBottomLeftRadius: expected,
        borderBottomRightRadius: expected,
        // The top corners touch no screen edge, so they stay at the resting
        // radius no matter how round the display is.
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
      }),
    );
  });
});
