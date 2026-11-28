import { ContentState } from '@cherrystudio/ui/components';
import { router, useLocalSearchParams } from 'expo-router';
import { type RefObject, createContext, use, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, View, type ViewInstance } from 'react-native';

import { useBackgroundTaskNotifications } from '@/frontend/appShell/backgroundActivity';
import {
  type AgentSummary,
  ConversationSourceBoundary,
  type useConversationAgents,
  useResolvedConversationAgent,
} from '@/frontend/appShell/conversation';
import {
  useConversation,
  useRemoteConversationSource,
} from '@/frontend/appShell/conversation/remote';
import { MainHeaderView } from '@/frontend/appShell/header';
import {
  parseRemoteChatRoute,
  type RemoteChatRouteParams,
  type RemoteChatTarget,
  useChatSource,
} from '@/frontend/appShell/navigation/chat';
import { useSidebarPresence } from '@/frontend/appShell/sidebar';
import { AgentPickerSheet } from '@/frontend/components/AgentPicker';

import { ChatScreenFrame } from '../components/ChatScreenFrame';
import { RemoteConversationBody, useRemoteConversation } from './RemoteConversationBody';
import { useRemoteChatNavigation } from './useRemoteChatNavigation';
import { remoteDraftKey } from './useRemoteDraftPersistence';

export function RemoteChatScreen() {
  const target = parseRemoteChatRoute(useLocalSearchParams<RemoteChatRouteParams>());
  return target.connectionId ? (
    <ConversationSourceBoundary
      key={target.connectionId}
      source={{ kind: 'desktop', connectionId: target.connectionId }}
      fallback={(state) => <RemoteChatUnavailable state={state} />}
    >
      <RemoteChatRoute target={target} />
    </ConversationSourceBoundary>
  ) : (
    <RemoteChatUnavailable state="unpaired" />
  );
}
function RemoteChatUnavailable({ state }: { state: 'loading' | 'error' | 'unpaired' }) {
  const { t } = useTranslation();
  return (
    <ChatScreenFrame header={UnresolvedRemoteHeader}>
      <View className="flex-1 justify-center px-8 py-16">
        {state === 'loading' ? (
          <ContentState.Loading title={t('remoteAgent.connecting')} />
        ) : state === 'error' ? (
          <ContentState.Error
            title={t('remoteAgent.loadFailed')}
            primaryAction={{
              children: t('settings.deviceConnections.title'),
              onPress: () => router.push('/settings/device-connections'),
            }}
          />
        ) : (
          <ContentState.Empty
            title={t('settings.deviceConnections.empty')}
            description={t('settings.deviceConnections.emptyDescription')}
            primaryAction={{
              children: t('settings.deviceConnections.scan.action'),
              onPress: () => router.replace('/settings/device-connections/scan'),
            }}
          />
        )}
      </View>
    </ChatScreenFrame>
  );
}
function UnresolvedRemoteHeader(props: {
  blurTarget: RefObject<ViewInstance | null>;
  hidden?: boolean;
  selection?: { selectedCount: number; onExit(): void };
}) {
  const { startRemoteChat } = useChatSource();
  return <MainHeaderView {...props} onNewChat={() => startRemoteChat()} />;
}

const HeaderContext = createContext<{
  agent?: AgentSummary;
  agents: ReturnType<typeof useConversationAgents>;
  navigation?: ReturnType<typeof useRemoteChatNavigation>;
} | null>(null);
function RemoteHeader(props: {
  blurTarget: RefObject<ViewInstance | null>;
  hidden?: boolean;
  selection?: { selectedCount: number; onExit(): void };
}) {
  const { agent, agents, navigation } = use(HeaderContext)!;
  const [pickerOpen, setPickerOpen] = useState(false);
  if (!navigation) return <MainHeaderView {...props} agent={agent} />;
  return (
    <>
      <MainHeaderView
        {...props}
        agent={agent}
        onNewChat={() => navigation.startNewChat(agent?.id)}
        onAgentPress={() => {
          Keyboard.dismiss();
          setPickerOpen(true);
        }}
      />
      <AgentPickerSheet
        testID="main-header-agent-picker"
        catalog={agents}
        currentAgentId={agent?.id}
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={navigation.selectAgent}
      />
    </>
  );
}
function RemoteChatRoute({ target }: { target: RemoteChatTarget }) {
  const source = useRemoteConversationSource();
  const navigation = useRemoteChatNavigation(target, source);
  const opened = useConversation(
    target.sessionId ? { source: source.ref, sessionId: target.sessionId } : undefined,
    source,
  );
  return <RemoteChatSession target={target} opened={opened} navigation={navigation} />;
}

type RemoteChatSessionProps = { opened: ReturnType<typeof useConversation> } & (
  | { target: RemoteChatTarget; navigation: ReturnType<typeof useRemoteChatNavigation> }
  | { target: RemoteChatTarget & { sessionId: string }; navigation?: never }
);

export function RemoteChatSession({ target, opened, navigation }: RemoteChatSessionProps) {
  const sidebarPresence = useSidebarPresence();
  const source = useRemoteConversationSource();
  const connectionId = source.ref.connectionId;
  const conversation = useRemoteConversation(opened);
  useBackgroundTaskNotifications(
    connectionId && target.sessionId
      ? { kind: 'remote-chat', connectionId, sessionId: target.sessionId }
      : undefined,
    sidebarPresence !== 'open',
  );
  const { agent, agents } = useResolvedConversationAgent(
    conversation.snapshot.agentId ?? target.agentId,
    !target.sessionId,
  );
  const sessionKey = `session:${target.sessionId}`;
  const identity = navigation?.identity ?? sessionKey;
  const draftKey = remoteDraftKey(source, target.sessionId ? sessionKey : identity);
  return (
    // oxlint-disable-next-line react/jsx-no-constructed-context-values -- Preserve current header updates; memoization needs consumer-cost evidence.
    <HeaderContext value={{ agent, agents, navigation }}>
      <RemoteConversationBody
        {...conversation}
        source={source}
        connectionId={connectionId}
        target={target}
        agent={agent}
        agents={agents}
        draftId={navigation?.draftId}
        draftKey={draftKey}
        identity={identity}
        onSessionCreated={navigation?.onSessionCreated}
        header={RemoteHeader}
      />
    </HeaderContext>
  );
}
