import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';

import {
  ConversationSourceBoundary,
  useConversationAgents,
} from '@/frontend/appShell/conversation';
import {
  TeamCatalogOverlayProvider,
  useOptionalTeamCatalogOverlay,
} from '@/frontend/appShell/conversation/team';
import {
  type ChatRouteParamsInput,
  chatHref,
  chatRouteParams,
  parseChatRoute,
  teamChatHref,
  useOptionalChatSource,
} from '@/frontend/appShell/navigation/chat';
import { AgentPickerSheet } from '@/frontend/components/AgentPicker';

export function UnifiedAgentPicker({
  currentAgentId,
  currentAgentSource,
  open,
  onClose,
}: {
  currentAgentId?: string;
  currentAgentSource: 'local' | 'team';
  open: boolean;
  onClose(): void;
}) {
  return (
    <ConversationSourceBoundary source={{ kind: 'local' }} fallback={() => null}>
      <TeamCatalogOverlayProvider enabled={open}>
        <UnifiedAgentPickerContent
          currentAgentId={currentAgentId}
          currentAgentSource={currentAgentSource}
          open={open}
          onClose={onClose}
        />
      </TeamCatalogOverlayProvider>
    </ConversationSourceBoundary>
  );
}

function UnifiedAgentPickerContent({
  currentAgentId,
  currentAgentSource,
  open,
  onClose,
}: {
  currentAgentId?: string;
  currentAgentSource: 'local' | 'team';
  open: boolean;
  onClose(): void;
}) {
  const localCatalog = useConversationAgents();
  const teamOverlay = useOptionalTeamCatalogOverlay();
  const chatSource = useOptionalChatSource();
  const router = useRouter();
  const route = parseChatRoute(useLocalSearchParams<ChatRouteParamsInput>());
  const workspaceDraftId =
    currentAgentSource === 'local' && route.status === 'ready' && route.target.kind === 'draft'
      ? route.target.workspaceDraftId
      : undefined;

  const items = useMemo(
    () => [...localCatalog.items, ...(teamOverlay?.agents ?? [])],
    [localCatalog.items, teamOverlay?.agents],
  );

  const catalog = useMemo(
    () => ({
      ...localCatalog,
      items,
      isLoading:
        localCatalog.isLoading || (items.length === 0 && Boolean(teamOverlay?.isAgentsLoading)),
      isError: localCatalog.isError && items.length === 0,
    }),
    [items, localCatalog, teamOverlay?.isAgentsLoading],
  );

  return (
    <AgentPickerSheet
      testID="main-header-agent-picker"
      catalog={catalog}
      currentAgentId={currentAgentId}
      currentAgentSource={currentAgentSource}
      searchable={items.length > 5 || Boolean(teamOverlay?.agents.length)}
      open={open}
      onClose={onClose}
      onEdit={(agentId) => router.push({ params: { agentId }, pathname: '/agents/[agentId]/edit' })}
      onCreate={() => router.push({ params: { startChat: 'true' }, pathname: '/agents/new' })}
      onSelect={(agentId, agent) => {
        if (agent.source?.kind === 'team') {
          const target = { bindingId: agent.source.bindingId, agentId };
          if (chatSource) chatSource.openTeam(target);
          else router.replace(teamChatHref(target));
          return;
        }

        const target = {
          agentId,
          kind: 'draft' as const,
          workspaceDraftId,
        };
        if (chatSource) chatSource.openLocal(target);
        else if (currentAgentSource === 'local') router.setParams(chatRouteParams(target));
        else router.replace(chatHref(target));
      }}
    />
  );
}
