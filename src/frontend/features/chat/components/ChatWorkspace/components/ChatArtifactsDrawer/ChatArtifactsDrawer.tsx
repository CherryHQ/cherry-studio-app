import BoxIcon from '@cherrystudio/app-icons/icons/box';
import CheckIcon from '@cherrystudio/app-icons/icons/check';
import MonitorIcon from '@cherrystudio/app-icons/icons/monitor';
import {
  BackgroundPressExclusion,
  FileBrowserRow,
  ShimmerText,
  Skeleton,
} from '@cherrystudio/ui/components';
import { haptics } from '@cherrystudio/ui/haptics';
import { duration, easing, spring } from '@cherrystudio/ui/motion';
import { useIsFocused } from 'expo-router';
import { use, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, type LayoutChangeEvent, Pressable, ScrollView, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  cancelAnimation,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useFocusedBackPress } from '@/frontend/appShell/navigation';
import {
  OpenRemoteSessionSheetContext,
  type RemoteSessionSheetTarget,
} from '@/frontend/appShell/navigation/chat';
import {
  FileEntrySkeleton,
  LoadedFileEntryPreview,
  useOpenFileEntry,
  useResolvedFile,
} from '@/frontend/components/FileEntryPreview';
import {
  DESKTOP_TASK_PIP_STATUS_KEYS,
  type DesktopTaskPipViewModel,
  type MessageListItem,
  useDesktopTaskPipViews,
} from '@/frontend/components/Message';
import { queryKeys, useQuery } from '@/frontend/data';
import { cacheService } from '@/frontend/data/CacheService';
import { useBreathingOpacity } from '@/frontend/hooks/useBreathingOpacity';
import type { ChatArtifactsHandleDock } from '@/shared/data/cache/cacheSchemas';
import { desktopTaskPipTargetKey } from '@/shared/utils/desktopTaskPipModel';

import {
  avoidTurnDirectoryY,
  clampHandleY,
  DEFAULT_HANDLE_DOCK,
  HANDLE_HEIGHT,
  HANDLE_WIDTH,
  ratioToY,
  resolvePopoverPosition,
  resolveSnapSide,
  yToRatio,
} from './chatArtifactsDrawerLayout';
import {
  type ChatArtifactsRemoteSession,
  isRemoteDispatchActive,
  reconcileChatArtifactsDrawer,
} from './chatArtifactsDrawerModel';

const DOCK_CACHE_KEY = 'chat.artifacts_handle_dock';
const TUCK_DELAY = 2200;
const PANEL_MAX_HEIGHT = 410;
const HANDLE_SIZE = { width: HANDLE_WIDTH, height: HANDLE_HEIGHT };
const BAR_SIZE = { width: 4.5, height: 40 };
const FILE_PREVIEW_SIZE = 40;
const MORPH = { duration: duration.fast, easing: easing.inOut };

function persistDock(dock: NonNullable<ChatArtifactsHandleDock>) {
  cacheService.setPersist(DOCK_CACHE_KEY, dock);
  haptics.light();
}

type DrawerPositionProps = {
  bottomAccessoryHeight: SharedValue<number>;
  contentBottomInset: number;
  contentTopInset: number;
  dockLift?: SharedValue<number>;
  hasTurnDirectory: boolean;
  keyboardOffset: number;
};

export function ChatArtifactsDrawer({
  sessionId,
  messages,
  ...position
}: DrawerPositionProps & {
  sessionId: string;
  messages: readonly MessageListItem[];
}) {
  const { data } = useQuery('/agent-sessions/:sessionId/messages/resources', {
    params: { sessionId },
    queryKey: [...queryKeys.agentSessions.messages(sessionId), 'resources'],
  });
  const { remoteSessions, fileEntryIds } = useMemo(
    () => reconcileChatArtifactsDrawer(data, messages),
    [data, messages],
  );
  if (!remoteSessions.length && !fileEntryIds.length) return null;
  return (
    <ArtifactsHandle {...position} fileEntryIds={fileEntryIds} remoteSessions={remoteSessions} />
  );
}

