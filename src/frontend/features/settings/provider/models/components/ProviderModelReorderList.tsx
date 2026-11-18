import ArrowDownIcon from '@cherrystudio/app-icons/icons/arrow-down';
import ArrowUpIcon from '@cherrystudio/app-icons/icons/arrow-up';
import MenuIcon from '@cherrystudio/app-icons/icons/menu';
import { Button, ScrollInteractionBoundary } from '@cherrystudio/ui/components';
import { LegendList } from '@legendapp/list/react-native';
import { useNavigation } from 'expo-router';
import {
  type ComponentRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  AppState,
  findNodeHandle,
  View,
  Text,
  type LayoutRectangle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { useListBottomInset } from '@/frontend/components/Selection';
import type { Model } from '@/shared/data/types/model';
import type { Provider } from '@/shared/data/types/provider';
import { isTextGenerationModel } from '@/shared/utils/modelPurpose';

import type { useProviderModelOrder } from '../hooks/useProviderModelOrder';
import { buildProviderModelListItems } from '../utils/providerModelListItems';
import { ProviderModelRow, providerModelRowEstimatedHeights } from './ProviderModelRow';

type Order = ReturnType<typeof useProviderModelOrder>;
type NativeView = ComponentRef<typeof View>;
type RowFrame = { view: NativeView; layout?: LayoutRectangle };
type MeasuredRow = { id: string; left: number; top: number; width: number; height: number };
type Drag = {
  id: string;
  ids: readonly string[];
  models: readonly Model[];
  rows: MeasuredRow[];
  frames: ReadonlyMap<string, RowFrame>;
  isMeasured: boolean;
  isDropping: boolean;
  scroll: number;
  origin: number;
  pointerY?: number;
  measurementTimer?: ReturnType<typeof setTimeout>;
};

// Native measurement may never call back after interruption; keep Done blocked for at most 300ms.
const DROP_MEASUREMENT_TIMEOUT_MS = 300;
// Allow only sub-point rounding differences between native window measurements.
const FRAME_TOLERANCE = 1;

/** Provider-specific bounded drag. No draft changes until a successful release.
 * The active row follows the pointer without timed/spring motion; interruption resets immediately.
 * Reduced motion has the same direct feedback, and arrows provide the complete non-gesture path.
 */
export function ProviderModelReorderList({
  models,
  onDragChange,
  order,
  provider,
}: {
  models: readonly Model[];
  onDragChange: (active: boolean) => void;
  order: Order;
  provider: Provider | undefined;
}) {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const bottomInset = useListBottomInset();
  const viewport = useRef<NativeView>(null);
  const frames = useRef(new Map<string, RowFrame>());
  const scroll = useRef(0);
  const scrolling = useRef(false);
  const momentum = useRef(false);
  const drag = useRef<Drag | undefined>(undefined);
  const focusId = useRef<string | undefined>(undefined);
  const requestMoveFocus = useCallback((id: string | undefined) => {
    focusId.current = id;
  }, []);
  const restoreMoveFocus = useCallback((id: string, view: NativeView | null) => {
    if (focusId.current !== id || !view) return;
    const handle = findNodeHandle(view);
    if (handle != null) AccessibilityInfo.setAccessibilityFocus(handle);
    focusId.current = undefined;
  }, []);
  const [frozenModels, setFrozenModels] = useState<readonly Model[] | null>(null);
  const [targetId, setTargetId] = useState<string>();
  const [overlay, setOverlay] = useState<{ model: Model; top: number } | null>(null);
  const translation = useSharedValue(0);
  const overlayStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translation.value }] }));
  const latest = useRef({ models, order, onDragChange });
  useLayoutEffect(() => {
    latest.current = { models, order, onDragChange };
  });
  const cancelDrag = useCallback(() => {
    clearTimeout(drag.current?.measurementTimer);
    drag.current = undefined;
    setFrozenModels(null);
    setTargetId(undefined);
    setOverlay(null);
    translation.value = 0;
    latest.current.onDragChange(false);
  }, [translation]);
  useEffect(() => navigation.addListener('blur', cancelDrag), [cancelDrag, navigation]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') cancelDrag();
    });
    return () => subscription.remove();
  }, [cancelDrag]);
  useEffect(
    () => () => {
      clearTimeout(drag.current?.measurementTimer);
      drag.current = undefined;
      focusId.current = undefined;
      latest.current.onDragChange(false);
    },
    [],
  );
  const register = useCallback(
    (id: string, view: NativeView | null, layout?: LayoutRectangle) => {
      const captured = drag.current?.frames.get(id);
      const previous = captured?.layout;
      if (
        captured &&
        (!view ||
          captured.view !== view ||
          !layout ||
          !previous ||
          previous.x !== layout.x ||
          previous.y !== layout.y ||
          previous.height !== layout.height ||
          previous.width !== layout.width)
      ) {
        cancelDrag();
      } else if (captured) {
        return;
      }
      if (view) frames.current.set(id, { view, layout: layout && { ...layout } });
      else frames.current.delete(id);
    },
    [cancelDrag],
  );
  const startDrag = useCallback((id: string) => {
    if (drag.current || scrolling.current || momentum.current || latest.current.order.isSaving)
      return false;
    const frame = frames.current.get(id);
    if (!frame?.layout) return false;
    const source = latest.current.models.find((model) => model.id === id);
    if (!source) return false;
    const group = isTextGenerationModel(source);
    const candidates = latest.current.models.flatMap((model) => {
      const row = frames.current.get(model.id);
      return row?.layout && isTextGenerationModel(model) === group ? [{ model, row }] : [];
    });
    if (candidates.length < 2) return false;
    const current: Drag = {
      id,
      models: latest.current.models,
      ids: latest.current.order.draftIds,
      rows: [],
      frames: new Map(candidates.map(({ model, row }) => [model.id, row])),
      isMeasured: false,
      isDropping: false,
      scroll: scroll.current,
      origin: 0,
    };
    drag.current = current;
    setFrozenModels(latest.current.models);
    latest.current.onDragChange(true);
    // onLayout supplies each row's real height. measureInWindow supplies its position through
    // LegendList's recycled/absolute cell wrappers; convert window coordinates into content space.
    viewport.current?.measureInWindow((_x, viewportY, _width, viewportHeight) => {
      if (drag.current !== current) return;
      current.origin = viewportY;
      let pending = candidates.length;
      for (const { model, row } of candidates) {
        row.view.measureInWindow((x, y, width, height) => {
          if (drag.current !== current || scroll.current !== current.scroll) return;
          if (y + height > viewportY && y < viewportY + viewportHeight) {
            current.rows.push({
              id: model.id,
              left: x,
              top: y - viewportY + current.scroll,
              width,
              height,
            });
            if (model.id === id) setOverlay({ model: source, top: y - viewportY });
          }
          pending -= 1;
          if (pending === 0) {
            current.rows.sort((a, b) => a.top - b.top);
            current.isMeasured = true;
          }
        });
      }
    });
    return true;
  }, []);
  const updateDrag = useCallback(
    (id: string, absoluteY: number, translationY: number) => {
      const current = drag.current;
      if (!current || current.id !== id || !current.isMeasured) return;
      const source = current.rows.find((row) => row.id === id);
      if (!source) return;
      const y = absoluteY - current.origin + scroll.current;
      current.pointerY = y;
      const others = current.rows.filter((row) => row.id !== id);
      if (!others.length) return;
      const next = others.find((row) => y < row.top + row.height / 2);
      setTargetId(next?.id ?? others.at(-1)!.id);
      const first = current.rows[0]!;
      const last = current.rows.at(-1)!;
      translation.value = Math.max(
        first.top - source.top,
        Math.min(last.top + last.height - source.top - source.height, translationY),
      );
    },
    [translation],
  );
  const endDrag = useCallback(
    (id: string, success: boolean) => {
      const current = drag.current;
      if (current?.id !== id) return;
      if (!success) {
        cancelDrag();
        return;
      }
      if (current.isDropping) return;
      // A refresh can rebase the hook while these rows are frozen. Discard this gesture rather
      // than applying a destination measured against a different inventory/order.
      const isCurrent = () =>
        drag.current === current &&
        current.models === latest.current.models &&
        current.scroll === scroll.current &&
        current.ids.join('\0') === latest.current.order.draftIds.join('\0') &&
        [...current.frames].every(([rowId, frame]) => frames.current.get(rowId) === frame);
      if (current.pointerY === undefined || !current.isMeasured || !isCurrent()) {
        cancelDrag();
        return;
      }
      current.isDropping = true;
      current.isMeasured = false;
      current.measurementTimer = setTimeout(cancelDrag, DROP_MEASUREMENT_TIMEOUT_MS);
      // Layout events do not cover cell-wrapper movement. Collect a fresh, ordered measurement
      // pass before validating the snapshot or choosing a destination. Await each callback so a
      // delayed earlier candidate cannot be overtaken by measurements of later destinations.
      viewport.current?.measureInWindow((_x, viewportY, _width, viewportHeight) => {
        if (drag.current !== current) return;
        if (!isCurrent() || viewportY !== current.origin) {
          cancelDrag();
          return;
        }
        const candidates = [...current.frames];
        const fresh: MeasuredRow[] = [];
        const measureNext = (index: number) => {
          const candidate = candidates[index];
          if (!candidate) {
            const isConsistent =
              isCurrent() &&
              fresh.length === current.rows.length &&
              fresh.every((row, index) => {
                const captured = current.rows[index]!;
                const previous = fresh[index - 1];
                return (
                  row.id === captured.id &&
                  row.width > 0 &&
                  row.height > 0 &&
                  (!previous ||
                    (previous.top < row.top &&
                      previous.top + previous.height <= row.top + FRAME_TOLERANCE)) &&
                  Math.abs(row.left - captured.left) < FRAME_TOLERANCE &&
                  Math.abs(row.top - captured.top) < FRAME_TOLERANCE &&
                  Math.abs(row.width - captured.width) < FRAME_TOLERANCE &&
                  Math.abs(row.height - captured.height) < FRAME_TOLERANCE
                );
              });
            try {
              focusId.current = undefined;
              if (isConsistent) {
                const others = fresh.filter((row) => row.id !== id);
                const next = others.find((row) => current.pointerY! < row.top + row.height / 2);
                const last = others.at(-1);
                if (fresh.some((row) => row.id === id) && last) {
                  const target = next ? { before: next.id } : { after: last.id };
                  requestMoveFocus(latest.current.order.moveModel(id, target) ? id : undefined);
                }
              }
            } finally {
              cancelDrag();
            }
            return;
          }
          const [rowId, frame] = candidate;
          frame.view.measureInWindow((x, y, width, height) => {
            if (drag.current !== current) return;
            if (y + height > viewportY && y < viewportY + viewportHeight)
              fresh.push({
                id: rowId,
                left: x,
                top: y - viewportY + current.scroll,
                width,
                height,
              });
            measureNext(index + 1);
          });
        };
        measureNext(0);
      });
    },
    [cancelDrag, requestMoveFocus],
  );
  const items = useMemo(
    () => buildProviderModelListItems(frozenModels ?? models, true),
    [frozenModels, models],
  );
  return (
    <View className="flex-1" ref={viewport} onLayout={cancelDrag}>
      <ScrollInteractionBoundary
        onScrollBeginDrag={() => {
          scrolling.current = true;
          cancelDrag();
        }}
        onScrollEndDrag={() => {
          scrolling.current = false;
        }}
        onMomentumScrollBegin={() => {
          momentum.current = true;
          cancelDrag();
        }}
        onMomentumScrollEnd={() => {
          momentum.current = false;
        }}
      >
        {(scrollHandlers) => (
          <LegendList
            {...scrollHandlers}
            data={items}
            extraData={{
              order,
              targetId,
              activeId: overlay?.model.id,
              isDragging: Boolean(frozenModels),
            }}
            keyExtractor={(item) => item.key}
            getItemType={(item) => item.type}
            estimatedItemSize={providerModelRowEstimatedHeights.management}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={{ paddingBottom: bottomInset }}
            maintainVisibleContentPosition={false}
            recycleItems={false}
            scrollEnabled={!frozenModels && !order.isSaving}
            onScroll={(event) => {
              const offset = event.nativeEvent.contentOffset.y;
              if (drag.current && offset !== scroll.current) cancelDrag();
              scroll.current = offset;
            }}
            scrollEventThrottle={16}
            renderItem={({ item }) =>
              item.type === 'section' ? (
                <View className="px-4 pt-3 pb-2">
                  <Text className="font-medium text-foreground-tertiary text-sm">
                    {t(
                      item.purpose === 'chat'
                        ? 'settings.provider.models.section.chat'
                        : 'settings.provider.models.section.painting',
                    )}
                  </Text>
                </View>
              ) : (
                <ReorderModelRow
                  key={item.model.id}
                  model={item.model}
                  provider={provider}
                  order={order}
                  disabled={order.isSaving || Boolean(frozenModels)}
                  isTarget={targetId === item.model.id}
                  register={register}
                  isActive={overlay?.model.id === item.model.id}
                  onStart={startDrag}
                  onUpdate={updateDrag}
                  onEnd={endDrag}
                  requestMoveFocus={requestMoveFocus}
                  restoreMoveFocus={restoreMoveFocus}
                />
              )
            }
            style={{ flex: 1 }}
          />
        )}
      </ScrollInteractionBoundary>
      {overlay ? (
        <Animated.View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          className="absolute right-0 left-0 bg-background"
          style={[{ top: overlay.top }, overlayStyle]}
        >
          <ProviderModelRow model={overlay.model} provider={provider} variant="management">
            <View className="flex-row items-center">
              <Button disabled variant="ghost" icon={<ArrowUpIcon />} />
              <Button disabled variant="ghost" icon={<ArrowDownIcon />} />
              <View className="min-h-11 min-w-11 items-center justify-center">
                <MenuIcon className="size-5 text-muted-foreground" />
              </View>
            </View>
          </ProviderModelRow>
        </Animated.View>
      ) : null}
    </View>
  );
}

