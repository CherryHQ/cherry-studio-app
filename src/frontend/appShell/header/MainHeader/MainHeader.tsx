import { useLocalSearchParams, useRouter } from 'expo-router';
import { type RefObject, useState } from 'react';
import { Keyboard, type ViewInstance } from 'react-native';

import {
  ConversationSourceBoundary,
  useConversationAgents,
} from '@/frontend/appShell/conversation';
import {
  type ChatRouteParamsInput,
  chatRouteParams,
  parseChatRoute,
} from '@/frontend/appShell/navigation/chat';

import type { HeaderToolbarAction } from '../components/HeaderAction';
import { useMainHeaderAgent } from './MainHeaderAgentLabel';
import { MainHeaderAgentPickerSheet } from './MainHeaderAgentPickerSheet';
import { MainHeaderView } from './MainHeaderView/MainHeaderView';

export function MainHeader({
  blurTarget,
  hidden,
  actions,
}: {
  blurTarget: RefObject<ViewInstance | null>;
  hidden?: boolean;
  actions?: readonly HeaderToolbarAction[];
}) {
  const { agent, openNewSession } = useMainHeaderAgent();
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <>
      <MainHeaderView
        agent={agent}
        blurTarget={blurTarget}
        hidden={hidden}
        actions={actions}
        onNewChat={openNewSession}
        onAgentPress={() => {
          Keyboard.dismiss();
          setPickerOpen(true);
        }}
      />
      <ConversationSourceBoundary source={{ kind: 'local' }} fallback={() => null}>
        <LocalAgentPicker
          currentAgentId={agent?.id}
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
        />
      </ConversationSourceBoundary>
    </>
  );
}

function LocalAgentPicker({
  currentAgentId,
  open,
  onClose,
}: {
  currentAgentId?: string;
  open: boolean;
  onClose(): void;
}) {
  const catalog = useConversationAgents();
  const router = useRouter();
  const route = parseChatRoute(useLocalSearchParams<ChatRouteParamsInput>());
  const workspaceDraftId =
    route.status === 'ready' && route.target.kind === 'draft'
      ? route.target.workspaceDraftId
      : undefined;
  return (
    <MainHeaderAgentPickerSheet
      currentAgentId={currentAgentId}
      catalog={catalog}
      open={open}
      onClose={onClose}
      onSelect={(agentId) =>
        router.setParams(chatRouteParams({ agentId, kind: 'draft', workspaceDraftId }))
      }
      onEdit={(agentId) => router.push({ params: { agentId }, pathname: '/agents/[agentId]/edit' })}
      onCreate={() => router.push({ params: { startChat: 'true' }, pathname: '/agents/new' })}
    />
  );
}
