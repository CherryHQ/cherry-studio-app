import FolderIcon from '@cherrystudio/app-icons/icons/folder';
import FolderCheckIcon from '@cherrystudio/app-icons/icons/folder-check';
import {
  composerContentGap,
  ContentState,
  getComposerKeyboardStickyOffset,
} from '@cherrystudio/ui/components';
import { router, useFocusEffect, useIsPreview, useLocalSearchParams } from 'expo-router';
import { type ComponentProps, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Keyboard, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { v7 as uuidv7 } from 'uuid';

import { MainHeader } from '@/frontend/appShell/header';
import { ChatDockFooter } from '@/frontend/appShell/layout';
import {
  type ChatRouteParamsInput,
  type ChatTarget,
  type ChatComposerHandoff,
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
import { PolicyScope } from '@/frontend/components/Policy';
import { useApiClient, useBackendModule } from '@/frontend/data';
import { cacheService } from '@/frontend/data/CacheService';
import { useAgentApiById, useAgentSession } from '@/frontend/hooks/agent';
import { type FileWorkspaceAddress, useFileWorkspace } from '@/frontend/hooks/file';
import { DOCUMENT_EXPORT_MAX_SECTIONS } from '@/shared/contracts/documentExport';
import { DataApiError, ErrorCode } from '@/shared/data/api/errors';
import { agentPolicy } from '@/shared/data/managedPolicy';

import { ChatInput } from './components/ChatInput';
import { createSelectionMention } from './components/ChatInput/utils/selectionMentions';
import { createSkillActionMention } from './components/ChatInput/utils/skillMentions';
import { createSshMention } from './components/ChatInput/utils/sshMentions';
import { ChatRouteResolver } from './components/ChatRouteResolver';
import { ChatScreenFrame } from './components/ChatScreenFrame';
import {
  AssistantMessageUsage,
  ChatComposerClearance,
  ChatEmptyState,
  ChatWorkspace,
} from './components/ChatWorkspace';
import { FileWorkspaceSheet } from './components/FileWorkspaceSheet';
import { FullScreenLayerHost } from './components/FullScreenLayer';
import { LocalRuntimeStatus } from './components/LocalRuntimeStatus';
import { useComposerHandoffAppend } from './composer/useComposerHandoffAppend';
import { ChatEditingProvider, useChatEditing } from './context/ChatEditingProvider';
import { useChatComposerSession } from './hooks/useChatComposerSession';
import { useSessionReadReceipt } from './hooks/useSessionReadReceipt';
import { ChatQuoteProvider } from './quotes/ChatQuoteProvider';
import { useChatQuoteNavigation } from './quotes/useChatQuoteNavigation';
import {
  latestConversationImageResult,
  selectContextUsageSource,
  useAgentChatControls,
  useAgentChatDraftHandoff,
  useLocalConversation,
} from './runtime';
import { resolveMessageModel } from './runtime/agentMessageProjection';
import { ChatShareComposerGuard, ChatShareSelectionControls } from './share/ChatShareControls';
import { ChatShareSelectionProvider } from './share/ChatShareSelectionProvider';
import type { ChatShareTarget } from './share/chatShareTarget';

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
  // Shares the content's queries, so the header reflects the binding without another fetch.
  const workspace = useFileWorkspace({
    sessionId: target?.kind === 'session' ? target.sessionId : undefined,
    workspaceDraftId: target?.kind === 'draft' ? target.workspaceDraftId : undefined,
  });
  const workspaceName = workspace.workspace?.name;
  const [workspaceAddress, setWorkspaceAddress] = useState<FileWorkspaceAddress | null>(null);
  const closeWorkspace = useCallback(() => setWorkspaceAddress(null), []);
  // The sheet reopens on focus; a reference returning from its preview belongs to the composer.
  const selectionHandoff = target?.selectionHandoff;
  const [shownSelectionHandoff, setShownSelectionHandoff] = useState(selectionHandoff);
  if (selectionHandoff !== shownSelectionHandoff) {
    setShownSelectionHandoff(selectionHandoff);
    if (selectionHandoff) setWorkspaceAddress(null);
  }
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
                  // The check marks a linked workspace, matching the selection in its sheet.
                  icon: workspace.folderId ? FolderCheckIcon : FolderIcon,
                  nativeIcon: workspace.folderId
                    ? require('@/assets/header-toolbar/folder-check.png')
                    : require('@/assets/header-toolbar/folder.png'),
                  accessibilityLabel: workspaceName
                    ? t('workspace.openCurrent', { name: workspaceName })
                    : t('workspace.open'),
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

/** Dropping files is an attachment handoff; editing keeps the original attachments. */
function ChatComposerDropArea({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  const { editing } = useChatEditing();
  return <ComposerDropArea enabled={enabled && !editing}>{children}</ComposerDropArea>;
}

function ResolvedChatContent({ target }: { target: ChatTarget }) {
  const { t } = useTranslation();
  const ssh = useBackendModule('ssh');
  const isPreview = useIsPreview();
  const agentId = target.kind === 'draft' ? target.agentId : undefined;
  const sessionId = target.kind === 'session' ? target.sessionId : undefined;
  const workspace = useFileWorkspace({
    sessionId,
    workspaceDraftId: target.kind === 'draft' ? target.workspaceDraftId : undefined,
  });
  const draftHandoff = useAgentChatDraftHandoff(sessionId);
  const { composerSession, completeAppend } = useChatComposerSession(target, draftHandoff);
  const session = useAgentSession(sessionId);
  const resolvedAgentId = session.data?.agentId ?? composerSession.draftAgentId ?? agentId;
  const controls = useAgentChatControls({
    agentId: resolvedAgentId,
    sessionId,
    composerKey: composerSession.key,
    sshDraftId: target.kind === 'draft' ? target.sshDraftId : undefined,
    workspaceFolderId: !sessionId ? workspace.folderId : undefined,
  });
  const agent = useAgentApiById(resolvedAgentId);
  const quoteNavigation = useChatQuoteNavigation(
    sessionId,
    target.kind === 'session' ? target.messageRequestId : undefined,
  );
  const { snapshot, messages, messageWindow, contextUsages } = useLocalConversation({
    sessionId,
    title: session.data?.name,
    navigation: quoteNavigation.navigation ?? (target.kind === 'session' ? target : undefined),
  });
  // With several answers to the last question, the next message continues the one shown.
  const continuesShownAnswer =
    !messageWindow.hasNewerMessages &&
    Boolean(messages.findLast((message) => message.display.role === 'assistant')?.display.branch);
  const api = useApiClient();
  const shareTarget = useMemo<ChatShareTarget | undefined>(
    () =>
      sessionId
        ? {
            ref: { source: { kind: 'local' }, sessionId },
            readSelectableIds: async (signal) => {
              const ids: string[] = [];
              let cursor: string | undefined;
              do {
                const page = await api.get(`/agent-sessions/${sessionId}/messages`, {
                  query: { cursor, limit: DOCUMENT_EXPORT_MAX_SECTIONS + 1 },
                  signal,
                });
                ids.push(
                  ...page.items
                    .filter(
                      (message) =>
                        message.role !== 'system' &&
                        !['pending', 'streaming'].includes(message.status),
                    )
                    .map((message) => message.id),
                );
                cursor = page.nextCursor;
              } while (cursor && ids.length <= DOCUMENT_EXPORT_MAX_SECTIONS);
              return ids.toReversed();
            },
            prepareSelection: async (ids, signal) => {
              const snapshot = await api.get(`/agent-sessions/${sessionId}/messages/selection`, {
                query: { ids: [...ids] },
                signal,
              });
              return {
                title: snapshot.session.name,
                assistantName: snapshot.assistantName,
                messages: snapshot.messages.map((message) => ({
                  ...message,
                  modelName: resolveMessageModel(message)?.name,
                })),
              };
            },
          }
        : undefined,
    [api, sessionId],
  );
  const isSessionAvailable =
    Boolean(sessionId) && !session.error && (session.isLoading || Boolean(session.data));
  const isNewAgentAvailable =
    !sessionId && Boolean(agentId) && !agent.error && (agent.isLoading || Boolean(agent.agent));
  const hasComposer =
    !isPreview && Boolean(agent.agent) && (isSessionAvailable || isNewAgentAvailable);
  const activeAgentId = hasComposer && !agent.error ? agent.agent?.id : undefined;
  // Both drafts and existing chats select the next launch's Agent; previews never do.
  useFocusEffect(
    useCallback(() => {
      if (activeAgentId) cacheService.setPersist('chat.last_agent_id', activeAgentId);
    }, [activeAgentId]),
  );
  // Entry actions seed the rich draft; only the user's send creates a message.
  const composerHandoff = getChatComposerHandoff(composerSession.seedHandoff);
  const sshProfile =
    target.kind === 'draft' && target.sshDraftId
      ? ssh.getTarget(`draft:${target.sshDraftId}`)?.profile
      : undefined;
  const handoffDraft = getHandoffDraft(composerHandoff, t);
  const initialDraft =
    sshProfile && !composerHandoff?.skillAction && !composerHandoff?.selection
      ? `${createSshMention(`SSH · ${sshProfile.name.replace(/\s+/g, ' ')}`, sshProfile)} ${handoffDraft ?? ''}`
      : handoffDraft;
  const { bottom: bottomInset } = useSafeAreaInsets();
  const composerHeight = useSharedValue(0);
  const setComposerHeight = useCallback(
    (height: number) => composerHeight.set(height),
    [composerHeight],
  );
  const contentBottomInset = hasComposer ? composerContentGap : PREVIEW_CONTENT_BOTTOM_INSET;
  const keyboardOffset = hasComposer ? getComposerKeyboardStickyOffset(bottomInset) : 0;

  if (sessionId && session.error && isNotFoundError(session.error)) {
    return <ChatRouteResolver />;
  }

  return (
    <ChatShareSelectionProvider target={shareTarget} messages={messages}>
      <ComposerSessionProvider
        workspaceSessionId={sessionId}
        workspaceFolderId={!sessionId ? workspace.folderId : undefined}
        key={composerSession.key}
        initialAttachments={composerHandoff?.attachments}
        initialDraft={initialDraft}
      >
        <ChatEditingProvider>
          {composerSession.pendingAppend ? (
            <ComposerHandoffAppend
              token={composerSession.pendingAppend}
              onApplied={completeAppend}
            />
          ) : null}
          <ChatQuoteProvider
            sessionId={sessionId}
            enabled={hasComposer}
            authorName={agent.agent?.name}
            openQuote={quoteNavigation.openQuote}
            highlight={quoteNavigation.highlight}
          >
            <McpAppConversationProvider
              enabled={hasComposer && agent.agent?.mode !== 'minimal'}
              agentId={resolvedAgentId}
            >
              {/* An organization Agent's composer and answer pickers follow its policy. */}
              <PolicyScope policy={agentPolicy(agent.agent)}>
                {/* A drop without a composer could import files with nothing to attach
                them to, so the area refuses sessions in preview and error states. */}
                <ChatComposerDropArea enabled={hasComposer}>
                  {!isPreview &&
                  sessionId &&
                  session.data &&
                  !session.error &&
                  !messageWindow.isLoadingInitial &&
                  !messageWindow.error ? (
                    <SessionReadReceipt sessionId={sessionId} />
                  ) : null}
                  <FullScreenLayerHost>
                    {/* Native background taps yield to scrolling and excluded message content. */}
                    <ComposerDismissArea disabled={!hasComposer} testID="chat-background">
                      {sessionId && session.error ? (
                        <ChatComposerClearance className="flex-1">
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
                        </ChatComposerClearance>
                      ) : (isSessionAvailable && sessionId) || target.kind === 'draft' ? (
                        <ChatWorkspace
                          executionSource="local"
                          onQuoteTargetRestored={
                            quoteNavigation.navigation
                              ? quoteNavigation.onTargetRestored
                              : undefined
                          }
                          onQuoteWindowReady={
                            quoteNavigation.navigation ? quoteNavigation.onReady : undefined
                          }
                          onQuoteTakeover={quoteNavigation.cancel}
                          feedbackHintBottomOffset={composerHeight}
                          isTranslationEnabled
                          renderUsage={renderLocalUsage}
                          snapshot={snapshot}
                          messages={messages}
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
                  </FullScreenLayerHost>
                  {/* The transcript keeps its viewport; the keyboard adapter reserves the dock inset. */}
                  {!hasComposer && sessionId ? <LocalRuntimeStatus sessionId={sessionId} /> : null}
                  {hasComposer ? (
                    <ChatShareComposerGuard>
                      <ComposerDock
                        backgroundClassName="bg-chat-background"
                        layoutMode="expandable-overlay"
                        onHeightChange={setComposerHeight}
                      >
                        <View>
                          {sessionId ? <LocalRuntimeStatus sessionId={sessionId} /> : null}
                          <ChatInput
                            agentId={resolvedAgentId}
                            controls={controls}
                            contextUsage={selectContextUsageSource({
                              sessionId,
                              messages,
                              usages: contextUsages,
                              isCurrentWindow:
                                !messageWindow.hasNewerMessages &&
                                !messageWindow.isLoadingInitial &&
                                !messageWindow.error,
                            })}
                            dismissKeyboardOnSend
                            imageResult={
                              messageWindow.hasNewerMessages
                                ? undefined
                                : latestConversationImageResult(
                                    messageWindow.messages.map((message) => message.imageResult),
                                  )
                            }
                            placeholder={
                              continuesShownAnswer ? t('chat.inputPlaceholderContinue') : undefined
                            }
                            sessionId={sessionId}
                            sshDraftId={target.kind === 'draft' ? target.sshDraftId : undefined}
                            selectionHandoff={target.selectionHandoff}
                          />
                          <ChatDockFooter>
                            <Text className="text-center text-xs text-muted-foreground">
                              {t('chat.input.disclaimer')}
                            </Text>
                          </ChatDockFooter>
                        </View>
                      </ComposerDock>
                    </ChatShareComposerGuard>
                  ) : null}
                  <ChatShareSelectionControls />
                </ChatComposerDropArea>
              </PolicyScope>
            </McpAppConversationProvider>
          </ChatQuoteProvider>
        </ChatEditingProvider>
      </ComposerSessionProvider>
    </ChatShareSelectionProvider>
  );
}

function ComposerHandoffAppend({
  token,
  onApplied,
}: {
  token: string;
  onApplied: (token: string) => void;
}) {
  const { t } = useTranslation();
  const handoff = getChatComposerHandoff(token);
  useComposerHandoffAppend(
    token,
    handoff ? { ...handoff, draft: getHandoffDraft(handoff, t) ?? '' } : undefined,
    onApplied,
  );
  return null;
}

function getHandoffDraft(
  handoff: ChatComposerHandoff | undefined,
  t: ReturnType<typeof useTranslation>['t'],
) {
  return handoff?.skillAction
    ? `${createSkillActionMention(handoff.skillAction, t(handoff.skillAction === 'create' ? 'skills.create.name' : 'skills.find.name'))} ${handoff.draft}`
    : handoff?.selection
      ? `${createSelectionMention(handoff.selection.label, handoff.selection.selection)} ${handoff.draft}`
      : handoff?.draft;
}

function SessionReadReceipt({ sessionId }: { sessionId: string }) {
  useSessionReadReceipt(sessionId);
  return null;
}

function isNotFoundError(error: Error) {
  return error instanceof DataApiError && error.code === ErrorCode.NOT_FOUND;
}
