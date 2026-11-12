import { ContentState } from '@cherrystudio/ui/components';
import { createContext, use, useMemo, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { View, type ViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  useConversationHistory,
  useConversationSnapshot,
  type RemoteConversationSession,
} from '@/frontend/appShell/conversation/remote';
import { MainHeaderView } from '@/frontend/appShell/header';
import type { MessageListItem } from '@/frontend/components/Message';

import { ChatScreenFrame } from '../components/ChatScreenFrame';
import { ChatWorkspace, RemoteAssistantMessageUsage } from '../components/ChatWorkspace';
import { ChatShareSelectionControls } from '../share/ChatShareControls';
import { ChatShareSelectionProvider } from '../share/ChatShareSelectionProvider';
import { ConversationPresenter } from './ConversationPresenter';
import { remoteChatShareTarget } from './remoteChatShareTarget';

type ReaderAgent = { name: string; emoji?: string };
const HeaderAgent = createContext<ReaderAgent | undefined>(undefined);
const ignorePending = () => {};
const renderUsage = (message: MessageListItem) => <RemoteAssistantMessageUsage message={message} />;

function ReaderHeader({
  blurTarget,
  hidden,
  selection,
}: {
  blurTarget: RefObject<ViewInstance | null>;
  hidden?: boolean;
  selection?: { selectedCount: number; onExit(): void };
}) {
  const agent = use(HeaderAgent);
  return (
    <MainHeaderView agent={agent} blurTarget={blurTarget} hidden={hidden} selection={selection} />
  );
}

/** A transcript presentation with no composer, Agent picker or conversation-creation action. */
export function ReadOnlyRemoteChat({
  session,
  agent,
  error,
  isLoading,
  onRetry,
  errorTitle,
  retryLabel,
}: {
  session?: RemoteConversationSession;
  agent?: ReaderAgent;
  error?: Error;
  isLoading: boolean;
  onRetry(): void;
  errorTitle?: string;
  retryLabel?: string;
}) {
  const { t } = useTranslation();
  return (
    <HeaderAgent value={agent}>
      <ChatScreenFrame header={ReaderHeader}>
        {session ? (
          <ReaderContent
            key={`${session.scope}:${session.ref.sessionId}`}
            session={session}
            agent={agent}
          />
        ) : (
          <View className="flex-1 justify-center px-8 py-16">
            {isLoading ? (
              <ContentState.Loading title={t('chat.history.loading')} />
            ) : error ? (
              <ContentState.Error
                title={errorTitle ?? t('chat.history.loadFailed')}
                primaryAction={{ children: retryLabel ?? t('common.retry'), onPress: onRetry }}
              />
            ) : null}
          </View>
        )}
      </ChatScreenFrame>
    </HeaderAgent>
  );
}

function ReaderContent({
  session,
  agent,
}: {
  session: RemoteConversationSession;
  agent?: ReaderAgent;
}) {
  const { bottom } = useSafeAreaInsets();
  const snapshot = useConversationSnapshot(session);
  const history = useConversationHistory(session, snapshot.historyVersion);
  const [presenter] = useState(() => new ConversationPresenter());
  const messages = presenter.update(
    snapshot,
    history.messages,
    history.installedVersion,
    history.hasNewerMessages,
  );
  const shareTarget = useMemo(() => remoteChatShareTarget(session), [session]);
  return (
    <ChatShareSelectionProvider target={shareTarget} messages={messages}>
      <ChatWorkspace
        executionSource="desktop"
        messages={messages}
        snapshot={snapshot}
        messageWindow={history}
        sessionId={session.ref.sessionId}
        assistantEmoji={agent?.emoji}
        assistantName={agent?.name}
        isAssistantToolbarEnabled
        contentBottomInset={bottom + 16}
        keyboardOffset={0}
        onPendingSendDisplayed={ignorePending}
        renderUsage={renderUsage}
      />
      <ChatShareSelectionControls />
    </ChatShareSelectionProvider>
  );
}
