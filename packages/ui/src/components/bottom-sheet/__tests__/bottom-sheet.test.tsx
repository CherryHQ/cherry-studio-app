import { ModalBottomSheet } from '@swmansion/react-native-bottom-sheet';
import { useLayoutEffect, useState, type ReactNode } from 'react';
import { BackHandler, Dimensions, ScrollView, StyleSheet, Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BottomSheet } from '..';
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
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
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
    const layout = mockAnimatedStyleFactories.at(-1)!;
    expect(layout()).toEqual({ height: minimum });
    const card = renderer?.root
      .findAllByProps({ testID: 'resizable-sheet' })
      .find((node) => typeof node.type === 'string');
    const cardStyle = StyleSheet.flatten(card?.props.style);
    expect(cardStyle.flex).toBe(1);
    expect(cardStyle.height).toBeUndefined();

    const onPositionChange = mockBottomSheetProps.onPositionChange as (event: {
      position: number;
      index: number;
    }) => void;
    const middle = (minimum + maximum) / 2;
    onPositionChange({ position: middle, index: 1.5 });
    expect(layout()).toEqual({ height: middle });
    onPositionChange({ position: maximum, index: 2 });
    expect(layout()).toEqual({ height: maximum });
    onPositionChange({ position: minimum / 2, index: 0.5 });
    expect(layout()).toEqual({ height: minimum });
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
    act(() => {
      renderer = create(
        <BottomSheet onClose={closeParent} open presentation="overlay" size="large" title="Parent">
          <BottomSheet onClose={closeChild} open size="compact" title="Child">
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
});
