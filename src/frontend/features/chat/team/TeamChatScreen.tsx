import {
  Button,
  composerContentGap,
  ContentState,
  getComposerKeyboardStickyOffset,
  useToast,
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
import { MainHeaderView } from '@/frontend/appShell/header';
import {
  parseTeamChatRoute,
  type TeamChatRouteParams,
  type TeamChatTarget,
  useChatSource,
} from '@/frontend/appShell/navigation/chat';
import { AgentPickerSheet } from '@/frontend/components/AgentPicker';
import {
  ComposerDismissArea,
  ComposerDock,
  ComposerSessionProvider,
} from '@/frontend/components/Composer';
import type { MessageListItem } from '@/frontend/components/Message';
import type { TeamAgentContext, TeamSessionRef } from '@/shared/contracts/teamAgent';

import { ChatScreenFrame } from '../components/ChatScreenFrame';
import { ChatWorkspace, RemoteAssistantMessageUsage } from '../components/ChatWorkspace';
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
  create(): void;
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
  const header = use(HeaderContext);
  return (
    <MainHeaderView
      blurTarget={blurTarget}
      hidden={hidden}
      agent={header?.agent}
      onNewChat={() => header?.create()}
      onAgentPress={header?.detail}
      onAgentSwitch={header?.pick}
    />
  );
}

export function TeamChatScreen() {
  const target = parseTeamChatRoute(useLocalSearchParams<TeamChatRouteParams>());
  const { module, state } = useTeamAgentState();
  const { t } = useTranslation();
  const router = useRouter();
  useTeamDirectorySync(module, state.context?.key);
  if (!state.context || (target.bindingId && target.bindingId !== state.context.bindingId))
    return (
      <ChatScreenFrame header={TeamHeader}>
        <View className="flex-1 justify-center px-8">
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
  const { toast } = useToast();
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
  const key = JSON.stringify([context.key, target.sessionId ?? agentId ?? 'catalog']);
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
  const [creating, setCreating] = useState(false);
  const [picker, setPicker] = useState(false);
  const [details, setDetails] = useState(false);
  const portrait = useTeamAgentPortrait(module, agentId);
  const { bottom } = useSafeAreaInsets();
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
  const create = useCallback(async () => {
    if (creating) return;
    if (!agent?.canCreateSession) {
      toast.show({ label: t('teamAgent.unavailable'), variant: 'danger' });
      return;
    }
    setCreating(true);
    try {
      const created = await module.createSession(agent.id);
      if (module.getState().context?.key !== context.key || navigationKey.current !== key) return;
      if (!target.sessionId) {
        module.writeDraft(
          JSON.stringify([context.key, teamSessionId(created)]),
          module.readDraft(key),
        );
        module.writeDraft(key, '');
      }
      openTeam({ bindingId: context.bindingId, sessionId: teamSessionId(created) });
    } catch {
      if (navigationKey.current === key)
        toast.show({ label: t('teamAgent.unavailable'), variant: 'danger' });
    } finally {
      setCreating(false);
    }
  }, [
    agent,
    creating,
    module,
    context.key,
    context.bindingId,
    openTeam,
    t,
    toast,
    key,
    target.sessionId,
  ]);
  const header = useMemo<Header>(
    () => ({
      agent: agent ? { name: agent.name, avatarUri: portrait } : undefined,
      create: () => {
        if (agent) void create();
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
    [agent, portrait, create],
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
  return (
    <HeaderContext value={header}>
      <ChatScreenFrame header={TeamHeader}>
        <ChatShareSelectionProvider messages={snapshot.liveMessages}>
          <ComposerSessionProvider key={observationKey} initialDraft={() => module.readDraft(key)}>
            <ComposerDismissArea>
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
                  keyboardOffset={getComposerKeyboardStickyOffset(bottom)}
                  feedbackHintBottomOffset={composerHeight}
                  onPendingSendDisplayed={ignore}
                  renderUsage={renderUsage}
                />
              ) : (
                <View className="flex-1 justify-center gap-4 px-8">
                  {directory.phase === 'loading' ? (
                    <ContentState.Loading title={t('remoteAgent.loading')} />
                  ) : !unavailable ? (
                    <ContentState.Empty
                      title={agent?.name ?? t('teamAgent.noAgents')}
                      description={agent?.description ?? t('remoteAgent.noSessions')}
                    />
                  ) : null}
                  {agent && !unavailable ? (
                    <Button
                      disabled={!agent.canCreateSession || creating}
                      onPress={() => void create()}
                    >
                      {t('remoteAgent.newSession')}
                    </Button>
                  ) : null}
                </View>
              )}
              {state.view?.run?.state === 'failed' ? (
                <Text accessibilityRole="alert" className="px-5 py-2 text-danger">
                  {t('teamAgent.runFailed')}
                </Text>
              ) : null}
            </ComposerDismissArea>
            {agent ? (
              <ComposerDock
                onHeightChange={(height) => composerHeight.set(height)}
                backgroundClassName="bg-chat-background"
                layoutMode="expandable-overlay"
              >
                <TeamComposer
                  module={module}
                  draftKey={key}
                  conversation={conversation}
                  state={state}
                  agent={agent}
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
