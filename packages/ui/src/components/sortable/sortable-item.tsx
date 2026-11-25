import {
  cloneElement,
  isValidElement,
  type ReactElement,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import {
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
  type LayoutChangeEvent,
  type ViewInstance,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { duration, easing, spring } from '../../motion';
import {
  ContextMenuExclusionContext,
  useContextMenuTouch,
} from '../menu/context-menu/context-menu-exclusion';
import type { MenuItem } from '../menu/menu.types';
import { useScrollInteraction } from '../scroll-interaction/scroll-interaction-context';
import type { SectionItemComponent, SectionItemPressProps } from '../section/section';
import { useSortableContext, useSortableGroupContext } from './sortable-context';
import {
  computeSiblingShift,
  SORTABLE_CHROME_DIM_OPACITY,
  SORTABLE_LONG_PRESS_MS,
  SORTABLE_SIBLING_DIM_OPACITY,
} from './sortable-geometry';
import type { SortableAccessibilityLabels, SortableItemProps } from './sortable.types';

type ChildForwardedProps = SectionItemPressProps & {
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
};

type InternalSortableItemProps = SortableItemProps & SectionItemPressProps;

const EMPTY_MENU_ITEMS: readonly MenuItem[] = [];

/**
 * Interactive row inside `Sortable.Root`:
 * holds ~240ms to lift with focus/dim siblings -> drag to reorder (Fork A) or release for menu (Fork B).
 */
function SortableItemBase({
  accessibilityLabels,
  children,
  disabled = false,
  estimatedHeight,
  groupId,
  groupSize,
  id,
  index,
  menuItems = EMPTY_MENU_ITEMS,
  movable = true,
  onPressedChange,
  renderOverlay,
  testID,
}: InternalSortableItemProps) {
  const sortable = useSortableContext();
  const groupContext = useSortableGroupContext();
  const reducedMotion = useReducedMotion() ?? false;
  const scrollInteraction = useScrollInteraction();
  const touch = useContextMenuTouch();
  const touchInteraction = touch.interaction;

  const isGestureEnabled =
    sortable !== null && !disabled && !touch.isTouchExcluded && (movable || menuItems.length > 0);

  const buildOverlay = useCallback(
    () => (renderOverlay ? renderOverlay() : children),
    [children, renderOverlay],
  );

  const [binding] = useState(() => ({
    hasEnded: false,
    latest: {
      buildOverlay,
      estimatedHeight,
      groupId,
      id,
      index,
      menuItems,
      movable,
    },
    measuredHeight: estimatedHeight ?? 48,
    measuredWidth: 0,
    view: null as ViewInstance | null,
  }));

  useLayoutEffect(() => {
    binding.latest = {
      buildOverlay,
      estimatedHeight,
      groupId,
      id,
      index,
      menuItems,
      movable,
    };
    sortable?.notifyItemCommitted(groupId, id, index);
  }, [binding, buildOverlay, estimatedHeight, groupId, id, index, menuItems, movable, sortable]);

  const handleItemRef = useCallback(
    (node: ViewInstance | null) => {
      binding.view = node;
    },
    [binding],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { height, width } = event.nativeEvent.layout;
      binding.measuredHeight = height;
      binding.measuredWidth = width;
      sortable?.reportItemHeight(binding.latest.groupId, binding.latest.id, height);
    },
    [binding, sortable],
  );

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(SORTABLE_LONG_PRESS_MS)
        .maxPointers(1)
        .shouldCancelWhenOutside(false)
        .enabled(isGestureEnabled)
        .runOnJS(true)
        .onTouchesDown((_event, manager) => {
          if (scrollInteraction?.isActive() || touchInteraction.isRecognitionBlocked()) {
            manager.fail();
          }
        })
        .onStart(() => {
          if (
            !sortable ||
            scrollInteraction?.isRecognitionBlocked() ||
            touchInteraction.isRecognitionBlocked()
          ) {
            return;
          }
          binding.hasEnded = false;
          const current = binding.latest;
          sortable.activateLongPress({
            estimatedHeight: current.estimatedHeight,
            groupId: current.groupId,
            id: current.id,
            index: current.index,
            measuredHeight: binding.measuredHeight,
            measuredWidth: binding.measuredWidth,
            menuItems: current.menuItems,
            movable: current.movable,
            renderOverlay: current.buildOverlay,
            view: binding.view,
          });
        })
        .onUpdate((event) => {
          sortable?.updateDrag(event.translationX, event.translationY, event.absoluteY);
        })
        .onEnd((_event, success) => {
          binding.hasEnded = true;
          sortable?.finishGesture(success);
        })
        .onFinalize((_event, success) => {
          if (!binding.hasEnded) {
            binding.hasEnded = true;
            sortable?.finishGesture(success);
          }
        }),
    [binding, isGestureEnabled, scrollInteraction, sortable, touchInteraction],
  );

  const animatedStyle = useAnimatedStyle(() => {
    if (!sortable) {
      return { opacity: 1, transform: [{ translateY: 0 }] };
    }

    const activeGroup = sortable.activeGroupIdSV.value;
    if (activeGroup === null) {
      const instantOpacity = reducedMotion || sortable.lastSettledIdSV.value === id;
      return {
        opacity: instantOpacity
          ? 1
          : withTiming(1, { duration: duration.fast, easing: easing.settle }),
        transform: [{ translateY: 0 }],
      };
    }

    if (activeGroup !== groupId) {
      return {
        opacity: reducedMotion
          ? SORTABLE_CHROME_DIM_OPACITY
          : withTiming(SORTABLE_CHROME_DIM_OPACITY, {
              duration: duration.fast,
              easing: easing.settle,
            }),
        transform: [{ translateY: 0 }],
      };
    }

    if (sortable.activeIdSV.value === id) {
      return { opacity: 0, transform: [{ translateY: 0 }] };
    }

    const shift = computeSiblingShift(
      index,
      sortable.activeIndexSV.value,
      sortable.hoverIndexSV.value,
      sortable.activeHeightSV.value,
    );

    return {
      opacity: reducedMotion
        ? SORTABLE_SIBLING_DIM_OPACITY
        : withTiming(SORTABLE_SIBLING_DIM_OPACITY, {
            duration: duration.fast,
            easing: easing.settle,
          }),
      transform: [{ translateY: reducedMotion ? shift : withSpring(shift, spring.settle) }],
    };
  }, [groupId, id, index, reducedMotion, sortable]);

  const groupCount =
    groupSize ??
    (groupContext?.groupId === groupId ? groupContext.groupSize : undefined) ??
    sortable?.getGroupItemCount(groupId) ??
    0;
  const enhancedChild = enhanceChildWithSortableProps(children, {
    accessibilityLabels,
    groupCount,
    index,
    menuItems,
    movable: !disabled && movable,
    onAccessibilityReorder: (toIndex) =>
      sortable?.commitAccessibilityMove(groupId, id, index, toIndex),
    onPressedChange,
  });

  return (
    <ContextMenuExclusionContext value={touch.excludeTouch}>
      <GestureDetector gesture={gesture}>
        <Animated.View
          collapsable={false}
          onLayout={handleLayout}
          onTouchCancel={touch.onTouchCancel}
          onTouchEnd={touch.onTouchFinish}
          onTouchStart={touch.onTouchStart}
          ref={handleItemRef}
          style={animatedStyle}
          testID={testID}
        >
          {enhancedChild}
        </Animated.View>
      </GestureDetector>
    </ContextMenuExclusionContext>
  );
}

