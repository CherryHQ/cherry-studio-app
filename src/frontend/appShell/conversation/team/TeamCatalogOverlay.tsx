import { createContext, type PropsWithChildren, type ReactNode, use, useMemo } from 'react';

import { useConversationTarget } from '@/frontend/appShell/navigation/chat';

import type { AgentSummary, ConversationSource, ConversationSummary } from '../contracts';
import {
  ConversationSourceBoundary,
  ConversationSourceScope,
  useConversationSource,
} from '../ConversationSourceBoundary';
import { useConversationAgents, useConversationSessions } from '../useConversationCatalog';
import { useTeamAgentState } from './useTeamAgentState';

function renderPrimaryScopeFallback(primarySource: ConversationSource, children: ReactNode) {
  return <ConversationSourceScope value={primarySource}>{children}</ConversationSourceScope>;
}

export type TeamCatalogOverlay = {
  source: ConversationSource;
  agents: readonly AgentSummary[];
  sessions: readonly ConversationSummary[];
  selectedSessionId?: string;
  isAgentsLoading?: boolean;
};

const TeamCatalogOverlayContext = createContext<TeamCatalogOverlay | null>(null);

/** Reads the phone's overlaid Team Agent catalog when mounted; returns null elsewhere. */
export function useOptionalTeamCatalogOverlay() {
  return use(TeamCatalogOverlayContext);
}

/**
 * Exposes the enterprise Team Agent catalog alongside the local conversation source without
 * shadowing `ConversationSourceBoundary` for its children.
 */
export function TeamCatalogOverlayProvider({
  enabled = true,
  loadSessions = false,
  children,
}: PropsWithChildren<{
  enabled?: boolean;
  loadSessions?: boolean;
}>) {
  const primarySource = useConversationSource();
  const { state } = useTeamAgentState();

  if (!state.context) {
    return children;
  }

  return (
    <ConversationSourceBoundary
      key={state.context.key}
      source={{ kind: 'team', bindingId: state.context.bindingId }}
      fallback={() => renderPrimaryScopeFallback(primarySource, children)}
    >
      <TeamCatalogOverlayReader
        enabled={enabled}
        loadSessions={loadSessions}
        primarySource={primarySource}
      >
        {children}
      </TeamCatalogOverlayReader>
    </ConversationSourceBoundary>
  );
}

function TeamCatalogOverlayReader({
  children,
  enabled,
  loadSessions,
  primarySource,
}: PropsWithChildren<{
  enabled: boolean;
  loadSessions: boolean;
  primarySource: ConversationSource;
}>) {
  const source = useConversationSource();
  const agentsQuery = useConversationAgents(enabled);
  const sessionsQuery = useConversationSessions(undefined, enabled && loadSessions);
  const target = useConversationTarget(source.ref);
  const value = useMemo<TeamCatalogOverlay>(
    () => ({
      source,
      agents: agentsQuery.items,
      sessions: sessionsQuery.items,
      selectedSessionId: target.sessionId,
      isAgentsLoading: agentsQuery.isLoading,
    }),
    [source, agentsQuery.items, agentsQuery.isLoading, sessionsQuery.items, target.sessionId],
  );

  return (
    <TeamCatalogOverlayContext value={value}>
      <ConversationSourceScope value={primarySource}>{children}</ConversationSourceScope>
    </TeamCatalogOverlayContext>
  );
}