function ArtifactsHandle({
  bottomAccessoryHeight,
  contentBottomInset,
  contentTopInset,
  dockLift,
  fileEntryIds,
  hasTurnDirectory,
  keyboardOffset,
  remoteSessions,
}: DrawerPositionProps & {
  fileEntryIds: string[];
  remoteSessions: ChatArtifactsRemoteSession[];
}) {
  const { t } = useTranslation();
  const isFocused = useIsFocused();
  const views = useDesktopTaskPipViews(remoteSessions);
  // A recovered draft can now point to a session already present in the list.
  const sessionsByKey = new Map<string, DesktopTaskPipViewModel>();
  for (const view of views) {
    const key = desktopTaskPipTargetKey(view);
    if (key && !sessionsByKey.has(key)) sessionsByKey.set(key, view);
  }
  const sessions = [...sessionsByKey.values()];
  const [initialDock] = useState(
    () => cacheService.getPersist(DOCK_CACHE_KEY) ?? DEFAULT_HANDLE_DOCK,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [popoverHeight, setPopoverHeight] = useState(0);
  const reducedMotion = useReducedMotion();
  const { height: keyboardHeight, progress: keyboardProgress } = useReanimatedKeyboardAnimation();
  const edgeProgress = useSharedValue(initialDock.side === 'left' ? 0 : 1);
  const dockRatio = useSharedValue(initialDock.yRatio);
  const panOffsetX = useSharedValue(0);
  const panOffsetY = useSharedValue(0);
  const dragStart = useSharedValue({ x: 0, y: 0 });
  const wakeProgress = useSharedValue(0);
  const breath = useBreathingOpacity({
    active: isFocused && !isOpen && sessions.some((view) => isRemoteDispatchActive(view.state)),
  });
  const { width, height } = viewport;
  const maxX = Math.max(0, width - HANDLE_WIDTH);
  const minY = contentTopInset + 12;
  const bottomClearance = useDerivedValue(
    () =>
      bottomAccessoryHeight.get() +
      (dockLift?.get() ??
        Math.max(0, -keyboardHeight.get() - keyboardProgress.get() * keyboardOffset)),
  );
  const bottomY = useDerivedValue(() =>
    Math.max(minY, height - contentBottomInset - bottomClearance.get() - 12),
  );
  const maxY = useDerivedValue(() => Math.max(minY, bottomY.get() - HANDLE_HEIGHT));
  const turnDirectoryInset = width >= 832 ? Math.max(8, Math.floor((width - 720) / 2) - 24) : 2;
  // The directory adds 8 points of hit slop beyond its visual trigger.
  const rightDockHasRail = hasTurnDirectory && turnDirectoryInset < HANDLE_WIDTH + 8;
  const railCenter = useDerivedValue(
    () => (minY + height - Math.max(contentBottomInset, 12) - 16 - bottomClearance.get()) / 2,
  );
  const dockX = useDerivedValue(() => edgeProgress.get() * maxX);
  const dockY = useDerivedValue(() => {
    const y = ratioToY(dockRatio.get(), minY, maxY.get());
    return rightDockHasRail && edgeProgress.get() === 1
      ? avoidTurnDirectoryY(y, railCenter.get(), minY, maxY.get())
      : y;
  });

  const handlePosition = useAnimatedStyle(() => ({
    transform: [
      { translateX: clampHandleY(dockX.get() + panOffsetX.get(), 0, maxX) },
      { translateY: clampHandleY(dockY.get() + panOffsetY.get(), minY, maxY.get()) },
    ],
    display: bottomY.get() - minY >= HANDLE_HEIGHT ? 'flex' : 'none',
  }));
  const barStyle = useAnimatedStyle(() => ({
    opacity: (1 - wakeProgress.get()) * breath.get(),
    transform: [{ translateX: (HANDLE_WIDTH - BAR_SIZE.width - 10) * edgeProgress.get() }],
  }));
  const capsuleStyle = useAnimatedStyle(() => ({
    opacity: wakeProgress.get(),
    transform: [{ scale: 0.9 + 0.1 * wakeProgress.get() }],
  }));
  const panelPosition = useAnimatedStyle(() => {
    const position = resolvePopoverPosition({
      side: edgeProgress.get() === 0 ? 'left' : 'right',
      handleY: dockY.get(),
      containerWidth: width,
      minY,
      maxY: bottomY.get(),
      popoverHeight,
    });
    return {
      ...position,
      maxHeight: Math.min(PANEL_MAX_HEIGHT, position.maxHeight),
      opacity: popoverHeight > 0 && position.maxHeight > 0 ? 1 : 0,
    };
  });

  const wake = useCallback(() => {
    'worklet';
    cancelAnimation(wakeProgress);
    wakeProgress.set(withTiming(1, MORPH));
  }, [wakeProgress]);
  const tuck = useCallback(() => {
    'worklet';
    cancelAnimation(wakeProgress);
    // Keep the dwell under Reduce Motion, then switch to the resting bar immediately.
    wakeProgress.set(withDelay(TUCK_DELAY, withTiming(0, MORPH), ReduceMotion.Never));
  }, [wakeProgress]);
  const open = useCallback(() => {
    wake();
    setPopoverHeight(0);
    Keyboard.dismiss();
    haptics.light();
    setIsOpen(true);
  }, [setIsOpen, setPopoverHeight, wake]);
  const close = useCallback(() => {
    setIsOpen(false);
    tuck();
  }, [setIsOpen, tuck]);
  useFocusedBackPress(close, isOpen);

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .minDistance(6)
      .maxPointers(1)
      .onStart(() => {
        'worklet';
        wake();
        cancelAnimation(panOffsetX);
        cancelAnimation(panOffsetY);
        dragStart.set({
          x: clampHandleY(dockX.get() + panOffsetX.get(), 0, maxX),
          y: clampHandleY(dockY.get() + panOffsetY.get(), minY, maxY.get()),
        });
      })
      .onUpdate(({ translationX, translationY }) => {
        'worklet';
        const start = dragStart.get();
        panOffsetX.set(start.x + translationX - dockX.get());
        panOffsetY.set(start.y + translationY - dockY.get());
      })
      .onEnd(({ velocityX, velocityY }, success) => {
        'worklet';
        if (success) {
          const x = clampHandleY(dockX.get() + panOffsetX.get(), 0, maxX);
          const y = clampHandleY(dockY.get() + panOffsetY.get(), minY, maxY.get());
          const side = resolveSnapSide(x + HANDLE_WIDTH / 2, velocityX, width);
          const nextY =
            side === 'right' && rightDockHasRail
              ? avoidTurnDirectoryY(y, railCenter.get(), minY, maxY.get())
              : y;
          const yRatio = yToRatio(nextY, minY, maxY.get());
          edgeProgress.set(side === 'left' ? 0 : 1);
          dockRatio.set(yRatio);
          panOffsetX.set(x - (side === 'right' ? maxX : 0));
          panOffsetY.set(y - nextY);
          scheduleOnRN(persistDock, { side, yRatio });
        }
        panOffsetX.set(
          reducedMotion
            ? 0
            : withSpring(0, { ...spring.settle, velocity: success ? velocityX : 0 }),
        );
        panOffsetY.set(
          reducedMotion
            ? 0
            : withSpring(0, { ...spring.settle, velocity: success ? velocityY : 0 }),
        );
        tuck();
      });
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((_event, success) => {
        if (success) open();
      });
    return Gesture.Race(pan, tap);
  }, [
    dockRatio,
    dockX,
    dockY,
    dragStart,
    edgeProgress,
    maxX,
    maxY,
    minY,
    open,
    panOffsetX,
    panOffsetY,
    railCenter,
    reducedMotion,
    rightDockHasRail,
    tuck,
    wake,
    width,
  ]);

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setViewport((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  }

  return (
    <View
      className={isOpen ? 'absolute inset-0 z-10' : 'absolute inset-0'}
      onLayout={onLayout}
      pointerEvents="box-none"
    >
      {isOpen ? (
        <>
          <BackgroundPressExclusion className="absolute inset-0">
            <Pressable
              accessible={false}
              className="absolute inset-0"
              onPress={close}
              testID="chat-artifacts-backdrop"
            />
          </BackgroundPressExclusion>
          <Animated.View
            accessibilityViewIsModal
            className="absolute top-0 left-0 max-w-full rounded-3xl border border-border-subtle bg-popover shadow-md"
            onLayout={(event) => setPopoverHeight(event.nativeEvent.layout.height)}
            style={panelPosition}
            testID="chat-artifacts-popover"
          >
            <DrawerSections fileEntryIds={fileEntryIds} onClose={close} sessions={sessions} />
          </Animated.View>
        </>
      ) : width > 0 ? (
        <Animated.View className="absolute top-0 left-0" style={[HANDLE_SIZE, handlePosition]}>
          <BackgroundPressExclusion>
            <GestureDetector gesture={gesture}>
              <View
                accessible
                accessibilityActions={[{ name: 'activate' }]}
                accessibilityHint={t('chat.artifactsDrawer.handleHint')}
                accessibilityLabel={t('chat.artifactsDrawer.open')}
                accessibilityRole="button"
                accessibilityState={{ expanded: false }}
                onAccessibilityAction={(event) => {
                  if (event.nativeEvent.actionName === 'activate') open();
                }}
                className="items-center justify-center"
                collapsable={false}
                style={HANDLE_SIZE}
                testID="chat-artifacts-handle"
              >
                <Animated.View
                  className="absolute left-[5px] rounded-full bg-foreground"
                  style={[BAR_SIZE, barStyle]}
                />
                <Animated.View
                  className="h-11 w-9 items-center justify-center rounded-2xl border border-border-subtle bg-popover shadow-sm"
                  style={capsuleStyle}
                >
                  <BoxIcon className="size-4 text-foreground" />
                </Animated.View>
              </View>
            </GestureDetector>
          </BackgroundPressExclusion>
        </Animated.View>
      ) : null}
    </View>
  );
}

