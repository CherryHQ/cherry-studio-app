import { type ReactNode, useEffect } from 'react';
import {
  type AccessibilityActionEvent,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  View,
} from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { NativeCherryMenuRef } from '../../use-native-menu';
import { ContextMenuExclusion } from '../context-menu-exclusion';
import { ContextMenuScrollBoundary } from '../context-menu-scroll-boundary';
import { ContextMenu } from '../context-menu.android';
import { ContextMenu as IosContextMenu } from '../context-menu.ios';

type NativeMenuProps = {
  children?: ReactNode;
  hybridRef?: (view: NativeCherryMenuRef) => void;
  items: unknown[];
  onAction: (id: string) => void;
  trigger: string;
};

type MockLongPressGesture = {
  enabled: (value: boolean) => MockLongPressGesture;
  isEnabled?: boolean;
  maxDistance: (value: number) => MockLongPressGesture;
  maxDistanceValue?: number;
  minDuration: (value: number) => MockLongPressGesture;
  minDurationValue?: number;
  onStart: (callback: () => void) => MockLongPressGesture;
  onStartCallback?: () => void;
  runOnJS: () => MockLongPressGesture;
};

const mockShowMenu = jest.fn();
jest.mock('../../menu-content', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    MenuContent: (props: object) => React.createElement(View, { ...props, testID: 'menu-content' }),
  };
});

// The preset renders View as a class, so its measurement lives on the
// instance prototype rather than a host node supplied by createNodeMock.
const viewPrototype = View.prototype as View;
const mockGetLongPressMaxDistance = jest.fn(() => 16);
const mockGetLongPressMinDuration = jest.fn(() => 625);
const mockNativeMenuRef = {
  getLongPressMaxDistance: mockGetLongPressMaxDistance,
  getLongPressMinDuration: mockGetLongPressMinDuration,
  showMenu: mockShowMenu,
} as unknown as NativeCherryMenuRef;
let mockLatestLongPressGesture: MockLongPressGesture | undefined;

jest.mock('react-native-gesture-handler', () => {
  return {
    Gesture: {
      LongPress: () => {
        const gesture: MockLongPressGesture = {
          enabled(value) {
            gesture.isEnabled = value;
            return gesture;
          },
          maxDistance(value) {
            gesture.maxDistanceValue = value;
            return gesture;
          },
          minDuration(value) {
            gesture.minDurationValue = value;
            return gesture;
          },
          onStart(callback) {
            gesture.onStartCallback = callback;
            return gesture;
          },
          runOnJS: () => gesture,
        };
        mockLatestLongPressGesture = gesture;
        return gesture;
      },
    },
    GestureDetector: ({ children }: { children: ReactNode }) => children,
  };
});

jest.mock('react-native-nitro-modules', () => {
  const React = jest.requireActual('react');
  const { View: NativeView } = jest.requireActual('react-native');

  return {
    callback: (value: unknown) => value,
    getHostComponent:
      () =>
      ({ children, hybridRef, ...props }: NativeMenuProps) => {
        React.useEffect(() => {
          hybridRef?.(mockNativeMenuRef);
        }, [hybridRef]);

        return React.createElement(
          NativeView,
          { ...props, mockComponent: 'native-menu' },
          children,
        );
      },
  };
});

function accessibilityAction(actionName: string): AccessibilityActionEvent {
  return { nativeEvent: { actionName } } as AccessibilityActionEvent;
}

function scrollEvent(): NativeSyntheticEvent<NativeScrollEvent> {
  return { nativeEvent: {} } as NativeSyntheticEvent<NativeScrollEvent>;
}

function touchEvent(touchCount = 1): GestureResponderEvent {
  return {
    nativeEvent: { touches: Array.from({ length: touchCount }, () => ({})) },
  } as GestureResponderEvent;
}

