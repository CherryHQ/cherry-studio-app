import InfoIcon from '@cherrystudio/app-icons/icons/info';
import {
  composerContentGap,
  ContentState,
  getComposerKeyboardStickyOffset,
} from '@cherrystudio/ui/components';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  createContext,
  type RefObject,
  use,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View, type ViewInstance } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ConversationSourceBoundary,
  type ConversationHistoryView,
  type ConversationSnapshot,
  useConversationAgents,
} from '@/frontend/appShell/conversation';
import {
  createTeamConversationProjector,
  teamSessionId,
  teamSessionRef,
  useTeamAgentPortrait,
  useTeamAgentState,
  useTeamConversation,
  useTeamDirectorySync,
} from '@/frontend/appShell/conversation/team';
import { type HeaderToolbarAction, MainHeaderView } from '@/frontend/appShell/header';
import {
  parseTeamChatRoute,
  type TeamChatRouteParams,
  type TeamChatTarget,
  useChatSource,
} from '@/frontend/appShell/navigation/chat';
import {
  useNavigationDockClearance,
  useRootNavigationDockClearance,
} from '@/frontend/appShell/navigationShell/state';
import { AgentPickerSheet } from '@/frontend/components/AgentPicker';
import {
  ComposerDismissArea,
  ComposerDock,
  ComposerSessionProvider,
  getComposerExtraBottomOffset,
} from '@/frontend/components/Composer';
import type { MessageListItem } from '@/frontend/components/Message';
import {
  teamAgentDraftKey,
  teamDraftKey,
  type TeamAgentContext,
  type TeamSession,
  type TeamSessionRef,
} from '@/shared/contracts/teamAgent';

import { ChatScreenFrame } from '../components/ChatScreenFrame';
import {
  ChatComposerClearance,
  ChatWorkspace,
  RemoteAssistantMessageUsage,
} from '../components/ChatWorkspace';
import { ChatShareSelectionProvider } from '../share/ChatShareSelectionProvider';
import { TeamAgentDetailSheet } from './TeamAgentDetailSheet';
import { TeamComposer } from './TeamComposer';

const ignore = () => {};
const noPage = async () => {};
const EMPTY: ConversationSnapshot = {
  title: '',
  freshness: { state: 'loading' },
  liveMessages: [],
  executions: [],
  interactions: [],
};
type Header = {
  agent?: { name: string; avatarUri?: string };
  newChat(): void;
  detail(): void;
  pick(): void;
};
const HeaderContext = createContext<Header | null>(null);
function TeamLoading() {
  const { t } = useTranslation();
  return <ContentState.Loading title={t('remoteAgent.loading')} />;
}
function TeamHeader({
  blurTarget,
  hidden,
}: {
  blurTarget: RefObject<ViewInstance | null>;
  hidden?: boolean;
}) {
  const { t } = useTranslation();
  const header = use(HeaderContext);
  const actions = useMemo<readonly HeaderToolbarAction[]>(
    () =>
      header?.agent
        ? [
            {
              accessibilityLabel: t('teamAgent.details'),
              icon: InfoIcon,
              key: 'team-agent-details',
              nativeIcon: require('@/assets/header-toolbar/info.png'),
              onPress: header.detail,
              testID: 'team-header-agent-details',
              type: 'icon',
            },
          ]
        : [],
    [header, t],
  );
  return (
    <MainHeaderView
      blurTarget={blurTarget}
      hidden={hidden}
      agent={header?.agent}
      actions={actions}
      onNewChat={header?.newChat}
      onAgentPress={header?.pick}
    />
  );
}