function ReorderModelRow({
  model,
  provider,
  order,
  disabled,
  isTarget,
  isActive,
  register,
  onStart,
  onUpdate,
  onEnd,
  requestMoveFocus,
  restoreMoveFocus,
}: {
  model: Model;
  provider: Provider | undefined;
  order: Order;
  disabled: boolean;
  isTarget: boolean;
  isActive: boolean;
  register: (id: string, view: NativeView | null, layout?: LayoutRectangle) => void;
  onStart: (id: string) => boolean;
  onUpdate: (id: string, absoluteY: number, translationY: number) => void;
  onEnd: (id: string, success: boolean) => void;
  requestMoveFocus: (id: string | undefined) => void;
  restoreMoveFocus: (id: string, view: NativeView | null) => void;
}) {
  const { t } = useTranslation();
  const view = useRef<NativeView>(null);
  const layout = useRef<LayoutRectangle | undefined>(undefined);
  const handle = useRef<NativeView>(null);
  const { position, total } = order.positionOf(model.id);
  const canMoveUp = order.canMoveUp(model.id);
  const canMoveDown = order.canMoveDown(model.id);
  const accessibilityValue = {
    min: 1,
    max: total,
    now: position,
    text: t('settings.provider.models.reorder.step', { position, total }),
  };
  useLayoutEffect(() => {
    restoreMoveFocus(model.id, handle.current);
  });
  // Construct callbacks outside render; the list owns all event-time drag state.
  const gesture = useMemo(
    () => createReorderGesture(model.id, !order.isSaving && total > 1, onStart, onUpdate, onEnd),
    [model.id, onEnd, onStart, onUpdate, order.isSaving, total],
  );
  // Ref registration follows identity changes, including recycled cells. onLayout alone
  // does not fire again when a recycled cell happens to have the same dimensions.
  useLayoutEffect(() => {
    register(model.id, view.current, layout.current);
    return () => register(model.id, null);
  }, [model.id, register]);
  return (
    <View
      ref={view}
      className={isTarget ? 'bg-secondary' : 'bg-background'}
      style={{ opacity: isActive ? 0 : 1 }}
      onLayout={(event) => {
        layout.current = event.nativeEvent.layout;
        register(model.id, view.current, layout.current);
      }}
    >
      <ProviderModelRow model={model} provider={provider} variant="management">
        <View className="flex-row items-center">
          <Button
            size="default"
            variant="ghost"
            disabled={disabled || !canMoveUp}
            accessibilityValue={accessibilityValue}
            accessibilityLabel={t('settings.provider.models.reorder.moveUp', { model: model.name })}
            onPress={() => {
              requestMoveFocus(order.moveUp(model.id) ? model.id : undefined);
            }}
            icon={<ArrowUpIcon />}
          />
          <Button
            size="default"
            variant="ghost"
            disabled={disabled || !canMoveDown}
            accessibilityValue={accessibilityValue}
            accessibilityLabel={t('settings.provider.models.reorder.moveDown', {
              model: model.name,
            })}
            onPress={() => {
              requestMoveFocus(order.moveDown(model.id) ? model.id : undefined);
            }}
            icon={<ArrowDownIcon />}
          />
          {total > 1 ? (
            <GestureDetector gesture={gesture}>
              <View
                ref={handle}
                className="min-h-11 min-w-11 items-center justify-center"
                accessible
                accessibilityRole="adjustable"
                accessibilityLabel={t('settings.provider.models.reorder.dragHandle', {
                  model: model.name,
                })}
                accessibilityState={{ disabled }}
                accessibilityValue={accessibilityValue}
                accessibilityActions={[
                  ...(!disabled && canMoveUp
                    ? [
                        {
                          name: 'decrement',
                          label: t('settings.provider.models.reorder.moveUp', {
                            model: model.name,
                          }),
                        },
                      ]
                    : []),
                  ...(!disabled && canMoveDown
                    ? [
                        {
                          name: 'increment',
                          label: t('settings.provider.models.reorder.moveDown', {
                            model: model.name,
                          }),
                        },
                      ]
                    : []),
                ]}
                onAccessibilityAction={({ nativeEvent }) => {
                  const didMove =
                    !disabled &&
                    (nativeEvent.actionName === 'decrement'
                      ? order.moveUp(model.id)
                      : nativeEvent.actionName === 'increment' && order.moveDown(model.id));
                  requestMoveFocus(didMove ? model.id : undefined);
                }}
              >
                <MenuIcon className="size-5 text-muted-foreground" />
              </View>
            </GestureDetector>
          ) : null}
        </View>
      </ProviderModelRow>
    </View>
  );
}

function createReorderGesture(
  id: string,
  enabled: boolean,
  onStart: (id: string) => boolean,
  onUpdate: (id: string, absoluteY: number, translationY: number) => void,
  onEnd: (id: string, success: boolean) => void,
) {
  return Gesture.Pan()
    .enabled(enabled)
    .maxPointers(1)
    .runOnJS(true)
    .onStart(() => {
      onStart(id);
    })
    .onUpdate((event) => {
      onUpdate(id, event.absoluteY, event.translationY);
    })
    .onEnd((_event, success) => {
      onEnd(id, success);
    })
    .onFinalize((_event, success) => {
      if (!success) onEnd(id, false);
    });
}
