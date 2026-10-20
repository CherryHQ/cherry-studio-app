import { ActionMenu, type MenuItem } from '@cherrystudio/ui/components';
import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { useAgentsApi } from '@/frontend/hooks/agent';
import type { Agent } from '@/shared/data/types/agent';

/**
 * Tap menu that hands content, such as a file or a reference, to an Agent the user picks. The
 * caller decides which Agents can use the content and what choosing one opens.
 */
export function AgentMenu({
  accepts,
  children,
  onSelect,
}: {
  /** Omits Agents that cannot use the content, such as minimal Agents for documents. */
  accepts?: (agent: Agent) => boolean;
  children: ReactElement;
  onSelect: (agent: Agent) => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const { agents, isLoading } = useAgentsApi();
  const eligible = accepts ? agents.filter(accepts) : agents;
  // With no Agent able to receive the content, creating one is the only next step.
  const items: MenuItem[] =
    eligible.length > 0
      ? eligible.map((agent) => ({
          id: `agent-${agent.id}`,
          label: agent.name,
          onPress: () => onSelect(agent),
        }))
      : isLoading
        ? []
        : [
            {
              id: 'agent-create',
              label: t('agent.create.title'),
              onPress: () => router.push('/agents/new'),
            },
          ];

  return <ActionMenu items={items}>{children}</ActionMenu>;
}
