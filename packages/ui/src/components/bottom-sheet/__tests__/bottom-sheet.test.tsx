import { ModalBottomSheet } from '@swmansion/react-native-bottom-sheet';
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { BackHandler, Dimensions, Keyboard, ScrollView, StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';

import { BottomSheet, BottomSheetBoundsProvider } from '..';
import { OverlayNavigationProvider, useOverlayNavigation } from '../../portal/overlay-navigation';

let mockBottomSheetProps: Record<string, unknown> = {};
let mockHardwareBackPress: (() => boolean | null | undefined) | undefined;
const mockAnimatedStyleFactories: (() => object)[] = [];

jest.mock('@cherrystudio/app-icons/icons/arrow-left', () => {
  const { View } = jest.requireActual('react-native');
  return View;
});

jest.mock('heroui-native/utils', () => {
  const { twMerge } = jest.requireActual('tailwind-merge');

  return {
    cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')),
  };
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

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const { useState } = jest.requireActual('react');
  return {
    __esModule: true,
    default: { View },
    createAnimatedComponent: (component: unknown) => component,
    useAnimatedStyle: (factory: () => object) => {
      mockAnimatedStyleFactories.push(factory);
      return factory();
    },
    useEvent: (handler: (event: unknown) => void) => handler,
    useSharedValue: (initial: number) => {
      const [shared] = useState(() => {
        let value = initial;
        return {
          get: () => value,
          set: (next: number) => {
            value = next;
          },
        };
      });
      return shared;
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
  let backHandlerSpy: jest.SpyInstance;
  let animationFrameSpy: jest.SpyInstance;
  let frames: FrameRequestCallback[];
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    frames = [];
    animationFrameSpy = jest
      .spyOn(global, 'requestAnimationFrame')
      .mockImplementation((callback) => frames.push(callback));
    mockBottomSheetProps = {};
    mockHardwareBackPress = undefined;
    mockAnimatedStyleFactories.length = 0;
    const handlers: (() => boolean | null | undefined)[] = [];
    backHandlerSpy = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((_event, handler) => {
        const listener = () => handler({ type: 'hardwareBackPress', timeStamp: Date.now() });
        handlers.push(listener);
        mockHardwareBackPress = () => handlers.toReversed().some((callback) => callback());
        return { remove: () => handlers.splice(handlers.indexOf(listener), 1) };
      });
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    animationFrameSpy.mockRestore();
    backHandlerSpy.mockRestore();
  });

  test('navigation waits for sheet settlement and owner closure', async () => {
    let prepare!: ReturnType<typeof useOverlayNavigation>['prepareForNavigation'];
    function Sheet() {
      const [open, setOpen] = useState(true);
      const navigation = useOverlayNavigation();
      useLayoutEffect(() => {
        prepare = navigation.prepareForNavigation;
      });
      return (
        <BottomSheet onClose={() => setOpen(false)} open={open} size="medium" title="Files">
          <Text>Files</Text>
        </BottomSheet>
      );
    }
    act(() => {
      renderer = create(
        <OverlayNavigationProvider>
          <Sheet />
        </OverlayNavigationProvider>,
      );
    });
    const navigated = jest.fn();
    let pending!: Promise<void>;
    await act(async () => {
      pending = prepare(new AbortController().signal).then(navigated);
    });
    expect(mockBottomSheetProps.index).toBe(0);
    expect(navigated).not.toHaveBeenCalled();
    await act(async () => {
      (mockBottomSheetProps.onSettle as (index: number) => void)(0);
    });
    await pending;
    expect(navigated).toHaveBeenCalledWith(true);
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

  test('uses the provider host so native menu controls retain their presenting page controller', () => {
    act(() => {
      renderer = create(
        <BottomSheet onClose={jest.fn()} open size="large" title="Share">
          <Text>Preview</Text>
        </BottomSheet>,
      );
    });

    // A window-level native overlay detaches controls from their view controller on iOS.
    expect(mockBottomSheetProps.nativeOverlay).toBe(false);
  });

  test('does not report a controlled close as a user dismissal', () => {
    const onClose = jest.fn();
    const onClosed = jest.fn();

    act(() => {
      renderer = create(
        <BottomSheet onClosed={onClosed} onClose={onClose} open size="medium" title="Models">
          <Text>Content</Text>
        </BottomSheet>,
      );
    });
    act(() => {
      renderer?.update(
        <BottomSheet
          onClosed={onClosed}
          onClose={onClose}
          open={false}
          size="medium"
          title="Models"
        >
          <Text>Content</Text>
        </BottomSheet>,
      );
    });
    act(() => (mockBottomSheetProps.onSettle as (index: number) => void)(0));

    expect(mockBottomSheetProps.index).toBe(0);
    expect(onClose).not.toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalledTimes(1);
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

  test('follows its own keyboard-driven height when it avoids the keyboard', () => {
    act(() => {
      renderer = create(
        <BottomSheet
          avoidKeyboard
          dismissible={false}
          footer={<Text>Submit</Text>}
          onClose={jest.fn()}
          open
          size="medium"
          title="Question"
        >
          <Text>Content</Text>
        </BottomSheet>,
      );
    });

    expect(mockBottomSheetProps.detents).toEqual([{ programmatic: true, value: 0 }, 'content']);
    expect(mockBottomSheetProps.animateContentHeight).toBe(false);
    expect(mockBottomSheetProps.index).toBe(1);
  });

  test('retains draggable heights while controlled size changes and reports only user resizing', () => {
    const onClose = jest.fn();
    const onSizeChange = jest.fn();
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    const sheet = (size: 'large' | 'full') => (
      <BottomSheet
        avoidKeyboard
        onClose={onClose}
        onSizeChange={onSizeChange}
        open
        size={size}
        sizes={['large', 'full']}
        title="Models"
      >
        <Text>Models</Text>
      </BottomSheet>
    );

    try {
      act(() => {
        renderer = create(sheet('large'));
      });
      const detents = mockBottomSheetProps.detents as number[];
      expect(detents).toHaveLength(3);
      expect(mockBottomSheetProps.index).toBe(1);

      act(() => renderer?.update(sheet('full')));
      expect(mockBottomSheetProps.index).toBe(2);
      expect(mockBottomSheetProps.detents).toEqual(detents);
      expect(mockBottomSheetProps.animateContentHeight).toBe(true);

      // A stale programmatic settlement must not undo a newer requested height.
      act(() => (mockBottomSheetProps.onSettle as (index: number) => void)(1));
      expect(onSizeChange).not.toHaveBeenCalled();
      expect(mockBottomSheetProps.index).toBe(2);

      act(() => (mockBottomSheetProps.onIndexChange as (index: number) => void)(1));
      expect(onSizeChange).toHaveBeenCalledWith('large');
      expect(dismiss).toHaveBeenCalledTimes(1);

      act(() => (mockBottomSheetProps.onIndexChange as (index: number) => void)(0));
      act(() => (mockBottomSheetProps.onSettle as (index: number) => void)(0));
      expect(onSizeChange).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    } finally {
      dismiss.mockRestore();
    }
  });

  test('shows the drag handle only when a drag can close or resize the sheet', () => {
    const sheet = (props: { dismissible?: boolean; sizes?: ['compact', 'large'] }) =>
      props.sizes ? (
        <BottomSheet
          dismissible={props.dismissible}
          onClose={jest.fn()}
          open
          sizes={props.sizes}
          title="Sheet"
        >
          <Text>Content</Text>
        </BottomSheet>
      ) : (
        <BottomSheet
          dismissible={props.dismissible}
          onClose={jest.fn()}
          open
          size="medium"
          title="Sheet"
        >
          <Text>Content</Text>
        </BottomSheet>
      );
    const handles = () =>
      renderer!.root.findAll((node) => node.props.testID === 'bottom-sheet-handle');

    act(() => {
      renderer = create(sheet({}));
    });
    expect(handles().length).toBeGreaterThan(0);

    act(() => renderer!.update(sheet({ dismissible: false })));
    expect(handles()).toHaveLength(0);

    act(() => renderer!.update(sheet({ dismissible: false, sizes: ['compact', 'large'] })));
    expect(handles().length).toBeGreaterThan(0);
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

  test('keeps the footer inside the visible layout while dragging between heights', () => {
    act(() => {
      renderer = create(
        <BottomSheet
          footer={<Text>Create</Text>}
          onClose={jest.fn()}
          open
          sizes={['large', 'full']}
          testID="resizable-sheet"
          title="Files"
        >
          <Text>Content</Text>
        </BottomSheet>,
      );
    });

    const [, minimum, maximum] = mockBottomSheetProps.detents as number[];
    expect(mockBottomSheetProps.disableScrollableNegotiation).toBe(true);
    expect(mockBottomSheetProps.surface).toBeUndefined();
    const footerStyle = mockAnimatedStyleFactories.at(-1)!;
    expect(footerStyle()).toEqual({ transform: [{ translateY: minimum - maximum }] });
    const card = renderer?.root
      .findAllByProps({ testID: 'resizable-sheet' })
      .find((node) => typeof node.type === 'string');
    const cardStyle = StyleSheet.flatten(card?.props.style);
    expect(cardStyle.height).toBe(maximum);
    expect(cardStyle.flex).toBeUndefined();

    const onPositionChange = mockBottomSheetProps.onPositionChange as (event: {
      position: number;
      index: number;
    }) => void;
    const middle = (minimum + maximum) / 2;
    onPositionChange({ position: middle, index: 1.5 });
    expect(footerStyle()).toEqual({ transform: [{ translateY: middle - maximum }] });
    onPositionChange({ position: maximum, index: 2 });
    expect(footerStyle()).toEqual({ transform: [{ translateY: 0 }] });
    onPositionChange({ position: minimum / 2, index: 0.5 });
    expect(footerStyle()).toEqual({ transform: [{ translateY: minimum - maximum }] });
  });

  test('sizes an overlay to its content and safe-area space', () => {
    act(() => {
      renderer = create(
        <BottomSheet onClose={jest.fn()} open presentation="overlay" size="content" title="Tools">
          <Text>Tools body</Text>
        </BottomSheet>,
      );
    });
    act(() => renderer!.root.findByType(ScrollView).props.onContentSizeChange(320, 200));
    expect(mockBottomSheetProps.detents).toEqual([0, 200 + 32 + 34]);
    expect(mockBottomSheetProps.disableScrollableNegotiation).toBe(false);
    expect(mockBottomSheetProps.surface).toBeUndefined();
    expect(renderer!.root.findAllByType(Text).some((node) => node.props.children === 'Tools')).toBe(
      false,
    );
    expect(renderer!.root.findAllByProps({ accessibilityLabel: 'Tools' }).length).toBeGreaterThan(
      0,
    );
  });

  test('covers a parent and routes Back only to its nested overlay', () => {
    const closeParent = jest.fn();
    const closeChild = jest.fn();
    const childClosed = jest.fn();
    act(() => {
      renderer = create(
        <BottomSheet onClose={closeParent} open presentation="overlay" size="large" title="Parent">
          <BottomSheet
            onClosed={childClosed}
            onClose={closeChild}
            open
            size="compact"
            title="Child"
          >
            <Text>Child body</Text>
          </BottomSheet>
        </BottomSheet>,
      );
    });
    let sheets = renderer!.root.findAllByType(ModalBottomSheet);
    expect(sheets[1].props.detents).toEqual(sheets[0].props.detents);
    act(() => {
      expect(mockHardwareBackPress?.()).toBe(true);
    });
    sheets = renderer!.root.findAllByType(ModalBottomSheet);
    expect(sheets[0].props.index).toBe(1);
    expect(sheets[1].props.index).toBe(0);
    act(() => sheets[1].props.onSettle(0));
    expect(closeParent).not.toHaveBeenCalled();
    expect(closeChild).toHaveBeenCalledTimes(1);
    expect(childClosed).not.toHaveBeenCalled();
    act(() => frames.splice(0).forEach((callback) => callback(0)));
    expect(childClosed).toHaveBeenCalledTimes(1);
  });

  test('keeps the footer inside the initial visible height of an expandable sheet', () => {
    act(() => {
      renderer = create(
        <BottomSheet
          footer={<Text>Share</Text>}
          onClose={jest.fn()}
          open
          sizes={['large', 'full']}
          testID="share-sheet"
          title="Share"
        >
          <Text>Preview</Text>
        </BottomSheet>,
      );
    });

    const footerStyle = mockAnimatedStyleFactories.at(-1)!;
    const detents = mockBottomSheetProps.detents as number[];
    expect(mockBottomSheetProps.disableScrollableNegotiation).toBe(true);
    expect(mockBottomSheetProps.surface).toBeUndefined();
    expect(footerStyle()).toEqual({ transform: [{ translateY: detents[1] - detents[2] }] });
    expect(detents[1]).toBeLessThan(detents[2]);
  });

  test('updates body layout height on commit when growing and on settle when shrinking', () => {
    const onSizeChange = jest.fn();
    const sheet = (size: 'medium' | 'full') => (
      <BottomSheet
        onClose={jest.fn()}
        onSizeChange={onSizeChange}
        open
        size={size}
        sizes={['medium', 'full']}
        testID="models-sheet"
        title="Models"
      >
        <Text>Models</Text>
      </BottomSheet>
    );

    act(() => {
      renderer = create(sheet('medium'));
    });

    const [, mediumHeight, fullHeight] = mockBottomSheetProps.detents as number[];
    expect(mockBottomSheetProps.disableScrollableNegotiation).toBe(true);
    expect(mockBottomSheetProps.onPositionChange).toBeUndefined();
    const bodyHeight = () => {
      const card = renderer!.root
        .findAllByProps({ testID: 'models-sheet' })
        .find((node) => typeof node.type === 'string');
      const bodyWrapper = card!.children.find(
        (child): child is ReactTestInstance =>
          typeof child !== 'string' && StyleSheet.flatten(child.props.style)?.height !== undefined,
      );
      return StyleSheet.flatten(bodyWrapper!.props.style).height;
    };

    expect(bodyHeight()).toBe(mediumHeight);

    act(() => (mockBottomSheetProps.onIndexChange as (index: number) => void)(2));
    expect(bodyHeight()).toBe(fullHeight);

    act(() => renderer!.update(sheet('full')));
    act(() => (mockBottomSheetProps.onIndexChange as (index: number) => void)(1));
    expect(bodyHeight()).toBe(fullHeight);

    // Mirror onSizeChange('medium') before requesting 'full' again, then deliver a stale settle.
    act(() => renderer!.update(sheet('medium')));
    act(() => renderer!.update(sheet('full')));
    act(() => (mockBottomSheetProps.onSettle as (index: number) => void)(1));
    expect(bodyHeight()).toBe(fullHeight);

    act(() => renderer!.update(sheet('medium')));
    act(() => (mockBottomSheetProps.onSettle as (index: number) => void)(1));
    expect(bodyHeight()).toBe(mediumHeight);
  });

  test('dismisses the keyboard immediately on drag or scrim close', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');
    try {
      act(() => {
        renderer = create(
          <BottomSheet
            avoidKeyboard
            onClose={jest.fn()}
            open
            sizes={['medium', 'full']}
            title="Models"
          >
            <Text>Models</Text>
          </BottomSheet>,
        );
      });

      act(() => (mockBottomSheetProps.onIndexChange as (index: number) => void)(0));
      expect(dismiss).toHaveBeenCalledTimes(1);
    } finally {
      dismiss.mockRestore();
    }
  });

  test('does not reopen when size changes mid-dismissal before settle', () => {
    const sheet = (size: 'medium' | 'full') => (
      <BottomSheet onClose={jest.fn()} open size={size} sizes={['medium', 'full']} title="Models">
        <Text>Models</Text>
      </BottomSheet>
    );

    act(() => {
      renderer = create(sheet('full'));
    });
    expect(mockBottomSheetProps.index).toBe(2);

    act(() => (mockBottomSheetProps.onIndexChange as (index: number) => void)(0));
    expect(mockBottomSheetProps.index).toBe(0);

    act(() => renderer!.update(sheet('medium')));
    expect(mockBottomSheetProps.index).toBe(0);
  });

  test('gives headerless multi-detent sheets a 44pt handle zone', () => {
    act(() => {
      renderer = create(
        <BottomSheet
          onClose={jest.fn()}
          open
          presentation="overlay"
          sizes={['medium', 'full']}
          title="Models"
        >
          <Text>Models</Text>
        </BottomSheet>,
      );
    });

    const handleContainer = renderer!.root.findByProps({ accessibilityLabel: 'Models' });
    expect(handleContainer.props.className).toContain('h-11');
    expect(StyleSheet.flatten(handleContainer.props.style)).toEqual({ height: 44 });
  });

  test('omits outer bottom safe-area padding when bodyInset is none', () => {
    const renderWithInset = (bodyInset?: 'safe-area' | 'none') => {
      act(() => {
        const tree = (
          <BottomSheet bodyInset={bodyInset} onClose={jest.fn()} open size="large" title="Models">
            <Text testID="body-child">Models</Text>
          </BottomSheet>
        );
        if (renderer) renderer.update(tree);
        else renderer = create(tree);
      });

      return renderer!.root.find(
        (node) =>
          typeof node.props.className === 'string' &&
          node.props.className.includes('min-h-0 flex-1') &&
          node.findAllByProps({ testID: 'body-child' }).length > 0,
      );
    };

    expect(StyleSheet.flatten(renderWithInset('safe-area').props.style)).toEqual({
      paddingBottom: 34,
    });
    expect(renderWithInset('none').props.style).toBeUndefined();
  });

  test('uses a caller-provided fixed height on a bounded sheet with only top corners rounded', () => {
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
    const cardStyle = StyleSheet.flatten(card?.props.style);
    expect(mockBottomSheetProps.detents).toEqual([0, 420]);
    expect(cardStyle).toMatchObject({
      borderTopLeftRadius: 32,
      borderTopRightRadius: 32,
      height: 420,
      width: Math.min(720, Dimensions.get('window').width),
    });
    expect(cardStyle.borderBottomLeftRadius ?? cardStyle.borderRadius ?? 0).toBe(0);
    expect(cardStyle.borderBottomRightRadius ?? cardStyle.borderRadius ?? 0).toBe(0);
  });

  test('centers BottomSheet inside bounds provided by BottomSheetBoundsProvider', () => {
    act(() => {
      renderer = create(
        <BottomSheetBoundsProvider insetLeft={340} insetRight={0}>
          <BottomSheet
            onClose={jest.fn()}
            open
            size="medium"
            testID="bounded-sheet"
            title="Pick Agent"
          >
            <Text>Agents</Text>
          </BottomSheet>
        </BottomSheetBoundsProvider>,
      );
    });

    const card = renderer?.root
      .findAllByProps({ testID: 'bounded-sheet' })
      .find((node) => typeof node.type === 'string');
    const cardStyle = StyleSheet.flatten(card?.props.style);
    const availableWidth = Math.max(0, Dimensions.get('window').width - 340);
    expect(cardStyle.width).toBe(Math.min(720, availableWidth));
  });
});