function DrawerSections({
  fileEntryIds,
  onClose,
  sessions,
}: {
  fileEntryIds: readonly string[];
  onClose(): void;
  sessions: readonly DesktopTaskPipViewModel[];
}) {
  const { t, i18n } = useTranslation();
  const openSheet = use(OpenRemoteSessionSheetContext);
  const { openFileEntry } = useOpenFileEntry();
  const dateFormatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <BackgroundPressExclusion className="shrink overflow-hidden rounded-3xl">
      <ScrollView
        className="shrink"
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator={false}
      >
        {sessions.length > 0 ? (
          <View className="px-2 py-2">
            <Text
              accessibilityRole="header"
              className="px-2 font-medium text-xs text-muted-foreground"
            >
              {t('chat.artifactsDrawer.remoteSection')}
            </Text>
            {sessions.map((view) => (
              <RemoteSessionRow
                key={desktopTaskPipTargetKey(view)}
                view={view}
                onOpen={
                  openSheet &&
                  ((target) => {
                    onClose();
                    openSheet(target);
                  })
                }
              />
            ))}
          </View>
        ) : null}
        {fileEntryIds.length > 0 ? (
          <View
            className={
              sessions.length > 0 ? 'border-border-subtle border-t px-4 py-2' : 'px-4 py-2'
            }
          >
            <Text accessibilityRole="header" className="font-medium text-xs text-muted-foreground">
              {t('chat.artifactsDrawer.artifactsSection')}
            </Text>
            {fileEntryIds.map((fileEntryId) => (
              <ArtifactFileRow
                key={fileEntryId}
                fileEntryId={fileEntryId}
                dateFormatter={dateFormatter}
                onOpen={(file) => {
                  onClose();
                  openFileEntry(file);
                }}
              />
            ))}
          </View>
        ) : null}
      </ScrollView>
    </BackgroundPressExclusion>
  );
}