export const SortableItem = Object.assign(SortableItemBase, {}) as typeof SortableItemBase &
  SectionItemComponent;
SortableItem.sectionItem = true;

function enhanceChildWithSortableProps(
  child: ReactElement,
  options: {
    accessibilityLabels?: SortableAccessibilityLabels;
    groupCount: number;
    index: number;
    menuItems: readonly MenuItem[];
    movable: boolean;
    onAccessibilityReorder: (toIndex: number) => void;
    onPressedChange?: (isPressed: boolean) => void;
  },
): ReactElement {
  if (!isValidElement<ChildForwardedProps>(child)) {
    return child;
  }

  const actionableMenuItems = options.menuItems.filter((item) => !item.disabled);
  const existingActions = child.props.accessibilityActions ?? [];
  const menuNames = new Set(options.menuItems.map((item) => item.id));
  const sortableActions: AccessibilityActionInfo[] = [];

  if (options.movable) {
    if (
      options.index > 0 &&
      options.accessibilityLabels?.moveToTop &&
      !menuNames.has('move-to-top')
    ) {
      sortableActions.push({
        label: options.accessibilityLabels.moveToTop,
        name: 'sortable-move-to-top',
      });
    }
    if (options.index > 0 && options.accessibilityLabels?.moveUp) {
      sortableActions.push({ label: options.accessibilityLabels.moveUp, name: 'sortable-move-up' });
    }
    if (options.index < options.groupCount - 1 && options.accessibilityLabels?.moveDown) {
      sortableActions.push({
        label: options.accessibilityLabels.moveDown,
        name: 'sortable-move-down',
      });
    }
  }

  const sortableActionNames = new Set([
    ...menuNames,
    'sortable-move-to-top',
    'sortable-move-up',
    'sortable-move-down',
  ]);
  const mergedActions: AccessibilityActionInfo[] = [
    ...existingActions.filter((action) => !sortableActionNames.has(action.name)),
    ...sortableActions,
    ...actionableMenuItems.map((item) => ({ label: item.label, name: item.id })),
  ];

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    const { actionName } = event.nativeEvent;
    if (actionName === 'sortable-move-to-top') {
      options.onAccessibilityReorder(0);
      return;
    }
    if (actionName === 'sortable-move-up') {
      options.onAccessibilityReorder(options.index - 1);
      return;
    }
    if (actionName === 'sortable-move-down') {
      options.onAccessibilityReorder(options.index + 1);
      return;
    }

    const menuItem = actionableMenuItems.find((item) => item.id === actionName);
    if (menuItem) {
      menuItem.onPress();
      return;
    }

    child.props.onAccessibilityAction?.(event);
  };

  return cloneElement(child, {
    ...(mergedActions.length > 0
      ? {
          accessibilityActions: mergedActions,
          onAccessibilityAction: handleAccessibilityAction,
        }
      : {}),
    ...(options.onPressedChange && child.props.onPressedChange === undefined
      ? { onPressedChange: options.onPressedChange }
      : {}),
  });
}
