import CheckIcon from '@cherrystudio/app-icons/icons/check';
import ChevronRightIcon from '@cherrystudio/app-icons/icons/chevron-right';
import MonitorIcon from '@cherrystudio/app-icons/icons/monitor';
import TriangleAlertIcon from '@cherrystudio/app-icons/icons/triangle-alert';
import {
  BackgroundPressExclusion,
  ContextMenuExclusion,
  ShimmerText,
} from '@cherrystudio/ui/components';
import { haptics } from '@cherrystudio/ui/haptics';
import { pressMotion } from '@cherrystudio/ui/motion';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { remoteSessionModalHref } from '@/frontend/appShell/navigation/chat';
import { useBackendModule } from '@/frontend/data';

import { buildDesktopTaskPipViewModel, type DesktopTaskPipViewModel } from './desktopTaskPipModel';
import { GenericToolPart } from './GenericToolPart';
import type { ToolMessagePart } from './toolPartState';

const STATUS_KEYS = {
  running: 'desktopDispatch.pip.status.running',
  'awaiting-approval': 'desktopDispatch.pip.status.awaiting-approval',
  completed: 'desktopDispatch.pip.status.completed',
  failed: 'desktopDispatch.pip.status.failed',
  offline: 'desktopDispatch.pip.status.offline',
  'pending-confirm': 'desktopDispatch.pip.status.pending-confirm',
  dispatched: 'desktopDispatch.pip.status.dispatched',
} as const satisfies Record<DesktopTaskPipViewModel['state'], string>;

const CARD_BASE_CLASS = 'gap-1 overflow-hidden rounded-2xl border border-border px-3.5 py-3';
const CARD_STYLE = { borderCurve: 'continuous' } as const;
const PRESS_IN_CONFIG = { ...pressMotion.pressIn, reduceMotion: ReduceMotion.Never } as const;
const PRESS_OUT_CONFIG = { ...pressMotion.pressOut, reduceMotion: ReduceMotion.Never } as const;

export function DesktopTaskPipPart({ part }: { part: ToolMessagePart }) {
  return part.state === 'output-available' ? (
    <DesktopTaskPip input={part.input} output={part.output} />
  ) : (
    <GenericToolPart part={part} />
  );
}

