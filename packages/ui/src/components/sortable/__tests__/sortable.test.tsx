import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { ScrollInteractionBoundary } from '../../scroll-interaction/scroll-interaction-boundary';
import { Section } from '../../section';
import { Sortable } from '../index';

type PanHandlers = {
  config: { enabled?: boolean; maxPointers?: number; minDuration?: number };
  onEnd?: (event: object, success: boolean) => void;
  onFinalize?: (event: object, success: boolean) => void;
  onStart?: () => void;
  onTouchesDown?: (event: object, manager: { fail: () => void }) => void;
  onUpdate?: (event: { absoluteY: number; translationX: number; translationY: number }) => void;
};

const panGesturesByOrder: PanHandlers[] = [];
const mockFail = jest.fn();
const mockLightHaptic = jest.fn();
const mockSelectionHaptic = jest.fn();

jest.mock('heroui-native/utils', () => {
  const { twMerge } = jest.requireActual('tailwind-merge');
  return { cn: (...values: unknown[]) => twMerge(values.filter(Boolean).join(' ')) };
});

jest.mock('@cherrystudio/app-icons/icons/check', () => 'MockCheckIcon');
jest.mock('@cherrystudio/app-icons/icons/chevron-down', () => 'MockChevronDownIcon');
jest.mock('@cherrystudio/app-icons/icons/chevron-right', () => 'MockChevronRightIcon');
jest.mock('@cherrystudio/app-icons/icons/lock', () => 'MockLockIcon');

jest.mock('../../../haptics', () => ({
  haptics: {
    light: () => mockLightHaptic(),
    selection: () => mockSelectionHaptic(),
  },
}));

jest.mock('../../menu/menu-content', () => {
  const React = jest.requireActual('react');
  const { View: RNView } = jest.requireActual('react-native');
  return {
    MenuContent: (props: object) =>
      React.createElement(RNView, { ...props, testID: 'menu-content' }),
  };
});

jest.mock('react-native-gesture-handler', () => {
  const { Pressable: RNPressable, View: RNView } = jest.requireActual('react-native');
  return {
    Gesture: {
      Pan: () => {
        const entry: PanHandlers = { config: {} };
        panGesturesByOrder.push(entry);
        const chain: object = new Proxy(
          {},
          {
            get: (_target, prop: string) => (arg: unknown) => {
              if (prop === 'enabled') entry.config.enabled = arg as boolean;
              else if (prop === 'maxPointers') entry.config.maxPointers = arg as number;
              else if (prop === 'activateAfterLongPress') entry.config.minDuration = arg as number;
              else if (prop.startsWith('on')) Object.assign(entry, { [prop]: arg });
              return chain;
            },
          },
        );
        return chain;
      },
    },
    GestureDetector: ({ children }: { children: ReactNode }) => children,
    GestureHandlerRootView: RNView,
    Pressable: RNPressable,
  };
});

