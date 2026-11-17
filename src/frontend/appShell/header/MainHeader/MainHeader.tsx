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
import { AgentEditor } from '@/frontend/components/AgentEditor';
import { AgentPickerSheet } from '@/frontend/components/AgentPicker';

import type { HeaderToolbarAction } from '../components/HeaderAction';
import { useMainHeaderAgent } from './MainHeaderAgentLabel';
import { MainHeaderView } from './MainHeaderView/MainHeaderView';

export function MainHeader({
  blurTarget,
  hidden,
  actions,
  selection,
}: {
  blurTarget: RefObject<ViewInstance | null>;
  hidden?: boolean;
  actions?: readonly HeaderToolbarAction[];
  selection?: { selectedCount: number; onExit(): void };
}) {
  const { agent, openNewSession } = useMainHeaderAgent();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string>();
  return (
    <>
      <MainHeaderView
        agent={agent}
        blurTarget={blurTarget}
        hidden={hidden}
        actions={actions}
        selection={selection}
        onNewChat={openNewSession}
        onAgentPress={() => {
          Keyboard.dismiss();
          setEditingAgentId(agent?.id);
        }}
        onAgentSwitch={() => {
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
      {editingAgentId ? (
        <AgentEditor
          agentId={editingAgentId}
          onClose={() => setEditingAgentId(undefined)}
          presentation="sheet"
        />
      ) : null}
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
    <AgentPickerSheet
      testID="main-header-agent-picker"
      currentAgentId={currentAgentId}
      catalog={catalog}
      open={open}
      onClose={onClose}
      onEdit={(agentId) => router.push({ params: { agentId }, pathname: '/agents/[agentId]/edit' })}
      onCreate={() => router.push({ params: { startChat: 'true' }, pathname: '/agents/new' })}
      onSelect={(agentId) =>
        router.setParams(chatRouteParams({ agentId, kind: 'draft', workspaceDraftId }))
      }
    />
  );
}
