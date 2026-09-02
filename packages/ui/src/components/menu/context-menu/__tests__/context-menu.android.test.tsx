import type { ReactNode } from 'react';
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
import { ContextMenuScrollBoundary } from '../context-menu-scroll-boundary.android';
import { ContextMenu } from '../context-menu.android';

type NativeMenuProps = {
  children?: ReactNode;
  hybridRef?: (view: NativeCherryMenuRef) => void;
  items: unknown[];
  onAction: (id: string) => void;
  trigger: string;
};

type MockLongPressGesture = {
  maxDistance: (value: number) => MockLongPressGesture;
  maxDistanceValue?: number;
  minDuration: (value: number) => MockLongPressGesture;
  minDurationValue?: number;
  onStart: (callback: () => void) => MockLongPressGesture;
  onStartCallback?: () => void;
  runOnJS: () => MockLongPressGesture;
};

const mockShowMenu = jest.fn();
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

function touchEvent(): GestureResponderEvent {
  return { nativeEvent: {} } as GestureResponderEvent;
}

describe('ContextMenu.android', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    mockShowMenu.mockClear();
    mockGetLongPressMaxDistance.mockClear();
    mockGetLongPressMinDuration.mockClear();
    mockLatestLongPressGesture = undefined;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('uses Android system long-press configuration before presenting the native menu', () => {
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
    expect(menu.props.items).toEqual([
      {
        checked: 'none',
        destructive: false,
        disabled: false,
        icon: 'none',
        id: 'rename',
        label: 'Rename',
      },
    ]);
    expect(mockLatestLongPressGesture?.minDurationValue).toBe(625);
    expect(mockLatestLongPressGesture?.maxDistanceValue).toBe(16);

    act(() => mockLatestLongPressGesture?.onStartCallback?.());
    expect(mockShowMenu).toHaveBeenCalledTimes(1);

    act(() => menu.props.onAction('rename'));
    expect(onRename).toHaveBeenCalledTimes(1);
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
    expect(mockShowMenu).not.toHaveBeenCalled();

    act(() => {
      scrollOwner.props.onTouchEnd(touchEvent());
      mockLatestLongPressGesture?.onStartCallback?.();
    });
    expect(mockShowMenu).toHaveBeenCalledTimes(1);
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