describe('ContextMenu.android', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest
      .spyOn(viewPrototype, 'measureInWindow')
      .mockImplementation((callback) => callback(16, 120, 200, 48));
    mockShowMenu.mockClear();
    mockGetLongPressMaxDistance.mockClear();
    mockGetLongPressMinDuration.mockClear();
    mockLatestLongPressGesture = undefined;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  it('uses system long-press configuration to open the Cherry menu at its anchor', () => {
    const onRename = jest.fn();

    act(() => {
      renderer = create(
        <ContextMenu items={[{ id: 'rename', label: 'Rename', onPress: onRename }]}>
          <Text>Row</Text>
        </ContextMenu>,
      );
    });

    const menu = renderer!.root.findByProps({ mockComponent: 'native-menu' });
    expect(menu.props.trigger).toBe('longPress');
    expect(menu.props.items).toEqual([]);
    expect(mockLatestLongPressGesture?.minDurationValue).toBe(625);
    expect(mockLatestLongPressGesture?.maxDistanceValue).toBe(16);

    act(() => mockLatestLongPressGesture?.onStartCallback?.());
    expect(renderer!.root.findByProps({ testID: 'menu-content' }).props.isOpen).toBe(true);
    expect(mockShowMenu).not.toHaveBeenCalled();

    expect(renderer!.root.findByProps({ testID: 'menu-content' }).props.anchor).toEqual({
      height: 48,
      pageX: 16,
      pageY: 120,
      width: 200,
    });
    expect(onRename).not.toHaveBeenCalled();
  });

  it('keeps a touch that stops momentum blocked for its complete sequence', () => {
    act(() => {
      renderer = create(
        <ContextMenuScrollBoundary>
          {(scrollHandlers) => (
            <View {...scrollHandlers} testID="scroll-owner">
              <ContextMenu items={[{ id: 'rename', label: 'Rename', onPress: jest.fn() }]}>
                <Pressable testID="row">
                  <Text>Row</Text>
                </Pressable>
              </ContextMenu>
            </View>
          )}
        </ContextMenuScrollBoundary>,
      );
    });

    const scrollOwner = renderer!.root.findByProps({ testID: 'scroll-owner' });
    act(() => {
      scrollOwner.props.onMomentumScrollBegin(scrollEvent());
      scrollOwner.props.onTouchStart(touchEvent());
      scrollOwner.props.onMomentumScrollEnd(scrollEvent());
      mockLatestLongPressGesture?.onStartCallback?.();
    });
    expect(renderer!.root.findAllByProps({ testID: 'menu-content' })).toHaveLength(0);

    act(() => {
      scrollOwner.props.onTouchEnd(touchEvent());
      mockLatestLongPressGesture?.onStartCallback?.();
    });
    expect(renderer!.root.findAllByProps({ testID: 'menu-content' })).toHaveLength(0);

    act(() => {
      scrollOwner.props.onTouchStart(touchEvent());
      mockLatestLongPressGesture?.onStartCallback?.();
    });
    expect(renderer!.root.findByProps({ testID: 'menu-content' }).props.isOpen).toBe(true);
    expect(mockShowMenu).not.toHaveBeenCalled();
  });

  it('exposes enabled items as accessibility actions on the child and dispatches them', () => {
    const onRename = jest.fn();
    const onDelete = jest.fn();
    const onDisabled = jest.fn();

    act(() => {
      renderer = create(
        <ContextMenu
          items={[
            { id: 'rename', label: 'Rename', onPress: onRename },
            { destructive: true, id: 'delete', label: 'Delete', onPress: onDelete },
            { disabled: true, id: 'share', label: 'Share', onPress: onDisabled },
          ]}
        >
          <Pressable testID="row">
            <Text>Row</Text>
          </Pressable>
        </ContextMenu>,
      );
    });

    const row = renderer!.root.findByProps({ testID: 'row' });
    expect(row.props.accessibilityActions).toEqual([
      { label: 'Rename', name: 'rename' },
      { label: 'Delete', name: 'delete' },
    ]);

    act(() => row.props.onAccessibilityAction(accessibilityAction('delete')));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onRename).not.toHaveBeenCalled();

    act(() => row.props.onAccessibilityAction(accessibilityAction('share')));
    expect(onDisabled).not.toHaveBeenCalled();
  });

  it('gives menu actions one owner while preserving unrelated child actions', () => {
    const onChildAction = jest.fn();
    const onMenuRename = jest.fn();

    act(() => {
      renderer = create(
        <ContextMenu items={[{ id: 'rename', label: 'Rename', onPress: onMenuRename }]}>
          <Pressable
            accessibilityActions={[
              { label: 'Collapse', name: 'collapse' },
              { label: 'Rename', name: 'rename' },
            ]}
            onAccessibilityAction={onChildAction}
            testID="row"
          >
            <Text>Row</Text>
          </Pressable>
        </ContextMenu>,
      );
    });

    const row = renderer!.root.findByProps({ testID: 'row' });
    expect(row.props.accessibilityActions).toEqual([
      { label: 'Collapse', name: 'collapse' },
      { label: 'Rename', name: 'rename' },
    ]);

    act(() => row.props.onAccessibilityAction(accessibilityAction('rename')));
    expect(onMenuRename).toHaveBeenCalledTimes(1);
    expect(onChildAction).not.toHaveBeenCalled();

    act(() => row.props.onAccessibilityAction(accessibilityAction('collapse')));
    expect(onChildAction).toHaveBeenCalledTimes(1);
  });

  it('renders its child directly when no items are available', () => {
    act(() => {
      renderer = create(
        <ContextMenu items={[]}>
          <View testID="row" />
        </ContextMenu>,
      );
    });

    expect(renderer!.root.findByProps({ testID: 'row' })).toBeDefined();
    expect(renderer!.root.findAllByProps({ mockComponent: 'native-menu' })).toHaveLength(0);
  });
});

