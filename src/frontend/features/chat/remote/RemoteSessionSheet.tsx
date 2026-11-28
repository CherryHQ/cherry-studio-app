import Maximize2Icon from '@cherrystudio/app-icons/icons/maximize-2';
import XIcon from '@cherrystudio/app-icons/icons/x';
import { BottomSheet, BottomSheetProvider, ContentState } from '@cherrystudio/ui/components';
import { ambientMotion } from '@cherrystudio/ui/motion';
import { router, useFocusEffect, usePathname } from 'expo-router';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Pressable, Text, View } from 'react-native';
import Animated, { type CSSAnimationProperties, useReducedMotion } from 'react-native-reanimated';

import {
  ConversationSourceBoundary,
  useConversationSourceState,
  useResolvedConversationAgent,
} from '@/frontend/appShell/conversation';
import {
  useConversation,
  useRemoteConversationSource,
} from '@/frontend/appShell/conversation/remote';
import {
  OpenRemoteSessionSheetContext,
  remoteChatHref,
  type RemoteSessionSheetTarget,
} from '@/frontend/appShell/navigation/chat';
import { AgentAvatar } from '@/frontend/components/Avatar';
import { useBackendModule } from '@/frontend/data';
import { useDesktopConnection } from '@/frontend/hooks/useDesktopConnections';

import { RemoteConversationBody, useRemoteConversation } from './RemoteConversationBody';
import { remoteDraftKey } from './useRemoteDraftPersistence';

type SessionTarget = Extract<RemoteSessionSheetTarget, { sessionId: string }>;
type DispatchTarget = Extract<RemoteSessionSheetTarget, { draftId: string }>;

const PULSE_ANIMATION = {
  animationDuration: ambientMotion.pulseDuration,
  animationFillMode: 'both',
  animationIterationCount: 'infinite',
  animationName: {
    from: { opacity: 1 },
    '50%': { opacity: 0.4 },
    to: { opacity: 1 },
  },
  animationTimingFunction: 'ease-in-out',
} satisfies CSSAnimationProperties;
const IDLE_DOT_STYLE = { animationName: 'none' } satisfies CSSAnimationProperties;

const SheetConnectionContext = createContext<string | undefined>(undefined);

const ModalHeaderContext = createContext<{
  agentEmoji?: string;
  title?: string;
  connectionName?: string;
  status?: string;
  dotClassName?: string;
  isRunning?: boolean;
  expandTarget?: SessionTarget;
  onExpand?: (target: SessionTarget) => void;
}>({});

function renderSheetFallback(state: 'loading' | 'error') {
  return <ModalContentState state={state} />;
}