jest.mock('react-native-reanimated', () => {
  const React = jest.requireActual('react');
  const { View: RNView } = jest.requireActual('react-native');
  const AnimatedView = ({ children, ...props }: object & { children?: ReactNode }) =>
    React.createElement(RNView, props, children);
  return {
    __esModule: true,
    default: { View: AnimatedView },
    Easing: { bezier: () => 'bezier', linear: 'linear' },
    cancelAnimation: jest.fn(),
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useAnimatedStyle: (fn: () => object) => fn(),
    useReducedMotion: () => false,
    useSharedValue: (initial: unknown) => {
      const ref = React.useRef({ value: initial });
      return ref.current;
    },
    withSpring: (toValue: number) => toValue,
    withTiming: (toValue: number, _config?: object, cb?: (finished?: boolean) => void) => {
      cb?.(true);
      return toValue === 1 ? 'animated opacity' : toValue;
    },
  };
});

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('Sortable', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    panGesturesByOrder.length = 0;
    mockFail.mockReset();
    mockLightHaptic.mockReset();
    mockSelectionHaptic.mockReset();
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  const items = [
    { id: 'a', label: 'Alpha' },
    { id: 'b', label: 'Beta' },
    { id: 'c', label: 'Gamma' },
  ];

  function renderList({
    movable = true,
    onDelete = jest.fn(),
    onDraggingChange = jest.fn(),
    onMoveToTop = jest.fn(),
    onReorder = jest.fn(),
  }: {
    movable?: boolean;
    onDelete?: (id: string) => void;
    onDraggingChange?: (dragging: boolean) => void;
    onMoveToTop?: (index: number) => void;
    onReorder?: (event: {
      fromIndex: number;
      groupId: string;
      id: string;
      toIndex: number;
    }) => void;
  }) {
    const list = (visibleItems = items, registeredItems = visibleItems) => (
      <ScrollInteractionBoundary>
        {(scrollHandlers) => (
          <Sortable.Root onDraggingChange={onDraggingChange} testID="sortable-root">
            {({ isDragging }) => (
              <View {...scrollHandlers} data-dragging={isDragging} testID="scroll-surface">
                <Sortable.Group
                  estimatedItemHeight={50}
                  groupId="g1"
                  itemIds={registeredItems.map((i) => i.id)}
                  onReorder={onReorder}
                >
                  <Section>
                    {registeredItems.map(
                      (item, index) =>
                        visibleItems.includes(item) && (
                          <Sortable.Item
                            accessibilityLabels={{
                              moveDown: `Move ${item.label} down`,
                              moveToTop: 'Move to top',
                              moveUp: `Move ${item.label} up`,
                            }}
                            estimatedHeight={50}
                            groupId="g1"
                            id={item.id}
                            index={index}
                            key={item.id}
                            menuItems={[
                              ...(movable && index > 0
                                ? [
                                    {
                                      id: 'move-to-top',
                                      label: 'Move to top',
                                      onPress: () => onMoveToTop(index),
                                    },
                                  ]
                                : []),
                              {
                                destructive: true,
                                id: 'delete',
                                label: 'Delete',
                                onPress: () => onDelete(item.id),
                              },
                            ]}
                            movable={movable}
                            testID={`item-${item.id}`}
                          >
                            <Section.Item
                              label={item.label}
                              onPress={() => undefined}
                              testID={`row-${item.id}`}
                            />
                          </Sortable.Item>
                        ),
                    )}
                  </Section>
                </Sortable.Group>
              </View>
            )}
          </Sortable.Root>
        )}
      </ScrollInteractionBoundary>
    );
    act(() => {
      renderer = create(list());
    });

    // Layout items with 50pt height so swap thresholds resolve cleanly.
    for (const item of items) {
      const node = renderer!.root.find(
        (n) => n.type === View && n.props.testID === `item-${item.id}`,
      );
      act(() => {
        node.props.onLayout({ nativeEvent: { layout: { height: 50, width: 320 } } });
      });
    }
    return list;
  }

  function itemStyle(id: string) {
    const item = renderer!.root.find(
      (node) => node.type === View && node.props.testID === `item-${id}`,
    );
    return StyleSheet.flatten(item.props.style);
  }

  it('Fork A: holds the overlay and sibling shifts until the moved row commits', async () => {
    const onReorder = jest.fn();
    const onDraggingChange = jest.fn();
    const list = renderList({ onDraggingChange, onReorder });

    // Last rendered Pan gesture per item (3 items -> 3 gestures registered on initial mount)
    const thirdItemGesture = panGesturesByOrder.at(-1)!;
    expect(thirdItemGesture.config.minDuration).toBe(240);

    act(() => thirdItemGesture.onStart?.());
    await flushMicrotasks();
    expect(mockLightHaptic).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findByProps({ testID: 'sortable-root-overlay' })).toBeDefined();

    // Drag upward ~95pt (across two 50pt rows -> target index 0)
    act(() => thirdItemGesture.onUpdate?.({ absoluteY: 120, translationX: 0, translationY: -95 }));
    expect(onDraggingChange).toHaveBeenCalledWith(true);
    expect(mockSelectionHaptic).toHaveBeenCalledTimes(1);
    expect(renderer!.root.findByProps({ testID: 'scroll-surface' }).props['data-dragging']).toBe(
      true,
    );

    // Release -> settles and requests the reorder while waiting for the list commit.
    act(() => thirdItemGesture.onEnd?.({}, true));
    await flushMicrotasks();

    expect(mockLightHaptic).toHaveBeenCalledTimes(2);
    expect(onReorder).toHaveBeenCalledWith({
      fromIndex: 2,
      groupId: 'g1',
      id: 'c',
      toIndex: 0,
    });
    expect(onDraggingChange.mock.calls).toEqual([[true]]);
    expect(renderer!.root.findByProps({ testID: 'sortable-root-overlay' })).toBeDefined();
    expect(itemStyle('a').transform).toEqual([{ translateY: 50 }]);
    expect(itemStyle('c').opacity).toBe(0);

    act(() => renderer!.update(list([items[2], items[0], items[1]])));

    expect(onDraggingChange.mock.calls).toEqual([[true], [false]]);
    expect(renderer!.root.findAllByProps({ testID: 'sortable-root-overlay' })).toHaveLength(0);
    expect(itemStyle('c').opacity).toBe(1);
    expect(itemStyle('a')).toMatchObject({
      opacity: 'animated opacity',
      transform: [{ translateY: 0 }],
    });
  });

  it('clears the drop on the next frame when the reordered group commits without the moved row', async () => {
    jest.useFakeTimers();
    try {
      const onDraggingChange = jest.fn();
      const list = renderList({ onDraggingChange });
      const gesture = panGesturesByOrder[2];
      act(() => gesture.onStart?.());
      await flushMicrotasks();
      act(() => gesture.onUpdate?.({ absoluteY: 120, translationX: 0, translationY: -95 }));
      act(() => gesture.onEnd?.({}, true));

      act(() => renderer!.update(list(items.slice(0, 2), [items[2], items[0], items[1]])));
      expect(renderer!.root.findByProps({ testID: 'sortable-root-overlay' })).toBeDefined();
      expect(onDraggingChange.mock.calls).toEqual([[true]]);

      act(() => jest.advanceTimersByTime(20));
      expect(renderer!.root.findAllByProps({ testID: 'sortable-root-overlay' })).toHaveLength(0);
      expect(onDraggingChange.mock.calls).toEqual([[true], [false]]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears the drop after 400ms when the reorder never updates the group', async () => {
    jest.useFakeTimers();
    try {
      const onDraggingChange = jest.fn();
      renderList({ onDraggingChange });
      const gesture = panGesturesByOrder[2];
      act(() => gesture.onStart?.());
      await flushMicrotasks();
      act(() => gesture.onUpdate?.({ absoluteY: 120, translationX: 0, translationY: -95 }));
      act(() => gesture.onEnd?.({}, true));

      act(() => jest.advanceTimersByTime(399));
      expect(renderer!.root.findByProps({ testID: 'sortable-root-overlay' })).toBeDefined();
      expect(onDraggingChange.mock.calls).toEqual([[true]]);

      act(() => jest.advanceTimersByTime(1));
      expect(renderer!.root.findAllByProps({ testID: 'sortable-root-overlay' })).toHaveLength(0);
      expect(onDraggingChange.mock.calls).toEqual([[true], [false]]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('can drop into a page appended to the group during the drag', async () => {
    const onReorder = jest.fn();
    const list = (ids: string[]) => (
      <Sortable.Root>
        <Sortable.Group estimatedItemHeight={50} groupId="g1" itemIds={ids} onReorder={onReorder}>
          <Sortable.Item id="a" groupId="g1" index={0} estimatedHeight={50}>
            <View />
          </Sortable.Item>
        </Sortable.Group>
      </Sortable.Root>
    );
    act(() => {
      renderer = create(list(['a', 'b']));
    });
    const gesture = panGesturesByOrder.at(-1)!;
    act(() => gesture.onStart?.());
    await flushMicrotasks();
    act(() => gesture.onUpdate?.({ translationX: 0, translationY: 50, absoluteY: 80 }));
    act(() => {
      renderer!.update(list(['a', 'b', 'c', 'd']));
    });
    act(() => gesture.onUpdate?.({ translationX: 0, translationY: 150, absoluteY: 180 }));
    act(() => gesture.onEnd?.({}, true));
    await flushMicrotasks();
    expect(onReorder).toHaveBeenCalledWith({ id: 'a', groupId: 'g1', fromIndex: 0, toIndex: 3 });
  });

  it('Fork B: long-press lift and release within slop opens MenuContent without committing reorder', async () => {
    const onReorder = jest.fn();
    const onMoveToTop = jest.fn();
    renderList({ onMoveToTop, onReorder });

    const secondItemGesture = panGesturesByOrder[1];
    act(() => secondItemGesture.onStart?.());
    await flushMicrotasks();
    act(() => secondItemGesture.onUpdate?.({ absoluteY: 200, translationX: 2, translationY: 3 }));
    act(() => secondItemGesture.onEnd?.({}, true));
    await flushMicrotasks();

    expect(onReorder).not.toHaveBeenCalled();
    const menu = renderer!.root.findByProps({ testID: 'menu-content' });
    expect(menu.props.isOpen).toBe(true);
    expect(menu.props.items.map((item: { id: string }) => item.id)).toEqual([
      'move-to-top',
      'delete',
    ]);

    act(() => menu.props.onClose(menu.props.items[0].onPress));
    expect(onMoveToTop).not.toHaveBeenCalled();
    act(() => menu.props.onClosed());
    expect(onMoveToTop).toHaveBeenCalledWith(1);
  });

  it('cancels gesture when scroll interaction or exclusion blocks recognition, and prevents non-movable drag', async () => {
    const onReorder = jest.fn();
    renderList({ movable: false, onReorder });

    const firstGesture = panGesturesByOrder[0];
    const scrollSurface = renderer!.root.findByProps({ testID: 'scroll-surface' });

    act(() => {
      scrollSurface.props.onScrollBeginDrag({});
      firstGesture.onTouchesDown?.({}, { fail: mockFail });
    });
    expect(mockFail).toHaveBeenCalledTimes(1);

    // Non-movable item moved far past slop closes cleanly without menu or reorder
    act(() => scrollSurface.props.onScrollEndDrag({}));
    act(() => scrollSurface.props.onTouchStart({}));
    act(() => firstGesture.onStart?.());
    await flushMicrotasks();
    act(() => firstGesture.onUpdate?.({ absoluteY: 300, translationX: 0, translationY: 80 }));
    act(() => firstGesture.onEnd?.({}, true));
    await flushMicrotasks();

    expect(onReorder).not.toHaveBeenCalled();
    expect(renderer!.root.findAllByProps({ testID: 'menu-content' })).toHaveLength(0);
  });

  it('exposes accessibility reorder and menu actions without requiring long press', () => {
    const onReorder = jest.fn();
    const onDelete = jest.fn();
    renderList({ onDelete, onReorder });

    const secondRow = renderer!.root.findByProps({ testID: 'row-b' });
    const actions = secondRow.props.accessibilityActions as { label: string; name: string }[];
    expect(actions.map((action) => action.name)).toEqual([
      'sortable-move-up',
      'sortable-move-down',
      'move-to-top',
      'delete',
    ]);

    act(() => {
      secondRow.props.onAccessibilityAction({ nativeEvent: { actionName: 'sortable-move-up' } });
    });
    expect(onReorder).toHaveBeenCalledWith({ fromIndex: 1, groupId: 'g1', id: 'b', toIndex: 0 });

    act(() => {
      secondRow.props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } });
    });
    expect(onDelete).toHaveBeenCalledWith('b');
  });

  it('keeps excluded child controls isolated from long-press recognition', () => {
    const onControlTouch = jest.fn();
    act(() => {
      renderer = create(
        <Sortable.Root>
          <Sortable.Group
            estimatedItemHeight={48}
            groupId="g1"
            itemIds={['only']}
            onReorder={jest.fn()}
          >
            <Sortable.Item groupId="g1" id="only" index={0} testID="item-only">
              <Pressable testID="row-only">
                <Sortable.Exclusion onTouchStart={onControlTouch} testID="switch-box">
                  <Text>Toggle</Text>
                </Sortable.Exclusion>
              </Pressable>
            </Sortable.Item>
          </Sortable.Group>
        </Sortable.Root>,
      );
    });

    const itemWrapper = renderer!.root.find(
      (n) => n.type === View && n.props.testID === 'item-only',
    );
    const exclusion = renderer!.root.find(
      (n) => n.type === View && n.props.testID === 'switch-box',
    );
    const touchEvent = { nativeEvent: { touches: [{}] } };

    act(() => {
      exclusion.props.onTouchStart(touchEvent);
      itemWrapper.props.onTouchStart(touchEvent);
    });

    expect(onControlTouch).toHaveBeenCalledWith(touchEvent);
    expect(panGesturesByOrder.at(-1)?.config.enabled).toBe(false);

    act(() => {
      itemWrapper.props.onTouchEnd({ nativeEvent: { touches: [] } });
    });
    expect(panGesturesByOrder.at(-1)?.config.enabled).toBe(true);
  });
});