export function TeamChatScreen() {
  const target = parseTeamChatRoute(useLocalSearchParams<TeamChatRouteParams>());
  const { module, state } = useTeamAgentState();
  const { t } = useTranslation();
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const dockClearance = useRootNavigationDockClearance();
  useTeamDirectorySync(module, state.context?.key);
  if (!state.context || (target.bindingId && target.bindingId !== state.context.bindingId))
    return (
      <ChatScreenFrame header={TeamHeader}>
        <View
          className="flex-1 justify-center px-8"
          style={{ paddingBottom: bottom + dockClearance }}
        >
          <ContentState.Empty
            title={t('teamAgent.title')}
            description={t('teamAgent.accountRequired')}
            primaryAction={{
              children: t('account.login.signIn'),
              onPress: () => router.push('/login'),
            }}
          />
        </View>
      </ChatScreenFrame>
    );
  return (
    <ConversationSourceBoundary
      key={state.context.key}
      source={{ kind: 'team', bindingId: state.context.bindingId }}
      fallback={TeamLoading}
    >
      <TeamChatContent key={state.context.key} target={target} context={state.context} />
    </ConversationSourceBoundary>
  );
}

function TeamChatContent({
  target,
  context,
}: {
  target: TeamChatTarget;
  context: TeamAgentContext;
}) {
  const { module, state: directory } = useTeamAgentState();
  const { t } = useTranslation();
  const { openTeam } = useChatSource();
  const catalog = useConversationAgents();
  let session: TeamSessionRef | undefined;
  let invalid = false;
  if (target.sessionId) {
    try {
      session = teamSessionRef(target.sessionId);
    } catch {
      invalid = true;
    }
  }
  const agentId = session?.agentId ?? target.agentId ?? directory.agents[0]?.id;
  const agent = directory.agents.find((item) => item.id === agentId);
  const key = session
    ? teamDraftKey(context.key, session)
    : agentId
      ? teamAgentDraftKey(context.key, agentId)
      : JSON.stringify([context.key, 'catalog']);
  const navigationKey = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    navigationKey.current = key;
    return () => {
      navigationKey.current = undefined;
    };
  }, [key]);
  const observationKey = JSON.stringify([key, agent !== undefined]);
  const { conversation, state } = useTeamConversation(
    module,
    observationKey,
    context.key,
    agent ? session : undefined,
  );
  const [picker, setPicker] = useState(false);
  const [details, setDetails] = useState(false);
  const portrait = useTeamAgentPortrait(module, agentId);
  const { bottom } = useSafeAreaInsets();
  const dockClearance = useRootNavigationDockClearance();
  const navDockClearance = useNavigationDockClearance();
  const extraBottomOffset = getComposerExtraBottomOffset(bottom, navDockClearance);
  const composerHeight = useSharedValue(0);
  const project = useMemo(() => createTeamConversationProjector(key), [key]);
  const snapshot = useMemo(
    () =>
      conversation && agentId ? project(state, conversation, agentId, agent?.name ?? '') : EMPTY,
    [project, state, conversation, agentId, agent?.name],
  );
  const history: ConversationHistoryView = {
    dataKey: key,
    messages: snapshot.liveMessages,
    isLoadingInitial: Boolean(session && agent && state.phase === 'loading'),
    isRefreshing: false,
    isLoadingOlder: false,
    isLoadingNewer: false,
    hasNewerMessages: false,
    hasOlderMessages: false,
    initialScrollTarget: 'end',
    loadOlder: noPage,
    loadNewer: noPage,
    retry: () => conversation?.refresh() ?? Promise.resolve(),
  };
  const onSessionCreated = useCallback(
    (created: TeamSession) => {
      if (module.getState().context?.key !== context.key || navigationKey.current !== key) return;
      openTeam({ bindingId: context.bindingId, sessionId: teamSessionId(created) });
    },
    [module, context.key, context.bindingId, key, openTeam],
  );
  const header = useMemo<Header>(
    () => ({
      agent: agent ? { name: agent.name, avatarUri: portrait } : undefined,
      newChat: () => {
        if (agent) openTeam({ bindingId: context.bindingId, agentId: agent.id });
        else setPicker(true);
      },
      detail: () => {
        if (agent) {
          Keyboard.dismiss();
          setDetails(true);
        }
      },
      pick: () => {
        Keyboard.dismiss();
        setPicker(true);
      },
    }),
    [agent, portrait, context.bindingId, openTeam],
  );
  const renderUsage = useCallback(
    (item: MessageListItem) => {
      const original = state.view?.messages.find(
        (message) => JSON.stringify([key, message.id]) === item.id,
      );
      return (
        <View className="gap-1">
          {original?.modelName ? (
            <Text className="text-xs text-muted-foreground">{original.modelName}</Text>
          ) : null}
          {item.usage ? <RemoteAssistantMessageUsage message={item} /> : null}
        </View>
      );
    },
    [state.view, key],
  );
  const unavailable =
    invalid ||
    state.phase === 'error' ||
    state.phase === 'retired' ||
    directory.phase === 'error' ||
    (directory.phase === 'ready' && !!agentId && !agent);
  const hasComposer = Boolean(agent && !unavailable);
  return (
    <HeaderContext value={header}>
      <ChatScreenFrame header={TeamHeader}>
        <ChatShareSelectionProvider messages={snapshot.liveMessages}>
          <ComposerSessionProvider key={observationKey} initialDraft={() => module.readDraft(key)}>
            <ComposerDismissArea disabled={!hasComposer}>
              {unavailable ? (
                <View className="px-5 py-2">
                  <ContentState.Error
                    title={t('teamAgent.unavailable')}
                    primaryAction={{
                      children: t('common.retry'),
                      onPress: () => {
                        void module
                          .refresh()
                          .then(() => conversation?.refresh())
                          .catch(() => {});
                      },
                    }}
                  />
                </View>
              ) : null}
              {session && !invalid ? (
                <ChatWorkspace
                  executionSource="team"
                  messages={snapshot.liveMessages}
                  snapshot={snapshot}
                  messageWindow={history}
                  sessionId={key}
                  assistantName={agent?.name}
                  assistantAvatarUri={portrait}
                  isAssistantToolbarEnabled={false}
                  contentBottomInset={composerContentGap}
                  keyboardOffset={getComposerKeyboardStickyOffset(bottom) + extraBottomOffset}
                  feedbackHintBottomOffset={composerHeight}
                  onPendingSendDisplayed={ignore}
                  renderUsage={renderUsage}
                />
              ) : (
                <ChatComposerClearance
                  className="flex-1 justify-center gap-3 px-8"
                  contentBottomInset={hasComposer ? composerContentGap : bottom + dockClearance}
                >
                  {directory.phase === 'loading' ? (
                    <ContentState.Loading title={t('remoteAgent.loading')} />
                  ) : !unavailable ? (
                    <>
                      <ContentState.Empty
                        title={agent?.name ?? t('teamAgent.noAgents')}
                        description={agent?.description ?? t('teamAgent.memoryNotice')}
                      />
                      {agent?.description ? (
                        <Text className="text-center text-xs text-muted-foreground">
                          {t('teamAgent.memoryNotice')}
                        </Text>
                      ) : null}
                    </>
                  ) : null}
                </ChatComposerClearance>
              )}
              {state.view?.run?.state === 'failed' ? (
                <Text accessibilityRole="alert" className="px-5 py-2 text-danger">
                  {t('teamAgent.runFailed')}
                </Text>
              ) : null}
            </ComposerDismissArea>
            {hasComposer && agent ? (
              <ComposerDock
                onHeightChange={(height) => composerHeight.set(height)}
                backgroundClassName="bg-chat-background"
                layoutMode="expandable-overlay"
              >
                <TeamComposer
                  module={module}
                  contextKey={context.key}
                  draftKey={key}
                  hasSessionTarget={Boolean(session)}
                  conversation={conversation}
                  state={state}
                  agent={agent}
                  onSessionCreated={onSessionCreated}
                />
              </ComposerDock>
            ) : null}
          </ComposerSessionProvider>
        </ChatShareSelectionProvider>
        <AgentPickerSheet
          testID="main-header-agent-picker"
          open={picker}
          onClose={() => setPicker(false)}
          catalog={catalog}
          currentAgentId={agentId}
          onSelect={(id) => openTeam({ bindingId: context.bindingId, agentId: id })}
        />
        {details && agentId ? (
          <TeamAgentDetailSheet
            module={module}
            agentId={agentId}
            onClose={() => setDetails(false)}
          />
        ) : null}
      </ChatScreenFrame>
    </HeaderContext>
  );
}