describe.each([
  ['Android', ContextMenu],
  ['iOS', IosContextMenu],
] as const)('%s explicitly timed context menu', (platform, TimedContextMenu) => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest
      .spyOn(viewPrototype, 'measureInWindow')
      .mockImplementation((callback) => callback(16, 120, 200, 48));
    mockLatestLongPressGesture = undefined;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
    jest.restoreAllMocks();
  });

  it('lets an excluded control own its touch and rearms the next ordinary long press', () => {
    const onControlTouch = jest.fn();
    act(() => {
      renderer = create(
        <TimedContextMenu
          delayLongPress={1_500}
          items={[{ id: 'copy', label: 'Copy', onPress: jest.fn() }]}
        >
          <View>
            <ContextMenuExclusion onTouchStart={onControlTouch} testID="control">
              <Text>Open details</Text>
            </ContextMenuExclusion>
          </View>
        </TimedContextMenu>,
      );
    });
    const anchor = renderer!.root.find(
      (node) => node.type === View && node.props.collapsable === false,
    );
    const control = renderer!.root.find(
      (node) => node.type === View && node.props.testID === 'control',
    );
    const event = touchEvent();
    const pendingLongPress = mockLatestLongPressGesture?.onStartCallback;
    act(() => {
      control.props.onTouchStart(event);
      anchor.props.onTouchStart(event);
    });
    expect(onControlTouch).toHaveBeenCalledWith(event);
    expect(mockLatestLongPressGesture?.isEnabled).toBe(false);
    act(() => {
      anchor.props.onTouchCancel(touchEvent());
      pendingLongPress?.();
    });
    expect(mockLatestLongPressGesture?.isEnabled).toBe(true);
    expect(renderer!.root.findAllByProps({ testID: 'menu-content' })).toHaveLength(0);
    act(() => {
      anchor.props.onTouchStart(touchEvent());
      mockLatestLongPressGesture?.onStartCallback?.();
    });
    expect(renderer!.root.findByProps({ testID: 'menu-content' }).props.isOpen).toBe(true);
  });

  it('does not mistake native long-press takeover for a scroll cancellation', () => {
    act(() => {
      renderer = create(
        <ContextMenuScrollBoundary>
          {(handlers) => (
            <View {...handlers} testID="scroll-owner">
              <TimedContextMenu
                delayLongPress={1_500}
                items={[{ id: 'copy', label: 'Copy', onPress: jest.fn() }]}
              >
                <Text>Answer</Text>
              </TimedContextMenu>
            </View>
          )}
        </ContextMenuScrollBoundary>,
      );
    });
    const scrollOwner = renderer!.root.findByProps({ testID: 'scroll-owner' });
    act(() => {
      scrollOwner.props.onTouchStart(touchEvent());
      scrollOwner.props.onTouchCancel(touchEvent());
      mockLatestLongPressGesture?.onStartCallback?.();
    });
    expect(renderer!.root.findByProps({ testID: 'menu-content' }).props.isOpen).toBe(true);
  });

  it('recognizes the requested hold and dispatches the shared menu action', () => {
    const onCopy = jest.fn();
    act(() => {
      renderer = create(
        <TimedContextMenu
          delayLongPress={1_500}
          items={[{ id: 'copy', label: 'Copy', onPress: onCopy }]}
        >
          <View testID="row" />
        </TimedContextMenu>,
      );
    });
    expect(mockLatestLongPressGesture?.minDurationValue).toBe(1_500);
    expect(mockLatestLongPressGesture?.isEnabled).toBe(true);
    if (platform === 'iOS') {
      expect(renderer!.root.findAllByProps({ mockComponent: 'native-menu' })).toHaveLength(0);
    }
    act(() => mockLatestLongPressGesture?.onStartCallback?.());
    const menu = renderer!.root.findByProps({ testID: 'menu-content' });
    expect(menu.props.isOpen).toBe(true);
    act(() => menu.props.items[0].onPress());
    expect(onCopy).toHaveBeenCalledTimes(1);
  });

  it('enables actions without remounting streamed content when the message settles', () => {
    const onMount = jest.fn();
    function Content() {
      useEffect(onMount, []);
      return <Text>Answer</Text>;
    }
    const content = <Content />;
    act(() => {
      renderer = create(
        <TimedContextMenu delayLongPress={1_500} items={[]}>
          {content}
        </TimedContextMenu>,
      );
    });
    expect(mockLatestLongPressGesture?.isEnabled).toBe(false);
    act(() => {
      renderer?.update(
        <TimedContextMenu
          delayLongPress={1_500}
          items={[{ id: 'copy', label: 'Copy', onPress: jest.fn() }]}
        >
          {content}
        </TimedContextMenu>,
      );
    });
    expect(mockLatestLongPressGesture?.isEnabled).toBe(true);
    expect(onMount).toHaveBeenCalledTimes(1);
  });

  it('keeps a cancelled drag ineligible until the next touch starts', () => {
    act(() => {
      renderer = create(
        <ContextMenuScrollBoundary>
          {(handlers) => (
            <View {...handlers} testID="scroll-owner">
              <TimedContextMenu
                delayLongPress={1_500}
                items={[{ id: 'copy', label: 'Copy', onPress: jest.fn() }]}
              >
                <View />
              </TimedContextMenu>
            </View>
          )}
        </ContextMenuScrollBoundary>,
      );
    });
    const scrollOwner = renderer!.root.findByProps({ testID: 'scroll-owner' });
    act(() => {
      scrollOwner.props.onTouchStart(touchEvent());
      scrollOwner.props.onScrollBeginDrag(scrollEvent());
      scrollOwner.props.onScrollEndDrag(scrollEvent());
      mockLatestLongPressGesture?.onStartCallback?.();
      scrollOwner.props.onTouchCancel(touchEvent());
      mockLatestLongPressGesture?.onStartCallback?.();
    });
    expect(renderer!.root.findAllByProps({ testID: 'menu-content' })).toHaveLength(0);
    act(() => {
      scrollOwner.props.onTouchStart(touchEvent());
      mockLatestLongPressGesture?.onStartCallback?.();
    });
    expect(renderer!.root.findByProps({ testID: 'menu-content' }).props.isOpen).toBe(true);
  });
});