function RemoteSessionRow({
  view,
  onOpen,
}: {
  view: DesktopTaskPipViewModel;
  onOpen?: (target: RemoteSessionSheetTarget) => void;
}) {
  const { t } = useTranslation();
  const { state, connectionId, agentId, sessionId, draftId, operationId } = view;
  const target = connectionId
    ? sessionId
      ? { connectionId, agentId, sessionId }
      : draftId
        ? { connectionId, agentId, draftId, operationId }
        : undefined
    : undefined;
  const title = view.title ?? t('desktopDispatch.tool.dispatchTask');
  const status = t(DESKTOP_TASK_PIP_STATUS_KEYS[state]);
  return (
    <Pressable
      accessibilityLabel={`${title}, ${status}`}
      accessibilityRole="button"
      className="min-h-11 flex-row items-center gap-2 rounded-xl px-2 active:bg-secondary"
      disabled={!target || !onOpen}
      onPress={() => target && onOpen?.(target)}
    >
      <MonitorIcon className="size-4 shrink-0 text-muted-foreground" />
      <Text className="min-w-0 flex-1 font-medium text-sm text-foreground" numberOfLines={1}>
        {title}
      </Text>
      {state === 'running' ? (
        <ShimmerText className="max-w-[50%] font-medium text-xs" numberOfLines={1}>
          {status}
        </ShimmerText>
      ) : state === 'completed' ? (
        <CheckIcon className="size-3.5 text-muted-foreground" />
      ) : (
        <Text
          className={
            isRemoteDispatchActive(state)
              ? 'max-w-[50%] font-medium text-xs text-foreground'
              : 'max-w-[50%] text-xs text-foreground-tertiary'
          }
          numberOfLines={1}
        >
          {status}
        </Text>
      )}
    </Pressable>
  );
}

