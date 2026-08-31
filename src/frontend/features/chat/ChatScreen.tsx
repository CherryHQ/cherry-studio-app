import { composerContentGap, getComposerKeyboardStickyOffset } from '@cherrystudio/ui/components';
import { useIsPreview, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComposerDock, ComposerSessionProvider } from '@/frontend/components/composer';
import { MainHeader } from '@/frontend/components/headers';
import {
  useAgentApiById,
  useAgentMessageHistoryWindow,
  useAgentSession,
} from '@/frontend/hooks/agent';

import { ChatInput } from './input';
import { ChatEmptyState, ChatWorkspace } from './workspace';

const PREVIEW_CONTENT_BOTTOM_INSET = 12;

export function ChatScreen() {
  const isPreview = useIsPreview();
  const params = useLocalSearchParams<{
    agentId?: string | string[];
    sessionId?: string | string[];
  }>();
  const agentId = getSingleParamValue(params.agentId);
  const sessionId = getSingleParamValue(params.sessionId);
  const session = useAgentSession(sessionId);
  const resolvedAgentId = session.data?.agentId ?? agentId;
  const agent = useAgentApiById(resolvedAgentId);
  const messageWindow = useAgentMessageHistoryWindow(sessionId);
  const isSessionAvailable =
    Boolean(sessionId) && !session.error && (session.isLoading || Boolean(session.data));
  const isNewAgentAvailable =
    !sessionId && Boolean(agentId) && !agent.error && (agent.isLoading || Boolean(agent.agent));
  const hasComposer =
    !isPreview && Boolean(agent.agent) && (isSessionAvailable || isNewAgentAvailable);
  const composerSessionKey = sessionId
    ? `session:${sessionId}`
    : `draft:${resolvedAgentId ?? 'unavailable'}`;
  const { bottom: bottomInset } = useSafeAreaInsets();
  const contentBottomInset = hasComposer ? composerContentGap : PREVIEW_CONTENT_BOTTOM_INSET;
  const keyboardOffset = hasComposer ? getComposerKeyboardStickyOffset(bottomInset) : 0;

  return (
    <>
      <MainHeader />
      <View className="flex-1 bg-background">
        {isSessionAvailable && sessionId ? (
          <ChatWorkspace
            assistantAvatarUri={agent.agent?.avatarUri}
            assistantName={agent.agent?.name}
            isAssistantToolbarEnabled={!isPreview}
            contentBottomInset={contentBottomInset}
            keyboardOffset={keyboardOffset}
            messageWindow={messageWindow}
            renderGateKey={sessionId}
            sessionId={sessionId}
          />
        ) : (
          <ChatEmptyState contentBottomInset={contentBottomInset} />
        )}
        {hasComposer ? (
          <ComposerSessionProvider key={composerSessionKey}>
            <ComposerDock layoutMode="flow">
              <ChatInput
                agentId={resolvedAgentId}
                dismissKeyboardOnSend={false}
                sessionId={sessionId}
              />
            </ComposerDock>
          </ComposerSessionProvider>
        ) : null}
      </View>
    </>
  );
}

function getSingleParamValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.at(0) : value;
}