export function RemoteSessionSheetHost({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [sheet, setSheet] = useState<{ pathname: string; target: RemoteSessionSheetTarget }>();
  if (sheet && sheet.pathname !== pathname) setSheet(undefined);
  const close = useCallback(() => setSheet(undefined), []);
  useFocusEffect(useCallback(() => close, [close]));
  const open = useCallback(
    (target: RemoteSessionSheetTarget) => {
      Keyboard.dismiss();
      setSheet({ pathname, target });
    },
    [pathname],
  );

  return (
    <OpenRemoteSessionSheetContext value={open}>
      {children}
      {sheet ? (
        <View className="absolute inset-0 z-60" pointerEvents="box-none">
          <RemoteSessionSheet target={sheet.target} onClosed={close} />
        </View>
      ) : null}
    </OpenRemoteSessionSheetContext>
  );
}

function RemoteSessionSheet({
  onClosed,
  target,
}: {
  onClosed: () => void;
  target: RemoteSessionSheetTarget;
}) {
  const { connectionId } = target;
  const [isOpen, setIsOpen] = useState(true);
  const expandTargetRef = useRef<SessionTarget | undefined>(undefined);

  const handleClose = useCallback(() => setIsOpen(false), []);
  const handleClosed = useCallback(() => {
    const expandTarget = expandTargetRef.current;
    expandTargetRef.current = undefined;
    onClosed();
    if (expandTarget) router.push(remoteChatHref(expandTarget));
  }, [onClosed]);
  const handleExpand = useCallback((sessionTarget: SessionTarget) => {
    expandTargetRef.current = sessionTarget;
    Keyboard.dismiss();
    setIsOpen(false);
  }, []);

  return (
    <BottomSheetProvider>
      <BottomSheet
        avoidKeyboard
        bodyInset="none"
        onClose={handleClose}
        onClosed={handleClosed}
        open={isOpen}
        size="large"
        testID="remote-session-sheet"
      >
        <SheetConnectionContext value={connectionId}>
          <ConversationSourceBoundary
            key={connectionId}
            source={{ kind: 'desktop', connectionId }}
            fallback={renderSheetFallback}
          >
            {'sessionId' in target ? (
              <RemoteSession onExpand={handleExpand} target={target} />
            ) : (
              <PendingDispatch onExpand={handleExpand} target={target} />
            )}
          </ConversationSourceBoundary>
        </SheetConnectionContext>
      </BottomSheet>
    </BottomSheetProvider>
  );
}

function PendingDispatch({
  onExpand,
  target,
}: {
  onExpand: (target: SessionTarget) => void;
  target: DispatchTarget;
}) {
  const source = useRemoteConversationSource();
  const { availability } = useConversationSourceState();
  const getReceipt = useCallback(
    () => source.getDispatch(target.draftId, target.operationId),
    [source, target.draftId, target.operationId],
  );
  const receipt = useSyncExternalStore(source.subscribeDispatches, getReceipt, getReceipt);
  if (!receipt) return <ModalContentState state="missing" />;
  if (receipt.sessionId)
    return (
      <RemoteSession onExpand={onExpand} target={{ ...target, sessionId: receipt.sessionId }} />
    );
  if (receipt.status === 'rejected' || receipt.status === 'interrupted')
    return <ModalContentState state="failed" />;
  return (
    <ModalContentState
      state={
        availability.state === 'disabled' && availability.reason !== 'synchronizing'
          ? 'offline'
          : 'pending'
      }
    />
  );
}

function ModalContentState({
  state,
}: {
  state: 'missing' | 'loading' | 'error' | 'pending' | 'offline' | 'failed';
}) {
  const { t } = useTranslation();
  const connectionId = use(SheetConnectionContext);
  const desktopConnections = useBackendModule('desktopConnections');
  const { connection } = useDesktopConnection(connectionId);
  const header = useMemo(
    () => ({
      connectionName: connection?.name,
    }),
    [connection?.name],
  );

  return (
    <ModalHeaderContext value={header}>
      <View className="flex-1">
        <ModalHeader />
        <View className="flex-1 justify-center px-8">
          {state === 'loading' ? (
            <ContentState.Loading title={t('remoteAgent.connecting')} />
          ) : state === 'pending' ? (
            <ContentState.Loading title={t('desktopDispatch.pip.status.pending-confirm')} />
          ) : state === 'missing' ? (
            <ContentState.Empty title={t('desktopDispatch.modal.sessionUnavailable')} />
          ) : (
            <ContentState.Error
              primaryAction={
                state === 'offline' && connectionId
                  ? {
                      children: t('remoteAgent.reconnect'),
                      onPress: () => void desktopConnections.reconnect(connectionId),
                    }
                  : undefined
              }
              title={t(
                state === 'offline'
                  ? 'desktopDispatch.pip.status.offline'
                  : state === 'failed'
                    ? 'desktopDispatch.pip.status.failed'
                    : 'remoteAgent.loadFailed',
              )}
            />
          )}
        </View>
      </View>
    </ModalHeaderContext>
  );
}

function RemoteSession({
  onExpand,
  target,
}: {
  onExpand: (target: SessionTarget) => void;
  target: SessionTarget;
}) {
  const { t } = useTranslation();
  const { connectionId, sessionId } = target;
  const source = useRemoteConversationSource();
  const { availability } = useConversationSourceState();
  const opened = useConversation({ source: source.ref, sessionId }, source);
  const conversation = useRemoteConversation(opened);
  const { snapshot } = conversation;
  const { agent, agents } = useResolvedConversationAgent(snapshot.agentId ?? target.agentId, false);
  const { connection } = useDesktopConnection(connectionId);
  const identity = `session:${sessionId}`;

  const isRunningExecution = snapshot.executions.some(
    ({ state }) => state === 'running' || state === 'finalizing',
  );
  let status = t('desktopDispatch.modal.status.connected');
  let dotClassName = 'bg-primary';
  let isRunning = false;
  if (availability.state === 'disabled') {
    status = t(
      availability.reason === 'synchronizing'
        ? 'remoteAgent.connecting'
        : 'remoteAgent.disconnected',
    );
    dotClassName = 'bg-muted-foreground';
  } else if (opened.isLoading) {
    status = t('remoteAgent.connecting');
    dotClassName = 'bg-muted-foreground';
  } else if (
    snapshot.interactions.some((interaction) => interaction.state === 'pending') ||
    snapshot.executions.some(
      ({ state }) => state === 'awaiting-approval' || state === 'awaiting-input',
    )
  ) {
    status = t('desktopDispatch.pip.status.awaiting-approval');
    dotClassName = 'bg-warning';
  } else if (isRunningExecution) {
    status = t('desktopDispatch.pip.status.running');
    isRunning = true;
  }

  const confirmedSessionId = opened.session?.ref.sessionId ?? sessionId;
  const agentId = agent?.id ?? target.agentId;
  const agentEmoji = agent?.emoji;
  const title = agent?.name || snapshot.title;
  const connectionName = connection?.name;
  const header = useMemo(
    () => ({
      agentEmoji,
      title,
      connectionName,
      status,
      dotClassName,
      isRunning,
      expandTarget: { connectionId, sessionId: confirmedSessionId, agentId },
      onExpand,
    }),
    [
      agentEmoji,
      title,
      connectionName,
      status,
      dotClassName,
      isRunning,
      connectionId,
      confirmedSessionId,
      agentId,
      onExpand,
    ],
  );
  return (
    <ModalHeaderContext value={header}>
      <RemoteConversationBody
        {...conversation}
        source={source}
        connectionId={connectionId}
        target={target}
        agent={agent}
        agents={agents}
        draftKey={remoteDraftKey(source, identity)}
        identity={identity}
        header={ModalHeader}
        headerPlacement="inline"
        surface="sheet"
      />
    </ModalHeaderContext>
  );
}

function BreathingStatusDot({
  dotClassName,
  isRunning,
}: {
  dotClassName?: string;
  isRunning?: boolean;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <Animated.View
      className={`size-1.5 shrink-0 rounded-full ${dotClassName ?? ''}`}
      style={isRunning && !reducedMotion ? PULSE_ANIMATION : IDLE_DOT_STYLE}
    />
  );
}

function ModalHeader({ selection }: { selection?: { selectedCount: number; onExit(): void } }) {
  const { t } = useTranslation();
  const {
    agentEmoji,
    title,
    connectionName,
    status,
    dotClassName,
    isRunning,
    expandTarget,
    onExpand,
  } = use(ModalHeaderContext);
  const displayTitle = title || t('desktopDispatch.modal.title');

  if (selection) {
    return (
      <View className="min-h-14 flex-row items-center gap-2.5 px-5 py-1.5">
        <Pressable
          accessibilityLabel={t('common.cancel')}
          accessibilityRole="button"
          className="-ml-2.5 size-11 items-center justify-center rounded-full active:bg-secondary"
          onPress={selection.onExit}
          testID="remote-session-modal-close"
        >
          <XIcon className="size-6 text-foreground" />
        </Pressable>
        <Text
          accessibilityRole="header"
          className="min-w-0 flex-1 font-semibold text-base text-foreground"
          numberOfLines={1}
        >
          {t('common.selection.count', { count: selection.selectedCount })}
        </Text>
      </View>
    );
  }

  return (
    <View className="min-h-14 flex-row items-center gap-2.5 px-5 py-1.5">
      <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
        <AgentAvatar emoji={agentEmoji} name={displayTitle} size={28} />
        <View className="min-w-0 flex-1">
          <Text
            accessibilityRole="header"
            className="font-semibold text-base text-foreground"
            numberOfLines={1}
          >
            {displayTitle}
          </Text>
          {status ? (
            <View className="flex-row items-center gap-1.5">
              <BreathingStatusDot dotClassName={dotClassName} isRunning={isRunning} />
              <Text className="min-w-0 shrink text-xs text-muted-foreground" numberOfLines={1}>
                {connectionName ? `${connectionName} · ${status}` : status}
              </Text>
            </View>
          ) : connectionName ? (
            <Text className="min-w-0 shrink text-xs text-muted-foreground" numberOfLines={1}>
              {connectionName}
            </Text>
          ) : null}
        </View>
      </View>
      {expandTarget && onExpand ? (
        <Pressable
          accessibilityLabel={t('desktopDispatch.modal.expand')}
          accessibilityRole="button"
          className="-mr-2.5 size-11 items-center justify-center rounded-full active:bg-secondary"
          onPress={() => onExpand(expandTarget)}
          testID="remote-session-modal-expand"
        >
          <Maximize2Icon className="size-5 text-foreground" />
        </Pressable>
      ) : null}
    </View>
  );
}