function ArtifactFileRow({
  fileEntryId,
  dateFormatter,
  onOpen,
}: {
  fileEntryId: string;
  dateFormatter: Intl.DateTimeFormat;
  onOpen(file: NonNullable<ReturnType<typeof useResolvedFile>['data']>): void;
}) {
  const { t } = useTranslation();
  const { data, entry: storedEntry, isLoading } = useResolvedFile(fileEntryId);
  const entry = data?.entry ?? storedEntry;
  if (isLoading) {
    return (
      <View className="min-h-18 flex-row items-center gap-4 py-3">
        <FileEntrySkeleton size={FILE_PREVIEW_SIZE} variant="icon" />
        <View className="min-w-0 flex-1 gap-2">
          <Skeleton className="h-5 w-3/4 rounded-sm" />
          <Skeleton className="h-4 w-2/5 rounded-sm" />
        </View>
      </View>
    );
  }
  if (!entry) return null;
  return (
    <FileBrowserRow
      description={
        data
          ? t('library.modifiedAt', { date: dateFormatter.format(entry.updatedAt) })
          : t('filePreview.unavailable')
      }
      disabled={!data}
      name={entry.filename}
      onPress={() => data && onOpen(data)}
      preview={
        <LoadedFileEntryPreview
          entry={entry}
          previewUri={undefined}
          size={FILE_PREVIEW_SIZE}
          uri={data?.uri}
          variant="icon"
        />
      }
      testID={`chat-artifact-file-${fileEntryId}`}
    />
  );
}