function useLivePreview(connectionId: string | undefined, sessionId: string | undefined) {
  const remoteAgent = useBackendModule('remoteAgent');
  const subscribe = useCallback(
    (listener: () => void) =>
      (connectionId &&
        sessionId &&
        remoteAgent?.subscribeLiveSession?.(connectionId, sessionId, listener)) ||
      (() => {}),
    [connectionId, sessionId, remoteAgent],
  );
  const getSnapshot = useCallback(
    () =>
      connectionId && sessionId
        ? remoteAgent?.peekLiveSession?.(connectionId, sessionId)
        : undefined,
    [connectionId, sessionId, remoteAgent],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function useRecoveredDispatch(
  connectionId: string | undefined,
  draftId: string | undefined,
  operationId: string | undefined,
) {
  const remoteAgent = useBackendModule('remoteAgent');
  const subscribe = useCallback(
    (listener: () => void) =>
      (connectionId &&
        draftId &&
        operationId &&
        remoteAgent?.subscribeDispatches?.(connectionId, listener)) ||
      (() => {}),
    [connectionId, draftId, operationId, remoteAgent],
  );
  const getSnapshot = useCallback(
    () =>
      connectionId && draftId && operationId
        ? remoteAgent?.peekDispatch?.(connectionId, draftId, operationId)
        : undefined,
    [connectionId, draftId, operationId, remoteAgent],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function DispatchRowStatus({
  canOpen,
  state,
  status,
}: {
  canOpen: boolean;
  state: DesktopTaskPipViewModel['state'];
  status: string;
}) {
  return (
    <View className="shrink-0 flex-row items-center gap-1">
      {state === 'running' ? (
        <ShimmerText className="font-medium text-xs" numberOfLines={1}>
          {status}
        </ShimmerText>
      ) : state === 'awaiting-approval' || state === 'pending-confirm' ? (
        <>
          <View className="size-1.5 shrink-0 rounded-full bg-warning" />
          <Text className="font-medium text-xs text-warning" numberOfLines={1}>
            {status}
          </Text>
        </>
      ) : state === 'completed' ? (
        <>
          <CheckIcon className="size-3.5 shrink-0 text-success" />
          <Text className="text-xs text-muted-foreground" numberOfLines={1}>
            {status}
          </Text>
        </>
      ) : state === 'failed' ? (
        <>
          <TriangleAlertIcon className="size-3.5 shrink-0 text-destructive" />
          <Text className="font-medium text-xs text-destructive" numberOfLines={1}>
            {status}
          </Text>
        </>
      ) : (
        <Text className="text-xs text-foreground-tertiary" numberOfLines={1}>
          {status}
        </Text>
      )}
      {canOpen ? <ChevronRightIcon className="size-3.5 shrink-0 text-foreground-tertiary" /> : null}
    </View>
  );
}

function DesktopTaskPip({ input, output }: { input: unknown; output: unknown }) {
  const { t } = useTranslation();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const pressScale = useSharedValue(1);
  const isPressedRef = useRef(false);

  useEffect(() => {
    if (reducedMotion) {
      isPressedRef.current = false;
      pressScale.set(1);
    }
  }, [pressScale, reducedMotion]);

  const animatedCardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pressScale.get() }],
  }));

  const receipt = useMemo(() => buildDesktopTaskPipViewModel({ input, output }), [input, output]);
  const { connectionId, agentId, draftId, operationId } = receipt;
  const recoveredDispatch = useRecoveredDispatch(
    receipt.state === 'pending-confirm' && !receipt.sessionId ? connectionId : undefined,
    draftId,
    operationId,
  );
  const sessionId = receipt.sessionId ?? recoveredDispatch?.sessionId;
  const livePreview = useLivePreview(connectionId, sessionId);
  const view =
    recoveredDispatch || livePreview
      ? buildDesktopTaskPipViewModel({ input, output, livePreview, recoveredDispatch })
      : receipt;

  const title = view.title ?? t('desktopDispatch.tool.dispatchTask');
  const connection = view.connectionName ?? t('desktopDispatch.pip.desktop');
  const status = t(STATUS_KEYS[view.state]);
  const awaitingApproval = view.state === 'awaiting-approval';
  const workspace =
    view.workspaceKind === 'system'
      ? t('desktopDispatch.workspace.systemDefault')
      : view.workspaceName;
  const attachments = view.attachmentCount
    ? t('desktopDispatch.pip.attachments', { count: view.attachmentCount })
    : undefined;
  const canOpen = Boolean(view.canOpenModal && connectionId);
  const metadata = [connection, view.agentName, workspace].filter(Boolean).join(' · ');

  const content = (
    <>
      <View className="flex-row items-center justify-between gap-2.5">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          <MonitorIcon className="size-4 shrink-0 text-muted-foreground" />
          <Text className="min-w-0 flex-1 font-medium text-sm text-foreground" numberOfLines={1}>
            {title}
          </Text>
        </View>
        <DispatchRowStatus canOpen={canOpen} state={view.state} status={status} />
      </View>
      <View className="pl-6">
        {awaitingApproval && view.pendingApprovalTitle ? (
          <Text className="font-medium text-xs text-warning" numberOfLines={1}>
            {t('desktopDispatch.pip.pendingApproval', { title: view.pendingApprovalTitle })}
          </Text>
        ) : (
          <Text className="text-xs text-foreground-tertiary" numberOfLines={1}>
            {metadata}
          </Text>
        )}
      </View>
    </>
  );

  if (!canOpen || !connectionId) {
    return (
      <View className={`${CARD_BASE_CLASS} bg-card`} style={CARD_STYLE}>
        {content}
      </View>
    );
  }

  const action = t(
    awaitingApproval ? 'desktopDispatch.pip.openToResolve' : 'desktopDispatch.pip.openSession',
  );
  const handlePressIn = () => {
    if (reducedMotion) return;
    isPressedRef.current = true;
    pressScale.set(withTiming(pressMotion.subtleScale, PRESS_IN_CONFIG));
  };
  const handlePressOut = () => {
    if (!isPressedRef.current) return;
    isPressedRef.current = false;
    pressScale.set(withSpring(1, PRESS_OUT_CONFIG));
  };

  return (
    <BackgroundPressExclusion>
      <ContextMenuExclusion>
        <Pressable
          accessibilityLabel={[
            action,
            title,
            connection,
            status,
            attachments,
            view.pendingApprovalTitle,
          ]
            .filter(Boolean)
            .join(', ')}
          accessibilityRole="button"
          onPress={() => {
            haptics.light();
            router.push(
              remoteSessionModalHref(
                sessionId
                  ? { connectionId, sessionId, agentId }
                  : { connectionId, agentId, draftId, operationId },
              ),
            );
          }}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          testID="desktop-task-pip-card"
        >
          {({ pressed }) => (
            <Animated.View
              className={`${CARD_BASE_CLASS} ${pressed ? 'bg-secondary' : 'bg-card'}`}
              style={[CARD_STYLE, animatedCardStyle]}
            >
              {content}
            </Animated.View>
          )}
        </Pressable>
      </ContextMenuExclusion>
    </BackgroundPressExclusion>
  );
}
