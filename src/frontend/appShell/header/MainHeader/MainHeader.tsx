import { useRouter } from 'expo-router';
import { type RefObject, useState } from 'react';
import { Keyboard, type View } from 'react-native';

import {
  ConversationSourceBoundary,
  useConversationAgents,
} from '@/frontend/appShell/conversation';
import { chatRouteParams } from '@/frontend/appShell/navigation/chat';

import { useMainHeaderAgent } from './MainHeaderAgentLabel';
import { MainHeaderAgentPickerSheet } from './MainHeaderAgentPickerSheet';
import { MainHeaderView } from './MainHeaderView/MainHeaderView';

export function MainHeader({ blurTarget }: { blurTarget: RefObject<View | null> }) {
  const { agent, openNewSession } = useMainHeaderAgent();
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <>
      <MainHeaderView
        agent={agent}
        blurTarget={blurTarget}
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
  return (
    <MainHeaderAgentPickerSheet
      currentAgentId={currentAgentId}
      catalog={catalog}
      open={open}
      onClose={onClose}
      onSelect={(agentId) => router.setParams(chatRouteParams({ agentId, kind: 'draft' }))}
      onEdit={(agentId) => router.push({ params: { agentId }, pathname: '/agents/[agentId]/edit' })}
      onCreate={() => router.push({ params: { startChat: 'true' }, pathname: '/agents/new' })}
    />
  );
}
