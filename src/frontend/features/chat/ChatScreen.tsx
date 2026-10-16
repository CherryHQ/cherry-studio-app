import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import {
  composerContentGap,
  ContentState,
  getComposerKeyboardStickyOffset,
} from '@cherrystudio/ui/components';
import { router, useIsPreview, useLocalSearchParams } from 'expo-router';
import { type ComponentProps, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { v7 as uuidv7 } from 'uuid';

import { MainHeader } from '@/frontend/appShell/header';
import { ChatDockFooter } from '@/frontend/appShell/layout';
import {
  type ChatRouteParamsInput,
  type ChatTarget,
  conversationShareHref,
  parseChatRoute,
  getChatComposerHandoff,
  chatRouteParams,
} from '@/frontend/appShell/navigation/chat';
import {
  ComposerDismissArea,
  ComposerDock,
  ComposerDropArea,
  ComposerSessionProvider,
} from '@/frontend/components/Composer';
import { McpAppConversationProvider } from '@/frontend/components/McpApp';
import type { MessageListItem } from '@/frontend/components/Message';
import { useAgentApiById, useAgentSession } from '@/frontend/hooks/agent';
import { type FileWorkspaceAddress, useFileWorkspace } from '@/frontend/hooks/file';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';

import { ChatInput } from './components/ChatInput';
import { createSkillActionMention } from './components/ChatInput/utils/skillMentions';
import { ChatRouteResolver } from './components/ChatRouteResolver';
import { ChatScreenFrame } from './components/ChatScreenFrame';
import { AssistantMessageUsage, ChatEmptyState, ChatWorkspace } from './components/ChatWorkspace';
import { FileWorkspaceSheet } from './components/FileWorkspaceSheet';
import { LocalRuntimeStatus } from './components/LocalRuntimeStatus';
import { useChatComposerSession } from './hooks/useChatComposerSession';
import { useSessionReadReceipt } from './hooks/useSessionReadReceipt';
import {
  latestConversationImageResult,
  useAgentChatControls,
  useAgentChatDraftHandoff,
  useLocalConversation,
} from './runtime';
import { createChatShareHandoff, type ChatShareTranslations } from './share/chatShareHandoff';

const PREVIEW_CONTENT_BOTTOM_INSET = 12;
const renderLocalUsage = (message: MessageListItem) => <AssistantMessageUsage message={message} />;

export function ChatScreen() {
  return (
    <ChatScreenFrame header={LocalChatHeader}>
      <ChatRouteContent />
    </ChatScreenFrame>
  );
}

function LocalChatHeader(props: ComponentProps<typeof MainHeader>) {
  const { t } = useTranslation();
  const params = useLocalSearchParams<ChatRouteParamsInput>();
  const route = parseChatRoute(params);
  const target = route.status === 'ready' ? route.target : undefined;
  const [workspaceAddress, setWorkspaceAddress] = useState<FileWorkspaceAddress | null>(null);
  const closeWorkspace = useCallback(() => setWorkspaceAddress(null), []);
  function openWorkspace() {
    if (!target) return;
    Keyboard.dismiss();
    if (target.kind === 'session') {
      setWorkspaceAddress({ sessionId: target.sessionId });
    } else {
      const workspaceDraftId = target.workspaceDraftId ?? uuidv7();
      if (!target.workspaceDraftId)
        router.setParams(chatRouteParams({ ...target, workspaceDraftId }));
      setWorkspaceAddress({ workspaceDraftId });
    }
  }
  return (
    <>
      <MainHeader
        {...props}
        actions={
          target
            ? [
                {
                  key: 'file-workspace',
                  type: 'icon',
                  icon: FolderIcon,
                  accessibilityLabel: t('workspace.open'),
                  testID: 'chat-file-workspace',
                  onPress: () => openWorkspace(),
                },
              ]
            : undefined
        }
      />
      {workspaceAddress ? (
        <FileWorkspaceSheet address={workspaceAddress} onClose={closeWorkspace} />
      ) : null}
    </>
  );
}

function ChatRouteContent() {
  const params = useLocalSearchParams<ChatRouteParamsInput>();
  const route = parseChatRoute(params);

  if (route.status !== 'ready') {
    return <ChatRouteResolver />;
  }

  return <ResolvedChatContent target={route.target} />;
}

function ResolvedChatContent({ target }: { target: ChatTarget }) {
  const { t } = useTranslation();
  const isPreview = useIsPreview();
  const agentId = target.kind === 'draft' ? target.agentId : undefined;
  const sessionId = target.kind === 'session' ? target.sessionId : undefined;
  const workspace = useFileWorkspace({
    sessionId,
    workspaceDraftId: target.kind === 'draft' ? target.workspaceDraftId : undefined,
  });
  const draftHandoff = useAgentChatDraftHandoff(sessionId);
  const composerSession = useChatComposerSession(target, draftHandoff);
  const session = useAgentSession(sessionId);
  const resolvedAgentId = session.data?.agentId ?? composerSession.draftAgentId ?? agentId;
  const controls = useAgentChatControls({
    agentId: resolvedAgentId,
    sessionId,
    composerKey: composerSession.key,
    workspaceFolderId: !sessionId ? workspace.folderId : undefined,
  });
  const agent = useAgentApiById(resolvedAgentId);
  const { snapshot, messages, messageWindow } = useLocalConversation({
    sessionId,
    title: session.data?.name,
    navigation: target.kind === 'session' ? target : undefined,
  });
  const shareMessage = useCallback(
    (messageId: string, translations?: ChatShareTranslations) => {
      if (sessionId)
        router.push(
          conversationShareHref(
            { source: { kind: 'local' }, sessionId },
            messageId,
            undefined,
            createChatShareHandoff(sessionId, translations),
          ),
        );
    },
    [sessionId],
  );
  const isSessionAvailable =
    Boolean(sessionId) && !session.error && (session.isLoading || Boolean(session.data));
  const isNewAgentAvailable =
    !sessionId && Boolean(agentId) && !agent.error && (agent.isLoading || Boolean(agent.agent));
  const hasComposer =
    !isPreview && Boolean(agent.agent) && (isSessionAvailable || isNewAgentAvailable);
  // Entry actions seed the rich draft; only the user's send creates a message.
  const composerHandoff = getChatComposerHandoff(composerSession.seedHandoff);
  const initialDraft = composerHandoff?.skillAction
    ? `${createSkillActionMention(composerHandoff.skillAction, t(composerHandoff.skillAction === 'create' ? 'skills.create.name' : 'skills.find.name'))} ${composerHandoff.draft}`
    : composerHandoff?.draft;
  const { bottom: bottomInset } = useSafeAreaInsets();
  const contentBottomInset = hasComposer ? composerContentGap : PREVIEW_CONTENT_BOTTOM_INSET;
  const keyboardOffset = hasComposer ? getComposerKeyboardStickyOffset(bottomInset) : 0;

  if (sessionId && session.error && isNotFoundError(session.error)) {
    return <ChatRouteResolver />;
  }

  return (
    <ComposerSessionProvider
      workspaceSessionId={sessionId}
      workspaceFolderId={!sessionId ? workspace.folderId : undefined}
      key={composerSession.key}
      initialAttachments={composerHandoff?.attachments}
      initialDraft={initialDraft}
    >
      <McpAppConversationProvider
        enabled={hasComposer && agent.agent?.mode !== 'minimal'}
        agentId={resolvedAgentId}
      >
        {/* A drop without a composer could import files with nothing to attach
          them to, so the area refuses sessions in preview and error states. */}
        <ComposerDropArea enabled={hasComposer}>
          {!isPreview &&
          sessionId &&
          session.data &&
          !session.error &&
          !messageWindow.isLoadingInitial &&
          !messageWindow.error ? (
            <SessionReadReceipt sessionId={sessionId} />
          ) : null}
          {/* Native background taps yield to scrolling and excluded message content. */}
          <ComposerDismissArea disabled={!hasComposer} testID="chat-background">
            {sessionId && session.error ? (
              <View className="flex-1 justify-center px-8 py-16">
                <ContentState.Error
                  primaryAction={{
                    children: t('agent.actions.retry'),
                    onPress: () => void session.refetch(),
                  }}
                  prominence="prominent"
                  title={t('navigation.chatsLoadFailed')}
                />
              </View>
            ) : (isSessionAvailable && sessionId) || target.kind === 'draft' ? (
              <ChatWorkspace
                isTranslationEnabled
                renderUsage={renderLocalUsage}
                snapshot={snapshot}
                messages={messages}
                onShare={sessionId ? shareMessage : undefined}
                pendingSend={controls.pendingSend}
                enteringUserMessageId={controls.enteringUserMessageId}
                onPendingSendDisplayed={controls.completePendingSend}
                assistantAvatar={agent.agent?.avatar}
                assistantAvatarUri={agent.agent?.avatarUri}
                assistantName={agent.agent?.name}
                isAssistantToolbarEnabled={!isPreview && Boolean(sessionId)}
                contentBottomInset={contentBottomInset}
                forkBoundaryMessageId={session.data?.forkBoundaryMessageId ?? undefined}
                forkedFromSessionId={session.data?.forkedFromSessionId ?? undefined}
                keyboardOffset={keyboardOffset}
                messageWindow={messageWindow}
                sessionId={sessionId}
              />
            ) : (
              <ChatEmptyState contentBottomInset={contentBottomInset} />
            )}
          </ComposerDismissArea>
          {/* Below the transcript: the column's top edge sits under the header overlay. */}
          {sessionId ? <LocalRuntimeStatus sessionId={sessionId} /> : null}
          {hasComposer ? (
            <ComposerDock layoutMode="expandable">
              <View>
                <ChatInput
                  agentId={resolvedAgentId}
                  controls={controls}
                  dismissKeyboardOnSend
                  imageResult={
                    messageWindow.hasNewerMessages
                      ? undefined
                      : latestConversationImageResult(
                          messageWindow.messages.map((message) => message.imageResult),
                        )
                  }
                  sessionId={sessionId}
                />
                <ChatDockFooter>
                  <Text className="text-center text-xs text-muted-foreground">
                    {t('chat.input.disclaimer')}
                  </Text>
                </ChatDockFooter>
              </View>
            </ComposerDock>
          ) : null}
        </ComposerDropArea>
      </McpAppConversationProvider>
    </ComposerSessionProvider>
  );
}

function SessionReadReceipt({ sessionId }: { sessionId: string }) {
  useSessionReadReceipt(sessionId);
  return null;
}

function isNotFoundError(error: Error) {
  return error instanceof DataApiError && error.code === ErrorCode.NOT_FOUND;
}
