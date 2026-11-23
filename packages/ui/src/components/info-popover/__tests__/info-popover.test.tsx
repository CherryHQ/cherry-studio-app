import { type ReactNode } from 'react';
import { View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { AnchoredInfoPopover } from '../info-popover';

let mockOnClosed: (() => void) | undefined;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  default: () => ({ fontScale: 1, height: 800, scale: 1, width: 400 }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 24, left: 0, right: 0, top: 24 }),
}));

jest.mock('../../menu/use-menu-motion', () => ({
  useMenuMotion: (isOpen: boolean) => ({ isVisible: isOpen, progress: { value: isOpen ? 1 : 0 } }),
}));

jest.mock('react-native-reanimated', () => {
  const { View: RNView } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View: RNView },
    useAnimatedStyle: (factory: () => object) => factory(),
  };
});

jest.mock('../../menu/menu-surface', () => {
  const React = jest.requireActual('react');
  const { View: RNView } = jest.requireActual('react-native');
  return {
    MenuSurface: ({ children }: { children: ReactNode }) =>
      React.createElement(RNView, null, children),
  };
});

jest.mock('../../menu/menu-overlay', () => {
  const React = jest.requireActual('react');
  const { Platform, View: RNView } = jest.requireActual('react-native');
  const { MenuInteraction } = jest.requireActual('../../menu/menu-interaction');
  return {
    KeyboardMenuOverlay: ({
      children,
      isOpen,
      onClose,
      onClosed,
      testID,
    }: {
      children: ReactNode;
      isOpen: boolean;
      onClose: () => void;
      onClosed: () => void;
      testID?: string;
    }) => {
      mockOnClosed = onClosed;
      return React.createElement(
        MenuInteraction,
        {
          value: {
            isOpen,
            close: onClose,
            shouldUseNativePresses: Platform.OS === 'android',
          },
        },
        React.createElement(RNView, { testID: testID ? `${testID}-overlay` : undefined }, children),
      );
    },
    MenuOverlay: ({ children }: { children: ReactNode }) => children,
  };
});

describe('AnchoredInfoPopover', () => {
  const anchor = { height: 24, pageX: 40, pageY: 200, width: 24 };
  let renderer: ReactTestRenderer | undefined;

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    mockOnClosed = undefined;
  });

  test('renders footer outside the accessible readout container and retains it through close', () => {
    const onClose = jest.fn();
    act(() => {
      renderer = create(
        <AnchoredInfoPopover
          anchor={anchor}
          footer={<View accessibilityRole="button" testID="popover-action" />}
          onClose={onClose}
          text="Context summary"
          testID="info-popover"
        >
          <View testID="popover-readout" />
        </AnchoredInfoPopover>,
      );
    });

    const accessibleReadout = renderer!.root.findByProps({ accessibilityLabel: 'Context summary' });
    expect(accessibleReadout.props.accessible).toBe(true);
    expect(
      accessibleReadout.findAllByProps({ testID: 'popover-readout' }, { deep: false }),
    ).toHaveLength(1);
    expect(
      accessibleReadout.findAllByProps({ testID: 'popover-action' }, { deep: false }),
    ).toHaveLength(0);
    expect(renderer!.root.findByProps({ testID: 'popover-action' })).toBeTruthy();

    act(() => {
      renderer!.update(
        <AnchoredInfoPopover
          anchor={undefined}
          footer={<View accessibilityRole="button" testID="popover-action" />}
          onClose={onClose}
          text="Context summary"
          testID="info-popover"
        >
          <View testID="popover-readout" />
        </AnchoredInfoPopover>,
      );
    });
    expect(
      renderer!.root.findAllByProps({ testID: 'popover-action' }, { deep: false }),
    ).toHaveLength(1);

    act(() => {
      mockOnClosed?.();
    });
    expect(
      renderer!.root.findAllByProps({ testID: 'popover-action' }, { deep: false }),
    ).toHaveLength(0);
  });
});
